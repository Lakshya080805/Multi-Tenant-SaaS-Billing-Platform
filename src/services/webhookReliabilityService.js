import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { executeRedisCommand } from '../config/redis.js';
import { enqueueWebhookRetryJob } from '../queues/jobQueueService.js';

const WEBHOOK_PREFIX = `${env.REDIS_PREFIX}:webhook`;
const DEDUPE_PREFIX = `${WEBHOOK_PREFIX}:dedupe`;
const RETRY_PREFIX = `${WEBHOOK_PREFIX}:retry`;
const DLQ_PREFIX = `${WEBHOOK_PREFIX}:dlq`;
const DLQ_LIST_KEY = `${DLQ_PREFIX}:events`;

const processingLocks = new Map();
const localDedupeStore = new Map();
const localRetryStore = new Map();
const localDlq = [];

const metrics = {
  processed: 0,
  duplicates: 0,
  replayRejected: 0,
  failures: 0,
  retried: 0,
  dlqRouted: 0
};

const DEFAULT_DEDUPE_TTL_SECONDS = env.WEBHOOK_DEDUPE_TTL_SECONDS || 24 * 60 * 60;
const DEFAULT_RETRY_COUNTER_TTL_SECONDS = env.WEBHOOK_RETRY_COUNTER_TTL_SECONDS || 24 * 60 * 60;
const DEFAULT_REPLAY_WINDOW_SECONDS = env.WEBHOOK_REPLAY_WINDOW_SECONDS || 15 * 60;
const DEFAULT_RETRY_MAX_ATTEMPTS = env.WEBHOOK_RETRY_MAX_ATTEMPTS || 3;
const DEFAULT_DLQ_MAX_ITEMS = env.WEBHOOK_DLQ_MAX_ITEMS || 500;
const PROCESSING_LOCK_TTL_MS = 20 * 1000;

function hashValue(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      const current = value[key];
      if (current !== undefined) {
        acc[key] = normalizeValue(current);
      }
      return acc;
    }, {});
}

function getLocalStoreValue(store, key) {
  const current = store.get(key);
  if (!current) {
    return null;
  }

  if (current.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return current.value;
}

function setLocalStoreValue(store, key, value, ttlMs) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

export function buildWebhookDedupeKey({ provider, eventId, signature, payload }) {
  const providerKey = String(provider || 'unknown');

  if (eventId) {
    return `${DEDUPE_PREFIX}:${providerKey}:event:${eventId}`;
  }

  const signatureHash = signature ? hashValue(signature).slice(0, 16) : 'nosig';
  const payloadHash = hashValue(JSON.stringify(normalizeValue(payload || {}))).slice(0, 16);
  return `${DEDUPE_PREFIX}:${providerKey}:sig:${signatureHash}:payload:${payloadHash}`;
}

export function extractWebhookTimestampMs(event = {}) {
  const candidates = [
    event.created_at,
    event.createdAt,
    event.timestamp,
    event.data?.created_at,
    event.data?.createdAt,
    event.payload?.created_at,
    event.payload?.createdAt
  ];

  for (const value of candidates) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'number') {
      return value > 1e12 ? value : value * 1000;
    }

    const dateTs = Date.parse(String(value));
    if (!Number.isNaN(dateTs)) {
      return dateTs;
    }
  }

  return null;
}

export function isWithinReplayWindow(eventTimestampMs, replayWindowSeconds = DEFAULT_REPLAY_WINDOW_SECONDS) {
  if (!eventTimestampMs) {
    return true;
  }

  const ageMs = Date.now() - eventTimestampMs;
  return ageMs <= replayWindowSeconds * 1000;
}

export async function isWebhookAlreadyProcessed(dedupeKey) {
  const localProcessed = getLocalStoreValue(localDedupeStore, dedupeKey);
  if (localProcessed) {
    return true;
  }

  const redisResult = await executeRedisCommand('GET', (client) => client.get(dedupeKey));
  return redisResult === 'processed';
}

export async function acquireWebhookProcessingLock(dedupeKey) {
  const lockKey = `${dedupeKey}:lock`;
  const lockToken = crypto.randomUUID();

  const redisResult = await executeRedisCommand('SET', (client) =>
    client.set(lockKey, lockToken, {
      NX: true,
      PX: PROCESSING_LOCK_TTL_MS
    })
  );

  if (redisResult === 'OK') {
    return {
      acquired: true,
      source: 'redis',
      key: lockKey,
      token: lockToken
    };
  }

  const localLock = getLocalStoreValue(processingLocks, lockKey);
  if (localLock) {
    return {
      acquired: false,
      source: 'local',
      key: lockKey,
      token: null
    };
  }

  setLocalStoreValue(processingLocks, lockKey, lockToken, PROCESSING_LOCK_TTL_MS);
  return {
    acquired: true,
    source: 'local',
    key: lockKey,
    token: lockToken
  };
}

export async function releaseWebhookProcessingLock(lock) {
  if (!lock?.acquired) {
    return;
  }

  if (lock.source === 'redis') {
    await executeRedisCommand('EVAL', (client) =>
      client.eval(
        'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
        {
          keys: [lock.key],
          arguments: [lock.token]
        }
      )
    );
    return;
  }

  const localLock = getLocalStoreValue(processingLocks, lock.key);
  if (localLock === lock.token) {
    processingLocks.delete(lock.key);
  }
}

export async function markWebhookProcessed(dedupeKey, ttlSeconds = DEFAULT_DEDUPE_TTL_SECONDS) {
  const result = await executeRedisCommand('SET', (client) =>
    client.set(dedupeKey, 'processed', {
      EX: ttlSeconds
    })
  );

  if (!result) {
    setLocalStoreValue(localDedupeStore, dedupeKey, 'processed', ttlSeconds * 1000);
  }

  metrics.processed += 1;
}

export async function incrementWebhookRetryCount(dedupeKey) {
  const retryKey = `${RETRY_PREFIX}:${dedupeKey}`;

  const redisCount = await executeRedisCommand('INCR', (client) => client.incr(retryKey));

  if (Number.isFinite(redisCount)) {
    await executeRedisCommand('EXPIRE', (client) =>
      client.expire(retryKey, DEFAULT_RETRY_COUNTER_TTL_SECONDS)
    );
    metrics.retried += 1;
    return redisCount;
  }

  const localCount = Number(getLocalStoreValue(localRetryStore, retryKey) || 0) + 1;
  setLocalStoreValue(localRetryStore, retryKey, localCount, DEFAULT_RETRY_COUNTER_TTL_SECONDS * 1000);
  metrics.retried += 1;
  return localCount;
}

export async function clearWebhookRetryCount(dedupeKey) {
  const retryKey = `${RETRY_PREFIX}:${dedupeKey}`;
  await executeRedisCommand('DEL', (client) => client.del(retryKey));
  localRetryStore.delete(retryKey);
}

export async function pushWebhookEventToDlq(entry) {
  const payload = {
    ...entry,
    deadLetteredAt: new Date().toISOString()
  };

  const serialized = JSON.stringify(payload);

  const lpushResult = await executeRedisCommand('LPUSH', (client) =>
    client.lPush(DLQ_LIST_KEY, serialized)
  );

  if (Number.isFinite(lpushResult)) {
    await executeRedisCommand('LTRIM', (client) =>
      client.lTrim(DLQ_LIST_KEY, 0, DEFAULT_DLQ_MAX_ITEMS - 1)
    );
  } else {
    localDlq.unshift(payload);
    if (localDlq.length > DEFAULT_DLQ_MAX_ITEMS) {
      localDlq.length = DEFAULT_DLQ_MAX_ITEMS;
    }
  }

  metrics.dlqRouted += 1;
}

export async function handleWebhookFailure({ dedupeKey, provider, event, error, metadata = {} }) {
  metrics.failures += 1;

  if (!dedupeKey) {
    return { retries: 0, routedToDlq: false };
  }

  const retries = await incrementWebhookRetryCount(dedupeKey);
  const routedToDlq = retries >= DEFAULT_RETRY_MAX_ATTEMPTS;

  if (!routedToDlq) {
    const queued = await enqueueWebhookRetryJob(
      {
        provider,
        dedupeKey,
        event,
        metadata,
        failureMessage: error?.message || 'unknown_error'
      },
      retries
    );

    if (queued) {
      logger.info('Webhook retry job queued', {
        provider,
        dedupeKey,
        retries,
        queue: queued.queueName,
        jobId: queued.id
      });
    }
  }

  if (routedToDlq) {
    await pushWebhookEventToDlq({
      provider,
      dedupeKey,
      retries,
      eventId: event?.id,
      eventType: event?.event || event?.type,
      errorMessage: error?.message || 'unknown_error',
      metadata,
      event
    });
  }

  return { retries, routedToDlq };
}

export function recordDuplicateWebhook() {
  metrics.duplicates += 1;
}

export function recordReplayRejectedWebhook() {
  metrics.replayRejected += 1;
}

export async function getWebhookDlqEvents(limit = 50) {
  const normalizedLimit = Math.max(Number.parseInt(limit, 10) || 50, 1);

  const redisItems = await executeRedisCommand('LRANGE', (client) =>
    client.lRange(DLQ_LIST_KEY, 0, normalizedLimit - 1)
  );

  if (Array.isArray(redisItems) && redisItems.length > 0) {
    return redisItems
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);
  }

  return localDlq.slice(0, normalizedLimit);
}

export async function getWebhookReliabilityMetrics() {
  const redisDepth = await executeRedisCommand('LLEN', (client) => client.lLen(DLQ_LIST_KEY));
  const deadLetterDepth = Number.isFinite(redisDepth) ? redisDepth : localDlq.length;

  return {
    ...metrics,
    replayWindowSeconds: DEFAULT_REPLAY_WINDOW_SECONDS,
    retryMaxAttempts: DEFAULT_RETRY_MAX_ATTEMPTS,
    dedupeTtlSeconds: DEFAULT_DEDUPE_TTL_SECONDS,
    deadLetterDepth
  };
}

export function resetWebhookReliabilityStateForTests() {
  localDedupeStore.clear();
  localRetryStore.clear();
  processingLocks.clear();
  localDlq.length = 0;

  metrics.processed = 0;
  metrics.duplicates = 0;
  metrics.replayRejected = 0;
  metrics.failures = 0;
  metrics.retried = 0;
  metrics.dlqRouted = 0;

  logger.debug('Webhook reliability local state reset');
}

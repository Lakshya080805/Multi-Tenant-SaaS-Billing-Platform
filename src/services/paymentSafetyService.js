import crypto from 'crypto';
import { StatusCodes } from 'http-status-codes';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { executeRedisCommand } from '../config/redis.js';
import { ApiError } from '../utils/ApiError.js';

const IDEMPOTENCY_PREFIX = `${env.REDIS_PREFIX}:idempotency`;
const PAYMENT_LOCK_PREFIX = `${env.REDIS_PREFIX}:lock:payment`;

const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_LOCK_TTL_MS = 10 * 1000;

const localIdempotencyStore = new Map();
const localLockStore = new Map();

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

export function buildIdempotencyStorageKey({ organizationId, scope, idempotencyKey }) {
  return [
    IDEMPOTENCY_PREFIX,
    'org',
    String(organizationId),
    String(scope),
    String(idempotencyKey)
  ].join(':');
}

export function buildRequestFingerprint({ method, scope, body, params, query }) {
  const payload = normalizeValue({ method, scope, body, params, query });
  const serialized = JSON.stringify(payload);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

export async function getIdempotencyResult(storageKey) {
  const localResult = getLocalStoreValue(localIdempotencyStore, storageKey);

  const redisValue = await executeRedisCommand('GET', (client) => client.get(storageKey));
  if (redisValue) {
    try {
      return JSON.parse(redisValue);
    } catch (error) {
      logger.warn('Failed to parse idempotency payload from Redis', {
        storageKey,
        error: error.message
      });
      return null;
    }
  }

  return localResult;
}

export async function setIdempotencyResult(storageKey, payload, ttlSeconds = DEFAULT_IDEMPOTENCY_TTL_SECONDS) {
  const serializedPayload = JSON.stringify(payload);

  const result = await executeRedisCommand('SET', (client) =>
    client.set(storageKey, serializedPayload, {
      EX: ttlSeconds
    })
  );

  if (!result) {
    setLocalStoreValue(localIdempotencyStore, storageKey, payload, ttlSeconds * 1000);
    logger.debug('Stored idempotency payload in local fallback store', { storageKey, ttlSeconds });
    return false;
  }

  return true;
}

function buildPaymentLockKey({ organizationId, invoiceId, razorpayOrderId }) {
  if (invoiceId) {
    return `${PAYMENT_LOCK_PREFIX}:org:${organizationId}:invoice:${invoiceId}`;
  }

  if (razorpayOrderId) {
    return `${PAYMENT_LOCK_PREFIX}:org:${organizationId}:order:${razorpayOrderId}`;
  }

  throw new ApiError(StatusCodes.BAD_REQUEST, 'Payment lock target is required');
}

async function acquireLocalLock(lockKey, token, ttlMs) {
  const current = getLocalStoreValue(localLockStore, lockKey);
  if (current) {
    return {
      acquired: false,
      source: 'local',
      token: null,
      key: lockKey
    };
  }

  setLocalStoreValue(localLockStore, lockKey, token, ttlMs);

  return {
    acquired: true,
    source: 'local',
    token,
    key: lockKey
  };
}

export async function acquirePaymentTransitionLock(target, ttlMs = DEFAULT_LOCK_TTL_MS) {
  const lockKey = buildPaymentLockKey(target);
  const token = crypto.randomUUID();

  const result = await executeRedisCommand('SET', (client) =>
    client.set(lockKey, token, {
      NX: true,
      PX: ttlMs
    })
  );

  if (result === 'OK') {
    return {
      acquired: true,
      source: 'redis',
      token,
      key: lockKey
    };
  }

  return acquireLocalLock(lockKey, token, ttlMs);
}

export async function releasePaymentTransitionLock(lock) {
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

  const current = getLocalStoreValue(localLockStore, lock.key);
  if (current === lock.token) {
    localLockStore.delete(lock.key);
  }
}

export async function withPaymentTransitionLock(target, worker, ttlMs = DEFAULT_LOCK_TTL_MS) {
  const lock = await acquirePaymentTransitionLock(target, ttlMs);

  if (!lock.acquired) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'A payment operation is already in progress for this resource. Please retry.'
    );
  }

  try {
    return await worker();
  } finally {
    await releasePaymentTransitionLock(lock);
  }
}

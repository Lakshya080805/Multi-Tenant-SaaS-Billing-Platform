import crypto from 'crypto';
import os from 'os';
import process from 'process';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { executeRedisCommand } from '../config/redis.js';

const localLockStore = new Map();
const DEFAULT_TTL_MS = env.SCHEDULER_LEADER_LOCK_TTL_MS || 120000;
const LOCK_PREFIX = `${env.REDIS_PREFIX}:scheduler:leader`;

function getDefaultInstanceId() {
  if (env.SCHEDULER_INSTANCE_ID && env.SCHEDULER_INSTANCE_ID.trim()) {
    return env.SCHEDULER_INSTANCE_ID.trim();
  }

  return `${os.hostname()}:${process.pid}`;
}

function getLocalLockValue(lockKey) {
  const current = localLockStore.get(lockKey);
  if (!current) {
    return null;
  }

  if (current.expiresAt <= Date.now()) {
    localLockStore.delete(lockKey);
    return null;
  }

  return current;
}

function setLocalLockValue(lockKey, lockToken, ttlMs) {
  localLockStore.set(lockKey, {
    token: lockToken,
    expiresAt: Date.now() + ttlMs
  });
}

export function buildSchedulerLeaderLockKey(taskName) {
  return `${LOCK_PREFIX}:${taskName}`;
}

export async function acquireSchedulerLeaderLock(options = {}) {
  const taskName = options.taskName || 'invoice-reminder-daily';
  const ttlMs = Number(options.ttlMs) || DEFAULT_TTL_MS;
  const instanceId = options.instanceId || getDefaultInstanceId();
  const lockKey = buildSchedulerLeaderLockKey(taskName);
  const lockToken = `${instanceId}:${crypto.randomUUID()}`;

  const redisResult = await executeRedisCommand('SET', (client) =>
    client.set(lockKey, lockToken, {
      NX: true,
      PX: ttlMs
    })
  );

  if (redisResult === 'OK') {
    return {
      acquired: true,
      source: 'redis',
      key: lockKey,
      token: lockToken,
      taskName,
      instanceId,
      ttlMs
    };
  }

  const current = getLocalLockValue(lockKey);
  if (current) {
    return {
      acquired: false,
      source: 'local',
      key: lockKey,
      token: null,
      taskName,
      instanceId,
      ttlMs
    };
  }

  setLocalLockValue(lockKey, lockToken, ttlMs);

  return {
    acquired: true,
    source: 'local',
    key: lockKey,
    token: lockToken,
    taskName,
    instanceId,
    ttlMs
  };
}

export async function releaseSchedulerLeaderLock(lock) {
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

  const current = getLocalLockValue(lock.key);
  if (current?.token === lock.token) {
    localLockStore.delete(lock.key);
  }
}

export async function withSchedulerLeaderLock(options, worker) {
  const lock = await acquireSchedulerLeaderLock(options);

  if (!lock.acquired) {
    logger.info('Scheduler tick skipped: leader lock not acquired', {
      taskName: lock.taskName,
      instanceId: lock.instanceId,
      source: lock.source
    });
    return {
      executed: false,
      reason: 'leader_lock_not_acquired'
    };
  }

  try {
    const result = await worker(lock);
    return {
      executed: true,
      source: lock.source,
      result
    };
  } finally {
    await releaseSchedulerLeaderLock(lock);
  }
}

export function resetSchedulerLeaderStateForTests() {
  localLockStore.clear();
}

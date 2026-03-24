import { createClient } from 'redis';
import { env } from './env.js';
import { logger } from './logger.js';

let redisClient;
let connectPromise;

const circuitBreaker = {
  state: 'closed',
  failureCount: 0,
  openedAt: null,
  lastError: null
};

function resetCircuitBreaker() {
  circuitBreaker.state = 'closed';
  circuitBreaker.failureCount = 0;
  circuitBreaker.openedAt = null;
  circuitBreaker.lastError = null;
}

function openCircuitBreaker(error) {
  circuitBreaker.state = 'open';
  circuitBreaker.openedAt = Date.now();
  circuitBreaker.lastError = error?.message || 'unknown_redis_error';
}

function canAttemptWhileOpen() {
  if (circuitBreaker.state !== 'open') {
    return true;
  }

  const elapsedMs = Date.now() - (circuitBreaker.openedAt || 0);
  if (elapsedMs >= env.REDIS_CIRCUIT_BREAKER_COOLDOWN_MS) {
    circuitBreaker.state = 'half-open';
    return true;
  }

  return false;
}

function buildReconnectStrategy() {
  return (retries) => {
    const exponential = env.REDIS_RETRY_BASE_DELAY_MS * (2 ** retries);
    return Math.min(exponential, env.REDIS_RETRY_MAX_DELAY_MS);
  };
}

function parseRedisInfo(info) {
  const metricKeys = new Set([
    'redis_version',
    'uptime_in_seconds',
    'connected_clients',
    'used_memory_human',
    'used_memory_peak_human',
    'total_connections_received',
    'total_commands_processed',
    'instantaneous_ops_per_sec',
    'keyspace_hits',
    'keyspace_misses'
  ]);

  return info
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes(':'))
    .reduce((acc, line) => {
      const [key, value] = line.split(':', 2);
      if (!metricKeys.has(key)) {
        return acc;
      }
      acc[key] = Number.isNaN(Number(value)) ? value : Number(value);
      return acc;
    }, {});
}

function createRedisConnection() {
  const client = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: buildReconnectStrategy()
    }
  });

  client.on('connect', () => {
    logger.info('Redis socket connecting');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
    resetCircuitBreaker();
  });

  client.on('error', (error) => {
    logger.error('Redis client error', { error: error.message });
  });

  client.on('reconnecting', () => {
    logger.warn('Redis client reconnecting');
  });

  client.on('end', () => {
    logger.warn('Redis connection closed');
  });

  return client;
}

export async function connectRedis() {
  if (!env.REDIS_ENABLED) {
    logger.info('Redis disabled by configuration');
    return null;
  }

  if (redisClient?.isReady) {
    return redisClient;
  }

  if (connectPromise) {
    return connectPromise;
  }

  redisClient = createRedisConnection();
  connectPromise = redisClient
    .connect()
    .then(() => redisClient)
    .catch((error) => {
      logger.error('Failed to connect to Redis at startup', { error: error.message });
      openCircuitBreaker(error);
      return null;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

export async function disconnectRedis() {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.quit();
  } catch (error) {
    logger.warn('Redis quit failed, force disconnecting', { error: error.message });
    await redisClient.disconnect();
  } finally {
    redisClient = null;
    resetCircuitBreaker();
  }
}

export function getRedisClient() {
  return redisClient;
}

export function getRedisCircuitState() {
  return { ...circuitBreaker };
}

export async function executeRedisCommand(commandName, operation) {
  if (!env.REDIS_ENABLED) {
    return null;
  }

  if (!redisClient?.isReady) {
    await connectRedis();
  }

  if (!redisClient?.isReady) {
    return null;
  }

  if (!canAttemptWhileOpen()) {
    logger.warn('Redis circuit breaker open; command skipped', { commandName });
    return null;
  }

  try {
    const result = await operation(redisClient);
    if (circuitBreaker.state === 'half-open') {
      resetCircuitBreaker();
    }
    return result;
  } catch (error) {
    circuitBreaker.failureCount += 1;
    circuitBreaker.lastError = error.message;

    const thresholdReached =
      circuitBreaker.failureCount >= env.REDIS_CIRCUIT_BREAKER_FAILURE_THRESHOLD;

    if (thresholdReached) {
      openCircuitBreaker(error);
      logger.error('Redis circuit breaker opened', {
        commandName,
        failureCount: circuitBreaker.failureCount,
        error: error.message
      });
    } else {
      logger.warn('Redis command failed', {
        commandName,
        failureCount: circuitBreaker.failureCount,
        error: error.message
      });
    }

    return null;
  }
}

export async function getRedisHealth() {
  if (!env.REDIS_ENABLED) {
    return {
      enabled: false,
      status: 'disabled'
    };
  }

  if (!redisClient?.isReady) {
    await connectRedis();
  }

  if (!redisClient?.isReady) {
    return {
      enabled: true,
      status: 'disconnected',
      circuitBreaker: getRedisCircuitState()
    };
  }

  const ping = await executeRedisCommand('PING', (client) => client.ping());
  const info = await executeRedisCommand('INFO', (client) => client.info());

  const parsedInfo = info ? parseRedisInfo(info) : {};

  const hits = Number(parsedInfo.keyspace_hits || 0);
  const misses = Number(parsedInfo.keyspace_misses || 0);
  const lookups = hits + misses;

  return {
    enabled: true,
    status: ping === 'PONG' ? 'connected' : 'degraded',
    ping,
    metrics: {
      ...parsedInfo,
      cache_hit_ratio: lookups > 0 ? Number((hits / lookups).toFixed(4)) : 0
    },
    circuitBreaker: getRedisCircuitState()
  };
}

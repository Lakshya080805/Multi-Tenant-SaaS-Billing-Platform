import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { executeRedisCommand } from '../config/redis.js';

const cacheMetrics = {
  reads: 0,
  writes: 0,
  deletes: 0,
  hits: 0,
  misses: 0,
  mgetReads: 0,
  mgetHits: 0,
  mgetMisses: 0,
  errors: 0
};

const CACHE_PREFIX = `${env.REDIS_PREFIX}:cache`;

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

function hashFilters(filters = {}) {
  const normalized = normalizeValue(filters);
  const serialized = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

function buildCacheKey(...parts) {
  return [CACHE_PREFIX, ...parts.map((part) => String(part))].join(':');
}

function parseCachedValue(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return raw;
  }
}

export const keyBuilders = {
  dashboard(organizationId, metricName) {
    return buildCacheKey('org', organizationId, 'dashboard', metricName);
  },

  detail(resource, organizationId, entityId) {
    return buildCacheKey('org', organizationId, 'detail', resource, entityId);
  },

  list(resource, organizationId, filters = {}) {
    return buildCacheKey('org', organizationId, 'list', resource, hashFilters(filters));
  },

  invoiceDetail(organizationId, invoiceId) {
    return this.detail('invoices', organizationId, invoiceId);
  },

  clientDetail(organizationId, clientId) {
    return this.detail('clients', organizationId, clientId);
  },

  invoiceList(organizationId, filters = {}) {
    return this.list('invoices', organizationId, filters);
  },

  clientList(organizationId, filters = {}) {
    return this.list('clients', organizationId, filters);
  }
};

export async function cacheGet(key, logContext = {}) {
  cacheMetrics.reads += 1;

  const value = await executeRedisCommand('GET', (client) => client.get(key));

  if (value === null || value === undefined) {
    cacheMetrics.misses += 1;
    logger.debug('Cache miss', { key, ...logContext });
    return null;
  }

  cacheMetrics.hits += 1;
  logger.debug('Cache hit', { key, ...logContext });
  return parseCachedValue(value);
}

export async function cacheSet(key, value, options = {}) {
  cacheMetrics.writes += 1;
  const ttlSeconds = options.ttlSeconds ?? 60;

  const payload = JSON.stringify(value);
  const result = await executeRedisCommand('SET', (client) =>
    client.set(key, payload, {
      EX: ttlSeconds
    })
  );

  if (!result) {
    cacheMetrics.errors += 1;
    logger.debug('Cache set skipped or failed', { key, ttlSeconds, ...options.logContext });
    return false;
  }

  logger.debug('Cache set', { key, ttlSeconds, ...options.logContext });
  return true;
}

export async function cacheMGet(keys = [], logContext = {}) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return [];
  }

  cacheMetrics.mgetReads += 1;

  const values = await executeRedisCommand('MGET', (client) => client.mGet(keys));

  if (!values) {
    cacheMetrics.errors += 1;
    logger.debug('Cache mget skipped or failed', { keyCount: keys.length, ...logContext });
    return keys.map(() => null);
  }

  return values.map((value, index) => {
    if (value === null || value === undefined) {
      cacheMetrics.mgetMisses += 1;
      logger.debug('Cache mget miss', { key: keys[index], ...logContext });
      return null;
    }

    cacheMetrics.mgetHits += 1;
    logger.debug('Cache mget hit', { key: keys[index], ...logContext });
    return parseCachedValue(value);
  });
}

export async function cacheDel(keys, logContext = {}) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  if (keyList.length === 0) {
    return 0;
  }

  cacheMetrics.deletes += 1;

  const deletedCount = await executeRedisCommand('DEL', (client) => client.del(keyList));

  if (!Number.isFinite(deletedCount)) {
    cacheMetrics.errors += 1;
    logger.debug('Cache delete skipped or failed', { keyCount: keyList.length, ...logContext });
    return 0;
  }

  logger.debug('Cache delete', { keyCount: keyList.length, deletedCount, ...logContext });
  return deletedCount;
}

export async function getOrSetCache(key, loader, options = {}) {
  const cached = await cacheGet(key, options.logContext);
  if (cached !== null) {
    return cached;
  }

  const loaded = await loader();
  await cacheSet(key, loaded, options);
  return loaded;
}

export function getCacheMetrics() {
  const directLookups = cacheMetrics.hits + cacheMetrics.misses;
  const mgetLookups = cacheMetrics.mgetHits + cacheMetrics.mgetMisses;

  return {
    ...cacheMetrics,
    directHitRatio: directLookups > 0 ? Number((cacheMetrics.hits / directLookups).toFixed(4)) : 0,
    mgetHitRatio: mgetLookups > 0 ? Number((cacheMetrics.mgetHits / mgetLookups).toFixed(4)) : 0
  };
}

/**
 * Find all cache keys matching a pattern using Redis SCAN (non-blocking)
 * @param {string} pattern - Redis glob pattern (e.g., "cache:org:123:*")
 * @returns {Promise<string[]>} Array of matching keys
 */
async function scanCacheByPattern(pattern) {
  const matchedKeys = [];

  try {
    const scanResult = await executeRedisCommand('SCAN', (client) => {
      let cursorStr = '0';
      let done = false;

      // Prevent infinite loops in scan
      const maxIterations = 1000;
      let iterations = 0;

      const scanAsync = async () => {
        while (!done && iterations < maxIterations) {
          iterations += 1;

          const scanResponse = await client.scan(cursorStr, {
            MATCH: pattern,
            COUNT: 100
          });

          const nextCursor = Array.isArray(scanResponse)
            ? scanResponse[0]
            : String(scanResponse?.cursor ?? '0');
          const keys = Array.isArray(scanResponse)
            ? scanResponse[1]
            : scanResponse?.keys;

          matchedKeys.push(...(keys || []));
          cursorStr = nextCursor;

          if (nextCursor === '0') {
            done = true;
          }
        }

        return matchedKeys;
      };

      return scanAsync();
    });

    return scanResult || matchedKeys;
  } catch (error) {
    logger.warn('Cache pattern scan failed', { pattern, error: error.message });
    return [];
  }
}

/**
 * Invalidate all dashboard metrics for an organization
 * Deletes all cache:org:{id}:dashboard:* keys
 */
export async function invalidateDashboardMetrics(organizationId, logContext = {}) {
  const pattern = buildCacheKey('org', organizationId, 'dashboard', '*');
  const keys = await scanCacheByPattern(pattern);

  if (keys.length === 0) {
    logger.debug('No dashboard metrics to invalidate', { organizationId, ...logContext });
    return 0;
  }

  const deleted = await cacheDel(keys, { ...logContext, domain: 'invalidation' });
  logger.debug('Dashboard metrics invalidated', { organizationId, count: deleted, ...logContext });
  return deleted;
}

/**
 * Invalidate a single detail cache key for a resource
 */
export async function invalidateDetailKey(resource, organizationId, entityId, logContext = {}) {
  if (!entityId) {
    return 0;
  }

  const key = keyBuilders.detail(resource, organizationId, entityId);
  const deleted = await cacheDel(key, { ...logContext, domain: 'invalidation', resource });

  logger.debug('Detail key invalidated', {
    organizationId,
    resource,
    entityId,
    count: deleted,
    ...logContext
  });

  return deleted;
}

/**
 * Invalidate all list cache keys for a resource and tenant
 */
export async function invalidateListKeys(resource, organizationId, logContext = {}) {
  const pattern = buildCacheKey('org', organizationId, 'list', resource, '*');
  const keys = await scanCacheByPattern(pattern);

  if (keys.length === 0) {
    logger.debug('No list keys to invalidate', { organizationId, resource, ...logContext });
    return 0;
  }

  const deleted = await cacheDel(keys, { ...logContext, domain: 'invalidation', resource });
  logger.debug('List keys invalidated', { organizationId, resource, count: deleted, ...logContext });
  return deleted;
}

/**
 * Invalidate all invoice list caches for an organization
 * Deletes all cache:org:{id}:list:invoices:* keys
 */
export async function invalidateInvoiceLists(organizationId, logContext = {}) {
  return invalidateListKeys('invoices', organizationId, logContext);
}

/**
 * Invalidate all client list caches for an organization
 * Deletes all cache:org:{id}:list:clients:* keys
 */
export async function invalidateClientLists(organizationId, logContext = {}) {
  return invalidateListKeys('clients', organizationId, logContext);
}

/**
 * Comprehensive invalidation for invoice-related data
 * Invalidates: invoice lists + all dashboard metrics (since dashboard shows invoice stats)
 */
export async function invalidateInvoiceRelatedCache(organizationId, logContext = {}) {
  const invoiceListsDeleted = await invalidateInvoiceLists(organizationId, logContext);
  const dashboardDeleted = await invalidateDashboardMetrics(organizationId, logContext);

  const totalDeleted = invoiceListsDeleted + dashboardDeleted;
  logger.info('Invoice-related cache invalidated', { organizationId, totalDeleted, ...logContext });
  return totalDeleted;
}

/**
 * Comprehensive invalidation for client-related data
 * Invalidates: client lists + all dashboard metrics (since dashboard shows client stats)
 */
export async function invalidateClientRelatedCache(organizationId, logContext = {}) {
  const clientListsDeleted = await invalidateClientLists(organizationId, logContext);
  const dashboardDeleted = await invalidateDashboardMetrics(organizationId, logContext);

  const totalDeleted = clientListsDeleted + dashboardDeleted;
  logger.info('Client-related cache invalidated', { organizationId, totalDeleted, ...logContext });
  return totalDeleted;
}

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

process.env.ENABLE_RATE_LIMIT_IN_TEST = 'true';
process.env.FORCE_REDIS_IN_TEST = 'true';
process.env.REDIS_ENABLED = 'true';

const sharedBuckets = new Map();

class MockRedisStore {
  constructor(options = {}) {
    this.windowMs = 15 * 60 * 1000;
    this.prefix = options.prefix || 'rate-limit:';
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const now = Date.now();
    const namespacedKey = `${this.prefix}${key}`;
    const existing = sharedBuckets.get(namespacedKey);

    if (!existing || existing.resetTime <= now) {
      const resetTime = now + this.windowMs;
      sharedBuckets.set(namespacedKey, {
        hits: 1,
        resetTime
      });
      return {
        totalHits: 1,
        resetTime: new Date(resetTime)
      };
    }

    existing.hits += 1;
    return {
      totalHits: existing.hits,
      resetTime: new Date(existing.resetTime)
    };
  }

  async decrement(key) {
    const namespacedKey = `${this.prefix}${key}`;
    const existing = sharedBuckets.get(namespacedKey);
    if (existing && existing.hits > 0) {
      existing.hits -= 1;
    }
  }

  async resetKey(key) {
    sharedBuckets.delete(`${this.prefix}${key}`);
  }
}

await jest.unstable_mockModule('rate-limit-redis', () => ({
  RedisStore: MockRedisStore
}));

await jest.unstable_mockModule('../../src/config/redis.js', () => ({
  getRedisClient: () => ({
    isReady: true,
    sendCommand: async () => 'OK'
  }),
  getRedisCircuitState: () => ({ state: 'closed' })
}));

const { authRateLimiter } = await import('../../src/middleware/rateLimitMiddleware.js');

describe('Multi-instance rate limiting consistency', () => {
  beforeEach(() => {
    sharedBuckets.clear();
  });

  function makeApp() {
    const app = express();
    app.use(authRateLimiter);
    app.post('/auth/login', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  test('shares limits across two app instances via redis-backed store', async () => {
    const appA = makeApp();
    const appB = makeApp();

    for (let index = 0; index < 10; index += 1) {
      const res = await request(appA)
        .post('/auth/login')
        .send({ email: 'a@test.com', password: 'x' });
      expect(res.status).toBe(200);
    }

    for (let index = 0; index < 10; index += 1) {
      const res = await request(appB)
        .post('/auth/login')
        .send({ email: 'a@test.com', password: 'x' });
      expect(res.status).toBe(200);
    }

    const blocked = await request(appA)
      .post('/auth/login')
      .send({ email: 'a@test.com', password: 'x' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(String(blocked.body.message || '')).toMatch(/too many authentication attempts/i);
  });
});

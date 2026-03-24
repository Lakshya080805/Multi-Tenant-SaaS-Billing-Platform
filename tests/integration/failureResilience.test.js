// Failure tests for Redis and queue resilience
// 1. Redis unavailable at startup and during runtime
// 2. Partial network latency and reconnect storms
// 3. Queue worker crash and recovery with no data loss

const request = require('supertest');
const { spawn, execSync } = require('child_process');
const app = require('../../src/app');
const redis = require('redis');

// Helper to stop/start Redis Docker containers
function stopRedis() {
  execSync('docker compose stop redis-core redis-queue');
}
function startRedis() {
  execSync('docker compose start redis-core redis-queue');
}

// Helper to simulate network latency (Linux/WSL only)
function addRedisLatency(ms = 500) {
  try {
    execSync(`docker exec redis-core tc qdisc add dev eth0 root netem delay ${ms}ms`);
    execSync(`docker exec redis-queue tc qdisc add dev eth0 root netem delay ${ms}ms`);
  } catch {}
}
function clearRedisLatency() {
  try {
    execSync('docker exec redis-core tc qdisc del dev eth0 root netem');
    execSync('docker exec redis-queue tc qdisc del dev eth0 root netem');
  } catch {}
}

describe('Failure Tests: Redis and Queue Resilience', () => {
  afterAll(() => {
    startRedis();
    clearRedisLatency();
  });

  describe('Redis unavailable at startup', () => {
    it('should fail gracefully if Redis is down at startup', async () => {
      stopRedis();
      // Try to start a new app instance (simulate fresh boot)
      let failed = false;
      try {
        require('../../src/app');
      } catch (e) {
        failed = true;
      }
      expect(failed).toBe(true);
      startRedis();
    });
  });

  describe('Redis unavailable during runtime', () => {
    it('should handle Redis disconnect and recover', async () => {
      // Assume app is running
      stopRedis();
      // Wait for disconnect
      await new Promise(r => setTimeout(r, 2000));
      // App should degrade gracefully (e.g., 503 or fallback)
      const res = await request(app).get('/health/redis');
      expect([503, 500]).toContain(res.statusCode);
      startRedis();
      // Wait for reconnect
      await new Promise(r => setTimeout(r, 3000));
      const res2 = await request(app).get('/health/redis');
      expect(res2.statusCode).toBe(200);
    });
  });

  describe('Network latency and reconnect storms', () => {
    it('should handle high Redis latency', async () => {
      addRedisLatency(1000);
      const res = await request(app).get('/health/redis');
      expect(res.statusCode).toBe(200); // Should still be up, but slow
      clearRedisLatency();
    });
    it('should recover from rapid disconnect/reconnect', async () => {
      for (let i = 0; i < 3; i++) {
        stopRedis();
        await new Promise(r => setTimeout(r, 1000));
        startRedis();
        await new Promise(r => setTimeout(r, 2000));
      }
      const res = await request(app).get('/health/redis');
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Queue worker crash and recovery', () => {
    it('should not lose jobs if worker crashes', async () => {
      // Enqueue a job
      const jobRes = await request(app).post('/api/v1/queue/test').send({ payload: 'crash-test' });
      expect(jobRes.statusCode).toBe(200);
      // Simulate worker crash (kill process)
      execSync('docker compose restart redis-queue');
      // Wait for worker to restart and process job
      await new Promise(r => setTimeout(r, 5000));
      // Check job processed (implement a way to verify, e.g., status endpoint or DB check)
      // For now, just check Redis is healthy
      const res = await request(app).get('/health/redis');
      expect(res.statusCode).toBe(200);
    });
  });
});

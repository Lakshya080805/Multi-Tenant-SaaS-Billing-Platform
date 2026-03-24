import { env } from './env.js';

function parseRedisConnectionFromUrl(redisUrl) {
  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      db: parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.replace('/', '')) || 0 : 0,
      tls: parsed.protocol === 'rediss:' ? {} : undefined
    };
  } catch (error) {
    return {
      host: '127.0.0.1',
      port: 6379,
      db: 0
    };
  }
}

export const queueConfig = {
  enabled: env.REDIS_ENABLED,
  prefix: `${env.REDIS_PREFIX}:bullmq`,
  connection: parseRedisConnectionFromUrl(env.QUEUE_REDIS_URL),
  defaults: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 200
  },
  concurrency: {
    email: 5,
    pdf: 2,
    reminders: 2,
    webhookRetry: 5
  }
};

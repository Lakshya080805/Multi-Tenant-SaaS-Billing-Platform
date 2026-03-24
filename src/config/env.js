import dotenv from 'dotenv';

dotenv.config();

const isTestEnv = (process.env.NODE_ENV || 'development') === 'test';
const isJestRuntime = Boolean(process.env.JEST_WORKER_ID);
const forceRedisInTest = (process.env.FORCE_REDIS_IN_TEST || 'false').toLowerCase() === 'true';

const required = (key, defaultValue = undefined) => {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 4000,
  MONGO_URI: required('MONGO_URI'),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  REDIS_ENABLED:
    (forceRedisInTest || (!isTestEnv && !isJestRuntime)) &&
    (process.env.REDIS_ENABLED || 'false').toLowerCase() === 'true',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  QUEUE_REDIS_URL: process.env.QUEUE_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_PREFIX: process.env.REDIS_PREFIX || 'saas',
  REDIS_CONNECT_TIMEOUT_MS: Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10),
  REDIS_MAX_RETRIES_PER_REQUEST: Number.parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST || '2', 10),
  REDIS_RETRY_BASE_DELAY_MS: Number.parseInt(process.env.REDIS_RETRY_BASE_DELAY_MS || '100', 10),
  REDIS_RETRY_MAX_DELAY_MS: Number.parseInt(process.env.REDIS_RETRY_MAX_DELAY_MS || '5000', 10),
  REDIS_CIRCUIT_BREAKER_FAILURE_THRESHOLD: Number.parseInt(
    process.env.REDIS_CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5',
    10
  ),
  REDIS_CIRCUIT_BREAKER_COOLDOWN_MS: Number.parseInt(
    process.env.REDIS_CIRCUIT_BREAKER_COOLDOWN_MS || '30000',
    10
  ),

  WEBHOOK_DEDUPE_TTL_SECONDS: Number.parseInt(process.env.WEBHOOK_DEDUPE_TTL_SECONDS || '86400', 10),
  WEBHOOK_REPLAY_WINDOW_SECONDS: Number.parseInt(
    process.env.WEBHOOK_REPLAY_WINDOW_SECONDS || '900',
    10
  ),
  WEBHOOK_RETRY_MAX_ATTEMPTS: Number.parseInt(process.env.WEBHOOK_RETRY_MAX_ATTEMPTS || '3', 10),
  WEBHOOK_RETRY_COUNTER_TTL_SECONDS: Number.parseInt(
    process.env.WEBHOOK_RETRY_COUNTER_TTL_SECONDS || '86400',
    10
  ),
  WEBHOOK_DLQ_MAX_ITEMS: Number.parseInt(process.env.WEBHOOK_DLQ_MAX_ITEMS || '500', 10),

  SCHEDULER_INSTANCE_ID: process.env.SCHEDULER_INSTANCE_ID || '',
  SCHEDULER_LEADER_LOCK_TTL_MS: Number.parseInt(
    process.env.SCHEDULER_LEADER_LOCK_TTL_MS || '120000',
    10
  ),

  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  EMAIL_FROM: required('EMAIL_FROM'),
  RESEND_API_KEY: required('RESEND_API_KEY')
};

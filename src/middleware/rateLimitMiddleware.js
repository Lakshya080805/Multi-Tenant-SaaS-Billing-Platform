// // ...existing code...
// // export const registrationRateLimiter = buildPolicyLimiter({
// //   policyName: 'registration',
// //   windowMs: 15 * 60 * 1000,
// //   max: 10000,
// //   fallbackMax: 6000,
// //   message: 'Too many registration attempts, please try again later.'
// // });
// // import rateLimit from 'express-rate-limit';
// // import { StatusCodes } from 'http-status-codes';
// // import { RedisStore } from 'rate-limit-redis';
// // import { env } from '../config/env.js';
// // import { logger } from '../config/logger.js';
// // import { getRedisCircuitState, getRedisClient } from '../config/redis.js';

// // const sharedLimiterConfig = {
// //   standardHeaders: true,
// //   legacyHeaders: false
// // };

// const rejectWithMessage = (message) => (req, res) => {
//   res.status(StatusCodes.TOO_MANY_REQUESTS).json({
//     success: false,
//     message
//   });
// };

// const composeMiddlewares = (middlewares) => (req, res, next) => {
//   let index = 0;

//   const run = (err) => {
//     if (err) {
//       next(err);
//       return;
//     }

//     const middleware = middlewares[index++];
//     if (!middleware) {
//       next();
//       return;
//     }

//     middleware(req, res, run);
//   };

//   run();
// };

// const bypassLimiter = (req, res, next) => next();

// const isRedisLimiterAvailable = () => {
//   if (!env.REDIS_ENABLED) {
//     return false;
//   }

//   const client = getRedisClient();
//   const circuit = getRedisCircuitState();
//   return Boolean(client?.isReady) && circuit.state !== 'open';
// };

// const buildRedisStore = (policyName) => {
//   if (!env.REDIS_ENABLED) {
//     return null;
//   }

//   const client = getRedisClient();
//   const circuit = getRedisCircuitState();

//   if (!client?.isReady || circuit.state === 'open') {
//     return null;
//   }

//   try {
//     return new RedisStore({
//       prefix: `${env.REDIS_PREFIX}:ratelimit:${policyName}:`,
//       sendCommand: (...args) => {
//         const activeClient = getRedisClient();

//         if (!activeClient?.isReady) {
//           return Promise.reject(new Error('redis_rate_limit_store_unavailable'));
//         }

//         return activeClient.sendCommand(args);
//       }
//     });
//   } catch (error) {
//     logger.warn('Redis rate limit store initialization failed; using in-memory fallback', {
//       policyName,
//       error: error.message
//     });
//     return null;
//   }
// };

// const buildPolicyLimiter = ({
//   policyName,
//   windowMs,
//   max,
//   fallbackMax,
//   message
// }) => {
//   if (env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true') {
//     return bypassLimiter;
//   }

//   const inMemoryFallbackLimiter = rateLimit({
//     ...sharedLimiterConfig,
//     windowMs,
//     max: fallbackMax,
//     skip: () => isRedisLimiterAvailable(),
//     handler: rejectWithMessage(`${message} (fallback mode)`)
//   });

//   if (!env.REDIS_ENABLED) {
//     return inMemoryFallbackLimiter;
//   }

//   const redisStore = buildRedisStore(policyName);
//   if (!redisStore) {
//     return inMemoryFallbackLimiter;
//   }

//   const redisLimiter = rateLimit({
//     ...sharedLimiterConfig,
//     windowMs,
//     max,
//     store: redisStore,
//     passOnStoreError: true,
//     handler: rejectWithMessage(message)
//   });

//   return composeMiddlewares([redisLimiter, inMemoryFallbackLimiter]);
// };


// export const rateLimiter = buildPolicyLimiter({
//   policyName: 'api',
//   windowMs: 15 * 60 * 1000,
//   max: 10000,
//   fallbackMax: 6000,
//   message: 'Too many requests, please try again later.'
// });

// export const authRateLimiter = buildPolicyLimiter({
//   policyName: 'auth',
//   windowMs: 15 * 60 * 1000,
//   max: 10000,
//   fallbackMax: 6000,
//   message: 'Too many authentication attempts, please try again later.'
// });

// export const paymentRateLimiter = buildPolicyLimiter({
//   policyName: 'payment',
//   windowMs: 10 * 60 * 1000,
//   max: 1000,
//   fallbackMax: 600,
//   message: 'Too many payment requests, please slow down and retry.'
// });

// export const webhookRateLimiter = buildPolicyLimiter({
//   policyName: 'webhook',
//   windowMs: 60 * 1000,
//   max: 5000,
//   fallbackMax: 3000,
//   message: 'Too many webhook requests, please retry shortly.'
// });


// export const registrationRateLimiter = buildPolicyLimiter({
//   policyName: 'registration',
//   windowMs: 15 * 60 * 1000,
//   max: 10000,
//   fallbackMax: 6000,
//   message: 'Too many registration attempts, please try again later.'
// });
// import rateLimit from 'express-rate-limit';
// import { StatusCodes } from 'http-status-codes';
// import { RedisStore } from 'rate-limit-redis';
// import { env } from '../config/env.js';
// import { logger } from '../config/logger.js';
// import { getRedisCircuitState, getRedisClient } from '../config/redis.js';

// const sharedLimiterConfig = {
//   standardHeaders: true,
//   legacyHeaders: false
// };

// ✅ 1. Imports (ALWAYS at top)
import rateLimit from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getRedisCircuitState, getRedisClient } from '../config/redis.js';

// ✅ 2. Shared config
const sharedLimiterConfig = {
  standardHeaders: true,
  legacyHeaders: false
};

// ✅ 3. Utility helpers
const rejectWithMessage = (message) => (req, res) => {
  res.status(StatusCodes.TOO_MANY_REQUESTS).json({
    success: false,
    message
  });
};

const composeMiddlewares = (middlewares) => (req, res, next) => {
  let index = 0;

  const run = (err) => {
    if (err) return next(err);

    const middleware = middlewares[index++];
    if (!middleware) return next();

    middleware(req, res, run);
  };

  run();
};

const bypassLimiter = (req, res, next) => next();

const isRedisLimiterAvailable = () => {
  if (!env.REDIS_ENABLED) return false;

  const client = getRedisClient();
  const circuit = getRedisCircuitState();

  return Boolean(client?.isReady) && circuit.state !== 'open';
};

// ✅ 4. Redis store builder
const buildRedisStore = (policyName) => {
  if (!env.REDIS_ENABLED) return null;

  const client = getRedisClient();
  const circuit = getRedisCircuitState();

  if (!client?.isReady || circuit.state === 'open') {
    return null;
  }

  try {
    return new RedisStore({
      prefix: `${env.REDIS_PREFIX}:ratelimit:${policyName}:`,
      sendCommand: (...args) => {
        const activeClient = getRedisClient();

        if (!activeClient?.isReady) {
          return Promise.reject(
            new Error('redis_rate_limit_store_unavailable')
          );
        }

        return activeClient.sendCommand(args);
      }
    });
  } catch (error) {
    logger.warn(
      'Redis rate limit store initialization failed; using in-memory fallback',
      {
        policyName,
        error: error.message
      }
    );
    return null;
  }
};

// ✅ 5. Core builder
const buildPolicyLimiter = ({
  policyName,
  windowMs,
  max,
  fallbackMax,
  message
}) => {
  // Disable in tests unless explicitly enabled
  if (
    env.NODE_ENV === 'test' &&
    process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true'
  ) {
    return bypassLimiter;
  }

  // In-memory fallback limiter
  const inMemoryFallbackLimiter = rateLimit({
    ...sharedLimiterConfig,
    windowMs,
    max: fallbackMax,
    skip: () => isRedisLimiterAvailable(),
    handler: rejectWithMessage(`${message} (fallback mode)`)
  });

  // If Redis disabled → use fallback
  if (!env.REDIS_ENABLED) {
    return inMemoryFallbackLimiter;
  }

  const redisStore = buildRedisStore(policyName);

  // If Redis unavailable → fallback
  if (!redisStore) {
    return inMemoryFallbackLimiter;
  }

  // Primary Redis-backed limiter
  const redisLimiter = rateLimit({
    ...sharedLimiterConfig,
    windowMs,
    max,
    store: redisStore,
    passOnStoreError: true,
    handler: rejectWithMessage(message)
  });

  // Compose Redis + fallback
  return composeMiddlewares([redisLimiter, inMemoryFallbackLimiter]);
};

// ✅ 6. Exported limiters
export const rateLimiter = buildPolicyLimiter({
  policyName: 'api',
  windowMs: 15 * 60 * 1000,
  max: 10000,
  fallbackMax: 6000,
  message: 'Too many requests, please try again later.'
});

export const authRateLimiter = buildPolicyLimiter({
  policyName: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 10000,
  fallbackMax: 6000,
  message: 'Too many authentication attempts, please try again later.'
});

export const paymentRateLimiter = buildPolicyLimiter({
  policyName: 'payment',
  windowMs: 10 * 60 * 1000,
  max: 1000,
  fallbackMax: 600,
  message: 'Too many payment requests, please slow down and retry.'
});

export const webhookRateLimiter = buildPolicyLimiter({
  policyName: 'webhook',
  windowMs: 60 * 1000,
  max: 5000,
  fallbackMax: 3000,
  message: 'Too many webhook requests, please retry shortly.'
});

export const registrationRateLimiter = buildPolicyLimiter({
  policyName: 'registration',
  windowMs: 15 * 60 * 1000,
  max: 10000,
  fallbackMax: 6000,
  message: 'Too many registration attempts, please try again later.'
});

import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import xssClean from 'xss-clean';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { httpLogger } from './config/logger.js';
import { apiRouter } from './routes/index.js';
import { notFoundHandler } from './middleware/notFoundMiddleware.js';
import { errorHandler } from './middleware/errorMiddleware.js';
import { rateLimiter, webhookRateLimiter } from './middleware/rateLimitMiddleware.js';
import { swaggerSpec } from './config/swagger.js';
import { handleRazorpayWebhook } from './webhooks/razorpayWebhook.js';
import { asyncHandler } from './utils/asyncHandler.js';
import mongoose from 'mongoose';
import { getRedisHealth } from './config/redis.js';
import { getCacheMetrics } from './services/cacheService.js';
import { getWebhookReliabilityMetrics, getWebhookDlqEvents } from './services/webhookReliabilityService.js';
import { getQueueMetrics, getDeadLetterEvents } from './queues/jobQueueService.js';

// import { webhookRouter } from './routes/webhookRoutes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true
    })
  );
  app.post(
    '/api/v1/webhooks/razorpay',
    webhookRateLimiter,
    express.raw({ type: 'application/json', limit: '10mb' }),
    (req, res, next) => {
      req.rawBody = req.body.toString('utf8');

      try {
        req.body = JSON.parse(req.rawBody || '{}');
        next();
      } catch (error) {
        next(error);
      }
    },
    asyncHandler(handleRazorpayWebhook)
  );
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
      }
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Sanitize request data against NoSQL injection (strips $ and . from user input)
  app.use(mongoSanitize());

  // Sanitize request data against XSS (escapes HTML in req.body, req.query, req.params)
  app.use(xssClean());

  if (env.NODE_ENV !== 'test') {
    app.use(morgan('combined', { stream: httpLogger.stream }));
  }

  app.use(rateLimiter);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.get('/health', async (req, res) => {
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';

    const redis = await getRedisHealth();
    const isRedisHealthy = !redis.enabled || redis.status === 'connected';
    const overallHealthy = dbState === 1 && isRedisHealthy;

    res.status(overallHealthy ? 200 : 503).json({
      status: overallHealthy ? 'ok' : 'degraded',
      uptime: process.uptime(),
      database: dbStatus,
      redis,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/health/redis', async (req, res) => {
    const redis = await getRedisHealth();
    const statusCode = !redis.enabled || redis.status === 'connected' ? 200 : 503;
    res.status(statusCode).json(redis);
  });

  app.get('/metrics/redis', async (req, res) => {
    const redis = await getRedisHealth();

    if (!redis.enabled || redis.status !== 'connected') {
      res.status(503).json({
        status: 'degraded',
        message: 'Redis metrics unavailable',
        redis
      });
      return;
    }

    res.status(200).json({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      metrics: redis.metrics,
      circuitBreaker: redis.circuitBreaker
    });
  });

  app.get('/metrics/cache', (req, res) => {
    res.status(200).json({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      metrics: getCacheMetrics()
    });
  });

  app.get('/metrics/webhooks', async (req, res) => {
    const metrics = await getWebhookReliabilityMetrics();
    res.status(200).json({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      metrics
    });
  });

  app.get('/dlq/webhooks', async (req, res) => {
    const limit = req.query.limit;
    const events = await getWebhookDlqEvents(limit);
    const metrics = await getWebhookReliabilityMetrics();

    res.status(200).json({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      deadLetterDepth: metrics.deadLetterDepth,
      events
    });
  });

  app.get('/metrics/queues', async (req, res) => {
    const metrics = await getQueueMetrics();
    res.status(200).json({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      metrics
    });
  });

  app.get('/dlq/queues', async (req, res) => {
    const limit = req.query.limit;
    const events = await getDeadLetterEvents(limit);

    res.status(200).json({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      events
    });
  });

  // app.use('/webhooks', webhookRouter);

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

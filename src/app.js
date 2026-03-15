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
import { rateLimiter } from './middleware/rateLimitMiddleware.js';
import { swaggerSpec } from './config/swagger.js';
import { handleRazorpayWebhook } from './webhooks/razorpayWebhook.js';
import { asyncHandler } from './utils/asyncHandler.js';
import mongoose from 'mongoose';

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

  app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
    res.status(dbState === 1 ? 200 : 503).json({
      status: dbState === 1 ? 'ok' : 'degraded',
      uptime: process.uptime(),
      database: dbStatus,
      timestamp: new Date().toISOString()
    });
  });

  // app.use('/webhooks', webhookRouter);

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

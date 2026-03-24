import './config/env.js';
import { createApp } from './app.js';
import { logger } from './config/logger.js';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { startInvoiceScheduler } from './services/invoiceScheduler.js';
import { connectRedis, disconnectRedis } from './config/redis.js';

const app = createApp();

const PORT = process.env.PORT || 4000;

await mongoose.connect(env.MONGO_URI);
logger.info('Connected to MongoDB', { dbName: mongoose.connection.name });

const server = app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  startInvoiceScheduler();
});

connectRedis().catch((error) => {
  logger.warn('Redis startup connection failed; running with degraded Redis-backed features', {
    error: error?.message
  });
});

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);

  server.close(async () => {
    try {
      await disconnectRedis();
      await mongoose.connection.close();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Graceful shutdown failed', { error: error.message });
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

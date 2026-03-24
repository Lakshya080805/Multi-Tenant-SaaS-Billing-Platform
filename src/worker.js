import './config/env.js';
import { logger } from './config/logger.js';
import { startWorkers, stopWorkers } from './workers/index.js';

await startWorkers();

async function shutdown(signal) {
  logger.info(`Received ${signal}, stopping workers`);

  try {
    await stopWorkers();
    process.exit(0);
  } catch (error) {
    logger.error('Worker shutdown failed', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

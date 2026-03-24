import cron from 'node-cron';
import { invoiceModel } from '../models/invoiceModel.js';
import { logger } from '../config/logger.js';
import { enqueueReminderJob, logQueueFallback } from '../queues/jobQueueService.js';
import { withSchedulerLeaderLock } from './schedulerLeaderService.js';

const INVOICE_REMINDER_TASK_NAME = 'invoice-reminder-daily';

export async function runInvoiceSchedulerTick(options = {}) {
  return withSchedulerLeaderLock(
    {
      taskName: INVOICE_REMINDER_TASK_NAME,
      instanceId: options.instanceId,
      ttlMs: options.ttlMs
    },
    async () => {
      logger.info('Cron job started: enqueue reminder processing');

      const queued = await enqueueReminderJob({
        reason: 'daily-cron',
        triggeredAt: new Date().toISOString()
      });

      if (queued) {
        logger.info('Cron job completed: reminder processing queued', {
          queue: queued.queueName,
          jobId: queued.id
        });
        return {
          mode: 'queued',
          queue: queued.queueName,
          jobId: queued.id
        };
      }

      logQueueFallback('reminder-jobs', 'queue unavailable from scheduler');

      const fallbackResult = await invoiceModel.markOverdue();
      logger.info('Fallback reminder processing completed synchronously', {
        modifiedCount: fallbackResult.modifiedCount
      });

      return {
        mode: 'fallback-sync',
        modifiedCount: fallbackResult.modifiedCount
      };
    }
  );
}

/**
 * Runs daily at midnight.
 * Marks all 'sent' invoices whose dueDate has passed as 'overdue'.
 */
export function startInvoiceScheduler() {
  cron.schedule('0 0 * * *', async () => {
    try {
      await runInvoiceSchedulerTick();
    } catch (err) {
      logger.error('Cron job failed: enqueue reminder processing', { error: err.message, stack: err.stack });
    }
  });

  logger.info('Invoice scheduler started (leader-locked, queues reminder jobs daily at midnight)');
}

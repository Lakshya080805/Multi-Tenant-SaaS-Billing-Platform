import cron from 'node-cron';
import { invoiceModel } from '../models/invoiceModel.js';
import { logger } from '../config/logger.js';

/**
 * Runs daily at midnight.
 * Marks all 'sent' invoices whose dueDate has passed as 'overdue'.
 */
export function startInvoiceScheduler() {
  cron.schedule('0 0 * * *', async () => {
    logger.info('Cron job started: mark overdue invoices');
    try {
      const result = await invoiceModel.markOverdue();
      logger.info('Cron job completed: mark overdue invoices', {
        modifiedCount: result.modifiedCount
      });
    } catch (err) {
      logger.error('Cron job failed: mark overdue invoices', { error: err.message, stack: err.stack });
    }
  });

  logger.info('Invoice scheduler started (runs daily at midnight)');
}

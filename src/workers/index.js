import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { queueConfig } from '../config/queue.js';
import { QUEUE_NAMES, getAllQueues } from '../queues/queueRegistry.js';
import { enqueueDeadLetterJob } from '../queues/jobQueueService.js';
import { invoiceModel } from '../models/invoiceModel.js';
import { clientModel } from '../models/clientModel.js';
import { organizationModel } from '../models/organizationModel.js';
import { paymentModel } from '../models/paymentModel.js';
import { generateInvoicePdf } from '../services/pdfService.js';
import { sendInvoiceEmail } from '../services/emailService.js';
import {
  markWebhookProcessed,
  clearWebhookRetryCount,
  handleWebhookFailure
} from '../services/webhookReliabilityService.js';

const workers = [];

async function processEmailJob(job) {
  const { organizationId, invoiceId } = job.data;

  const invoice = await invoiceModel.findById(invoiceId, organizationId);
  if (!invoice) {
    throw new Error('Invoice not found for email job');
  }

  const client = await clientModel.findById(invoice.clientId);
  if (!client || client.organizationId !== organizationId) {
    throw new Error('Client not found for email job');
  }

  if (!client.email) {
    throw new Error('Client email missing for email job');
  }

  const organization = await organizationModel.findById(organizationId);
  if (!organization) {
    throw new Error('Organization not found for email job');
  }

  const pdfBuffer = await generateInvoicePdf(invoice, client, organization);

  await sendInvoiceEmail(
    client.email,
    `Invoice ${invoice.invoiceNumber}`,
    `Please find attached invoice ${invoice.invoiceNumber} from ${organization.name}.`,
    pdfBuffer,
    `invoice-${invoice.invoiceNumber}.pdf`
  );

  await invoiceModel.updateById(invoice.id, organizationId, {
    status: invoice.status === 'draft' ? 'sent' : invoice.status,
    sentAt: new Date()
  });

  return {
    sent: true,
    invoiceId: invoice.id,
    organizationId
  };
}

async function processPdfJob(job) {
  const { organizationId, invoiceId } = job.data;

  const invoice = await invoiceModel.findById(invoiceId, organizationId);
  if (!invoice) {
    throw new Error('Invoice not found for PDF job');
  }

  const client = await clientModel.findById(invoice.clientId);
  if (!client || client.organizationId !== organizationId) {
    throw new Error('Client not found for PDF job');
  }

  const organization = await organizationModel.findById(organizationId);
  if (!organization) {
    throw new Error('Organization not found for PDF job');
  }

  const pdfBuffer = await generateInvoicePdf(invoice, client, organization);

  return {
    generated: true,
    invoiceId,
    byteLength: pdfBuffer.length
  };
}

async function processReminderJob() {
  const result = await invoiceModel.markOverdue();
  return {
    modifiedCount: result.modifiedCount || 0
  };
}

async function processWebhookRetryJob(job) {
  const { provider, event, dedupeKey } = job.data;

  try {
    if (provider === 'payment') {
      const metadata = event.data?.metadata || {};
      const invoiceId = metadata.invoiceId;
      const organizationId = metadata.organizationId;
      const paymentId = metadata.paymentId || event.data?.payment?.id;

      if (!invoiceId || !organizationId) {
        throw new Error('Invalid payment webhook retry payload');
      }

      const invoice = await invoiceModel.findById(invoiceId, organizationId);
      if (!invoice) {
        throw new Error('Invoice not found during payment webhook retry');
      }

      if (event.type === 'payment.succeeded') {
        await invoiceModel.updateById(invoiceId, organizationId, {
          status: 'paid',
          paidAt: new Date()
        });

        if (paymentId) {
          await paymentModel.updateById(paymentId, { status: 'succeeded' });
        } else {
          await paymentModel.updateLatestByInvoice(invoiceId, organizationId, {
            status: 'succeeded'
          });
        }
      }

      if (event.type === 'payment.failed') {
        if (paymentId) {
          await paymentModel.updateById(paymentId, { status: 'failed' });
        } else {
          await paymentModel.updateLatestByInvoice(invoiceId, organizationId, {
            status: 'failed'
          });
        }
      }
    }

    if (provider === 'razorpay') {
      const eventType = event.event;
      const paymentEntity = event.payload?.payment?.entity;
      const razorpayOrderId = paymentEntity?.order_id;

      if (!razorpayOrderId) {
        throw new Error('Invalid Razorpay webhook retry payload');
      }

      const payment = await paymentModel.findByRazorpayOrderId(razorpayOrderId);
      if (!payment) {
        throw new Error('Payment not found during Razorpay webhook retry');
      }

      if (eventType === 'payment.captured') {
        await paymentModel.updateByRazorpayOrderId(razorpayOrderId, {
          status: 'succeeded'
        });

        await invoiceModel.updateById(payment.invoiceId, payment.organizationId, {
          status: 'paid',
          paidAt: new Date()
        });
      }

      if (eventType === 'payment.failed') {
        await paymentModel.updateByRazorpayOrderId(razorpayOrderId, {
          status: 'failed'
        });
      }
    }

    await markWebhookProcessed(dedupeKey);
    await clearWebhookRetryCount(dedupeKey);

    return {
      retried: true,
      provider,
      eventId: event?.id
    };
  } catch (error) {
    await handleWebhookFailure({
      dedupeKey,
      provider,
      event,
      error,
      metadata: {
        source: 'worker-retry',
        jobId: job.id
      }
    });

    throw error;
  }
}

function registerWorker(queueName, processor, concurrency) {
  const worker = new Worker(queueName, processor, {
    connection: queueConfig.connection,
    prefix: queueConfig.prefix,
    concurrency
  });

  worker.on('completed', (job) => {
    logger.info('Queue job completed', {
      queueName,
      jobId: job.id,
      jobName: job.name
    });
  });

  worker.on('failed', async (job, error) => {
    logger.error('Queue job failed', {
      queueName,
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      attempts: job?.opts?.attempts,
      error: error?.message
    });

    const attempts = Number(job?.opts?.attempts || 1);
    const attemptsMade = Number(job?.attemptsMade || 0);

    if (attemptsMade >= attempts) {
      await enqueueDeadLetterJob({
        sourceQueue: queueName,
        sourceJobId: job?.id,
        sourceJobName: job?.name,
        attemptsMade,
        payload: job?.data,
        failedReason: error?.message,
        failedAt: new Date().toISOString()
      });
    }
  });

  workers.push(worker);
}

export async function startWorkers() {
  if (!queueConfig.enabled) {
    logger.warn('Workers not started because queueing is disabled');
    return;
  }

  await mongoose.connect(env.MONGO_URI);
  logger.info('Worker connected to MongoDB', { dbName: mongoose.connection.name });

  getAllQueues();

  registerWorker(QUEUE_NAMES.EMAIL_DELIVERY, processEmailJob, queueConfig.concurrency.email);
  registerWorker(QUEUE_NAMES.PDF_GENERATION, processPdfJob, queueConfig.concurrency.pdf);
  registerWorker(QUEUE_NAMES.REMINDER_JOBS, processReminderJob, queueConfig.concurrency.reminders);
  registerWorker(QUEUE_NAMES.WEBHOOK_RETRY, processWebhookRetryJob, queueConfig.concurrency.webhookRetry);

  logger.info('BullMQ workers started', {
    workerCount: workers.length
  });
}

export async function stopWorkers() {
  await Promise.all(workers.map((worker) => worker.close()));
  workers.length = 0;

  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }

  logger.info('Workers stopped');
}

import { logger } from '../config/logger.js';
import { queueConfig } from '../config/queue.js';
import { getAllQueues, QUEUE_NAMES } from './queueRegistry.js';

function calculateBackoffDelay(attemptsMade) {
  return Math.min(30000, 2000 * (2 ** Math.max(attemptsMade - 1, 0)));
}

async function enqueue(queueName, jobName, payload, options = {}) {
  if (!queueConfig.enabled) {
    return null;
  }

  const queues = getAllQueues();
  const queue = Object.values(QUEUE_NAMES).includes(queueName)
    ? (() => {
      switch (queueName) {
        case QUEUE_NAMES.EMAIL_DELIVERY:
          return queues.email;
        case QUEUE_NAMES.PDF_GENERATION:
          return queues.pdf;
        case QUEUE_NAMES.REMINDER_JOBS:
          return queues.reminders;
        case QUEUE_NAMES.WEBHOOK_RETRY:
          return queues.webhookRetry;
        case QUEUE_NAMES.DEAD_LETTER:
          return queues.deadLetter;
        default:
          return null;
      }
    })()
    : null;

  if (!queue) {
    return null;
  }

  const job = await queue.add(jobName, payload, options);
  return {
    id: job.id,
    queueName,
    jobName
  };
}

export async function enqueueEmailDelivery(payload) {
  return enqueue(QUEUE_NAMES.EMAIL_DELIVERY, 'send-invoice-email', payload, {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 3000
    }
  });
}

export async function enqueuePdfGeneration(payload) {
  return enqueue(QUEUE_NAMES.PDF_GENERATION, 'generate-invoice-pdf', payload, {
    attempts: 4,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  });
}

export async function enqueueReminderJob(payload, opts = {}) {
  return enqueue(QUEUE_NAMES.REMINDER_JOBS, 'process-reminders', payload, {
    attempts: 3,
    delay: opts.delayMs || 0,
    backoff: {
      type: 'fixed',
      delay: 5000
    },
    repeat: opts.repeat
  });
}

export async function enqueueWebhookRetryJob(payload, attemptNumber = 1) {
  return enqueue(QUEUE_NAMES.WEBHOOK_RETRY, 'retry-webhook-event', payload, {
    attempts: 1,
    delay: calculateBackoffDelay(attemptNumber),
    removeOnComplete: 300,
    removeOnFail: 500
  });
}

export async function enqueueDeadLetterJob(payload) {
  return enqueue(QUEUE_NAMES.DEAD_LETTER, 'dead-letter-event', payload, {
    attempts: 1
  });
}

export async function getQueueMetrics() {
  if (!queueConfig.enabled) {
    return {
      enabled: false,
      queues: {}
    };
  }

  const queues = getAllQueues();

  const [emailCounts, pdfCounts, reminderCounts, webhookRetryCounts, deadLetterCounts] = await Promise.all([
    queues.email.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    queues.pdf.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    queues.reminders.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    queues.webhookRetry.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    queues.deadLetter.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
  ]);

  return {
    enabled: true,
    queues: {
      email: emailCounts,
      pdf: pdfCounts,
      reminders: reminderCounts,
      webhookRetry: webhookRetryCounts,
      deadLetter: deadLetterCounts
    }
  };
}

export async function getDeadLetterEvents(limit = 50) {
  if (!queueConfig.enabled) {
    return [];
  }

  const queues = getAllQueues();
  const max = Math.max(Number.parseInt(limit, 10) || 50, 1);
  const jobs = await queues.deadLetter.getJobs(['waiting', 'active', 'failed', 'completed'], 0, max - 1, false);

  return jobs.map((job) => ({
    id: job.id,
    name: job.name,
    data: job.data,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn
  }));
}

export function logQueueFallback(workload, reason) {
  logger.warn('Queue disabled or unavailable; falling back to synchronous path', {
    workload,
    reason
  });
}

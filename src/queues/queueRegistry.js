import { Queue } from 'bullmq';
import { queueConfig } from '../config/queue.js';

export const QUEUE_NAMES = {
  EMAIL_DELIVERY: 'email-delivery',
  PDF_GENERATION: 'pdf-generation',
  REMINDER_JOBS: 'reminder-jobs',
  WEBHOOK_RETRY: 'webhook-retry',
  DEAD_LETTER: 'dead-letter'
};

const queueMap = new Map();

function buildDefaultJobOptions() {
  return {
    attempts: queueConfig.defaults.attempts,
    backoff: queueConfig.defaults.backoff,
    removeOnComplete: queueConfig.defaults.removeOnComplete,
    removeOnFail: queueConfig.defaults.removeOnFail
  };
}

function createQueue(name, overrideOptions = {}) {
  if (!queueConfig.enabled) {
    return null;
  }

  if (queueMap.has(name)) {
    return queueMap.get(name);
  }

  const queue = new Queue(name, {
    prefix: queueConfig.prefix,
    connection: queueConfig.connection,
    defaultJobOptions: {
      ...buildDefaultJobOptions(),
      ...overrideOptions
    }
  });

  queueMap.set(name, queue);
  return queue;
}

export function getQueue(name) {
  return createQueue(name);
}

export function getAllQueues() {
  return {
    email: createQueue(QUEUE_NAMES.EMAIL_DELIVERY),
    pdf: createQueue(QUEUE_NAMES.PDF_GENERATION),
    reminders: createQueue(QUEUE_NAMES.REMINDER_JOBS),
    webhookRetry: createQueue(QUEUE_NAMES.WEBHOOK_RETRY),
    deadLetter: createQueue(QUEUE_NAMES.DEAD_LETTER, {
      attempts: 1,
      removeOnComplete: 200,
      removeOnFail: 500
    })
  };
}

export async function closeAllQueues() {
  const queues = Array.from(queueMap.values());
  await Promise.all(queues.map((queue) => queue.close()));
  queueMap.clear();
}

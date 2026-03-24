import {
  assertStatus,
  bootstrapTenant,
  createClient,
  createInvoice,
  formatTimestampedTitle,
  numberArg,
  parseArgs,
  promisePool,
  requestJson,
  sleep
} from './loadTestUtils.js';

function printUsage() {
  console.log('Usage: node scripts/load/queue-burst-stability.js [options]');
  console.log('Options:');
  console.log('  --baseUrl <url>              API base URL (default: http://localhost:4000)');
  console.log('  --invoices <count>           Number of jobs to enqueue (default: 150)');
  console.log('  --seedConcurrency <count>    Concurrent invoice create operations (default: 12)');
  console.log('  --enqueueConcurrency <count> Concurrent enqueue operations (default: 50)');
  console.log('  --pollMs <ms>                Queue metrics poll interval (default: 2000)');
  console.log('  --drainTimeoutSec <sec>      Wait time for queue drain (default: 180)');
}

function queueCounts(metrics, queueName) {
  const queue = metrics?.queues?.[queueName] || {};
  return {
    waiting: Number(queue.waiting || 0),
    active: Number(queue.active || 0),
    delayed: Number(queue.delayed || 0),
    completed: Number(queue.completed || 0),
    failed: Number(queue.failed || 0)
  };
}

function pendingJobs(counts) {
  return counts.waiting + counts.active + counts.delayed;
}

async function fetchQueueMetrics(baseUrl) {
  const res = await requestJson(baseUrl, '/metrics/queues');
  assertStatus(res, 200, 'Failed to read queue metrics');
  return res.body?.metrics || {};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  const baseUrl = args.baseUrl || 'http://localhost:4000';
  const invoiceCount = numberArg(args, 'invoices', 150);
  const seedConcurrency = numberArg(args, 'seedConcurrency', 12);
  const enqueueConcurrency = numberArg(args, 'enqueueConcurrency', 50);
  const pollMs = numberArg(args, 'pollMs', 2000);
  const drainTimeoutSec = numberArg(args, 'drainTimeoutSec', 180);

  console.log(formatTimestampedTitle('Queue burst throughput and stability test'));
  console.log(`Target: ${baseUrl}`);
  console.log(
    `Config: invoices=${invoiceCount}, enqueueConcurrency=${enqueueConcurrency}, drainTimeoutSec=${drainTimeoutSec}`
  );

  const baseline = await fetchQueueMetrics(baseUrl);
  if (!baseline.enabled) {
    throw new Error('Queue metrics report queueing disabled. Set REDIS_ENABLED=true and start worker.');
  }

  const baselinePdf = queueCounts(baseline, 'pdf');
  const baselineDeadLetter = queueCounts(baseline, 'deadLetter');

  const { token } = await bootstrapTenant(baseUrl);
  const client = await createClient(baseUrl, token, `queue-${Date.now()}`);

  const invoiceIndexes = Array.from({ length: invoiceCount }, (_, index) => index + 1);
  const invoices = await promisePool(invoiceIndexes, seedConcurrency, async (value) => {
    return createInvoice(baseUrl, token, client.id, `INV-QUEUE-${Date.now()}-${value}`);
  });

  const enqueueStart = process.hrtime.bigint();
  const enqueueResults = await promisePool(invoices, enqueueConcurrency, async (invoice) => {
    const res = await requestJson(baseUrl, `/api/v1/invoices/${invoice.id}/pdf?async=true`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return {
      status: res.status,
      queued: Boolean(res.body?.data?.queued)
    };
  });
  const enqueueEnd = process.hrtime.bigint();

  const enqueueDurationSeconds = Number(enqueueEnd - enqueueStart) / 1_000_000_000;
  const accepted = enqueueResults.filter((result) => result.status === 202 && result.queued).length;
  const rejected = enqueueResults.filter((result) => result.status >= 400 && result.status < 500).length;
  const errored = enqueueResults.filter((result) => result.status >= 500).length;

  let maxPending = 0;
  let maxActive = 0;
  let drained = false;

  const deadline = Date.now() + (drainTimeoutSec * 1000);
  let latestPdf = baselinePdf;
  let latestDeadLetter = baselineDeadLetter;

  while (Date.now() < deadline) {
    const snapshot = await fetchQueueMetrics(baseUrl);
    latestPdf = queueCounts(snapshot, 'pdf');
    latestDeadLetter = queueCounts(snapshot, 'deadLetter');

    maxPending = Math.max(maxPending, pendingJobs(latestPdf));
    maxActive = Math.max(maxActive, latestPdf.active);

    if (pendingJobs(latestPdf) === 0) {
      drained = true;
      break;
    }

    await sleep(pollMs);
  }

  console.log('\nQueue burst summary');
  console.table([
    { metric: 'Enqueued jobs', value: accepted },
    { metric: '4xx responses', value: rejected },
    { metric: '5xx responses', value: errored },
    { metric: 'Enqueue duration (s)', value: enqueueDurationSeconds.toFixed(2) },
    {
      metric: 'Enqueue throughput (jobs/s)',
      value: enqueueDurationSeconds > 0 ? (accepted / enqueueDurationSeconds).toFixed(2) : 'n/a'
    },
    { metric: 'Max pending pdf jobs', value: maxPending },
    { metric: 'Max active pdf jobs', value: maxActive },
    { metric: 'Queue drained before timeout', value: drained }
  ]);

  console.log('\nWorker stability indicators (pdf + deadLetter queues)');
  console.table([
    {
      metric: 'pdf.completed delta',
      value: latestPdf.completed - baselinePdf.completed
    },
    {
      metric: 'pdf.failed delta',
      value: latestPdf.failed - baselinePdf.failed
    },
    {
      metric: 'deadLetter.waiting delta',
      value: latestDeadLetter.waiting - baselineDeadLetter.waiting
    },
    {
      metric: 'deadLetter.failed delta',
      value: latestDeadLetter.failed - baselineDeadLetter.failed
    }
  ]);

  if (!drained) {
    process.exitCode = 2;
    console.error('\nQueue did not drain within timeout. Check worker capacity and Redis health.');
  }
}

main().catch((error) => {
  console.error('\nQueue load test failed:', error?.message || error);
  process.exitCode = 1;
});
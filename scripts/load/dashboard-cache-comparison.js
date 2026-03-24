import autocannon from 'autocannon';
import {
  bootstrapTenant,
  createClient,
  createInvoice,
  fetchCacheMetrics,
  formatTimestampedTitle,
  numberArg,
  parseArgs,
  promisePool,
  requestJson
} from './loadTestUtils.js';

const DASHBOARD_PATHS = [
  '/api/v1/dashboard/summary',
  '/api/v1/dashboard/revenue',
  '/api/v1/dashboard/invoice-status',
  '/api/v1/dashboard/top-clients',
  '/api/v1/dashboard/recent-invoices',
  '/api/v1/dashboard/monthly-growth',
  '/api/v1/dashboard/average-invoice-value',
  '/api/v1/dashboard/client-lifetime-value'
];

function printUsage() {
  console.log('Usage: node scripts/load/dashboard-cache-comparison.js [options]');
  console.log('Options:');
  console.log('  --baseUrl <url>            API base URL (default: http://localhost:4000)');
  console.log('  --duration <seconds>       Test duration per run (default: 20)');
  console.log('  --connections <count>      Concurrent connections (default: 30)');
  console.log('  --clients <count>          Seeded clients (default: 20)');
  console.log('  --invoices <count>         Seeded invoices (default: 120)');
  console.log('  --seedConcurrency <count>  Concurrent invoice create operations (default: 12)');
}

function runAutocannon(options) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });

    autocannon.track(instance, {
      renderProgressBar: true,
      renderResultsTable: false,
      renderLatencyTable: false
    });
  });
}

function toSummary(result) {
  const latency = result?.latency || {};
  const requests = result?.requests || {};
  const throughput = result?.throughput || {};

  return {
    reqPerSec: Number(requests.average || 0),
    throughputKBps: Number(throughput.average || 0),
    latencyP50Ms: Number(latency.p50 || 0),
    latencyP95Ms: Number(latency.p97_5 || latency.p99 || 0),
    latencyP99Ms: Number(latency.p99 || 0),
    non2xx: Number(result?.non2xx || 0),
    errors: Number(result?.errors || 0),
    timeouts: Number(result?.timeouts || 0)
  };
}

function toPct(before, after) {
  if (!before) {
    return 'n/a';
  }

  const pct = ((after - before) / before) * 100;
  return `${pct.toFixed(2)}%`;
}

async function warmDashboardCache(baseUrl, token) {
  for (const path of DASHBOARD_PATHS) {
    await requestJson(baseUrl, path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
  }
}

async function seedDashboardData(baseUrl, token, clientsCount, invoicesCount, seedConcurrency) {
  const clientIndexes = Array.from({ length: clientsCount }, (_, index) => index + 1);
  const clients = await promisePool(clientIndexes, Math.min(6, clientsCount), async (value) => {
    return createClient(baseUrl, token, `dash-${value}-${Date.now()}`);
  });

  const invoiceIndexes = Array.from({ length: invoicesCount }, (_, index) => index + 1);
  await promisePool(invoiceIndexes, seedConcurrency, async (value) => {
    const client = clients[value % clients.length];
    const invoiceNumber = `INV-LOAD-${Date.now()}-${value}`;
    await createInvoice(baseUrl, token, client.id, invoiceNumber);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  const baseUrl = args.baseUrl || 'http://localhost:4000';
  const duration = numberArg(args, 'duration', 20);
  const connections = numberArg(args, 'connections', 30);
  const clientsCount = numberArg(args, 'clients', 20);
  const invoicesCount = numberArg(args, 'invoices', 120);
  const seedConcurrency = numberArg(args, 'seedConcurrency', 12);

  console.log(formatTimestampedTitle('Dashboard cache load comparison'));
  console.log(`Target: ${baseUrl}`);
  console.log(
    `Config: duration=${duration}s, connections=${connections}, clients=${clientsCount}, invoices=${invoicesCount}`
  );

  const { token } = await bootstrapTenant(baseUrl);
  await seedDashboardData(baseUrl, token, clientsCount, invoicesCount, seedConcurrency);

  const headers = {
    Authorization: `Bearer ${token}`
  };

  const benchmarkOptions = {
    url: baseUrl,
    method: 'GET',
    connections,
    duration,
    pipelining: 1,
    requests: DASHBOARD_PATHS.map((path) => ({ path, method: 'GET', headers }))
  };

  const cacheBefore = await fetchCacheMetrics(baseUrl);

  console.log('\nRunning cold-cache benchmark...');
  const cold = toSummary(await runAutocannon(benchmarkOptions));

  await warmDashboardCache(baseUrl, token);

  console.log('\nRunning warm-cache benchmark...');
  const hot = toSummary(await runAutocannon(benchmarkOptions));

  const cacheAfter = await fetchCacheMetrics(baseUrl);

  console.log('\nDashboard performance summary');
  console.table([
    { metric: 'Requests/sec', before: cold.reqPerSec.toFixed(2), after: hot.reqPerSec.toFixed(2), delta: toPct(cold.reqPerSec, hot.reqPerSec) },
    { metric: 'P50 latency (ms)', before: cold.latencyP50Ms.toFixed(2), after: hot.latencyP50Ms.toFixed(2), delta: toPct(cold.latencyP50Ms, hot.latencyP50Ms) },
    { metric: 'P95 latency (ms)', before: cold.latencyP95Ms.toFixed(2), after: hot.latencyP95Ms.toFixed(2), delta: toPct(cold.latencyP95Ms, hot.latencyP95Ms) },
    { metric: 'P99 latency (ms)', before: cold.latencyP99Ms.toFixed(2), after: hot.latencyP99Ms.toFixed(2), delta: toPct(cold.latencyP99Ms, hot.latencyP99Ms) },
    { metric: 'Non-2xx', before: cold.non2xx, after: hot.non2xx, delta: hot.non2xx - cold.non2xx },
    { metric: 'Errors', before: cold.errors, after: hot.errors, delta: hot.errors - cold.errors },
    { metric: 'Timeouts', before: cold.timeouts, after: hot.timeouts, delta: hot.timeouts - cold.timeouts }
  ]);

  console.log('\nCache metrics delta');
  console.table([
    {
      metric: 'hits',
      before: Number(cacheBefore.hits || 0),
      after: Number(cacheAfter.hits || 0),
      delta: Number(cacheAfter.hits || 0) - Number(cacheBefore.hits || 0)
    },
    {
      metric: 'misses',
      before: Number(cacheBefore.misses || 0),
      after: Number(cacheAfter.misses || 0),
      delta: Number(cacheAfter.misses || 0) - Number(cacheBefore.misses || 0)
    },
    {
      metric: 'fallbacks',
      before: Number(cacheBefore.fallbacks || 0),
      after: Number(cacheAfter.fallbacks || 0),
      delta: Number(cacheAfter.fallbacks || 0) - Number(cacheBefore.fallbacks || 0)
    }
  ]);
}

main().catch((error) => {
  console.error('\nLoad test failed:', error?.message || error);
  process.exitCode = 1;
});
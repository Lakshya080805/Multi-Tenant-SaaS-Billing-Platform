const DEFAULT_PASSWORD = 'Test@1234';

function nowIso() {
  return new Date().toISOString();
}

export function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) {
      continue;
    }

    const key = raw.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

export function numberArg(args, key, fallback) {
  const value = Number.parseInt(args[key], 10);
  if (Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const raw = await response.text();

  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = { raw };
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    body
  };
}

export function assertStatus(response, expectedStatuses, message) {
  const statuses = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
  if (statuses.includes(response.status)) {
    return;
  }

  throw new Error(
    `${message} (status=${response.status}, body=${JSON.stringify(response.body)})`
  );
}

export async function promisePool(items, concurrency, worker) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const current = cursor;
      cursor += 1;

      if (current >= items.length) {
        return;
      }

      results[current] = await worker(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export async function bootstrapTenant(baseUrl, password = DEFAULT_PASSWORD) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `load-${suffix}@example.com`;

  const registerRes = await requestJson(baseUrl, '/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      organizationName: `Load Org ${suffix}`,
      role: 'admin'
    })
  });

  assertStatus(registerRes, 201, 'Failed to register load-test tenant');

  return {
    email,
    password,
    token: registerRes.body?.data?.accessToken,
    user: registerRes.body?.data?.user
  };
}

export async function createClient(baseUrl, token, nameSuffix) {
  const clientRes = await requestJson(baseUrl, '/api/v1/clients', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      name: `Load Client ${nameSuffix}`,
      email: `client-${nameSuffix}@example.com`
    })
  });

  assertStatus(clientRes, 201, 'Failed to create load-test client');
  return clientRes.body?.data;
}

export async function createInvoice(baseUrl, token, clientId, invoiceNumber, lineItems) {
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  const invoiceRes = await requestJson(baseUrl, '/api/v1/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      clientId,
      invoiceNumber,
      issueDate: issueDate.toISOString(),
      dueDate: dueDate.toISOString(),
      lineItems: lineItems || [
        {
          description: `Load item ${invoiceNumber}`,
          quantity: 1,
          unitPrice: 1000,
          taxRate: 18
        }
      ]
    })
  });

  assertStatus(invoiceRes, 201, 'Failed to create load-test invoice');
  return invoiceRes.body?.data;
}

export async function fetchCacheMetrics(baseUrl) {
  const res = await requestJson(baseUrl, '/metrics/cache');
  assertStatus(res, 200, 'Failed to read cache metrics');
  return res.body?.metrics || {};
}

export function formatTimestampedTitle(title) {
  return `${title} (${nowIso()})`;
}
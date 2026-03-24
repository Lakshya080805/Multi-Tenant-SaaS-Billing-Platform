import { jest } from '@jest/globals';

const executeRedisCommandMock = jest.fn();

await jest.unstable_mockModule('../../src/config/redis.js', () => ({
  executeRedisCommand: executeRedisCommandMock
}));

await jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const {
  buildIdempotencyStorageKey,
  buildRequestFingerprint,
  setIdempotencyResult,
  getIdempotencyResult,
  withPaymentTransitionLock
} = await import('../../src/services/paymentSafetyService.js');

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('paymentSafetyService unit behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    executeRedisCommandMock.mockResolvedValue(null);
  });

  test('buildIdempotencyStorageKey includes org, scope and key', () => {
    const key = buildIdempotencyStorageKey({
      organizationId: 'org-10',
      scope: 'payments:create-order',
      idempotencyKey: 'idem-123'
    });

    expect(key).toContain(':idempotency:org:org-10:payments:create-order:idem-123');
  });

  test('buildRequestFingerprint is stable for object key ordering', () => {
    const a = buildRequestFingerprint({
      method: 'POST',
      scope: 'payments:create-order',
      body: { b: 2, a: 1 },
      params: { y: 2, x: 1 },
      query: { q2: 'v2', q1: 'v1' }
    });

    const b = buildRequestFingerprint({
      method: 'POST',
      scope: 'payments:create-order',
      body: { a: 1, b: 2 },
      params: { x: 1, y: 2 },
      query: { q1: 'v1', q2: 'v2' }
    });

    expect(a).toBe(b);
  });

  test('set/get idempotency falls back to local store when redis unavailable', async () => {
    const storageKey = buildIdempotencyStorageKey({
      organizationId: 'org-11',
      scope: 'payments:verify',
      idempotencyKey: `idem-${Date.now()}`
    });

    const payload = {
      statusCode: 200,
      payload: { success: true },
      requestFingerprint: 'fp-1'
    };

    const setResult = await setIdempotencyResult(storageKey, payload, 60);
    expect(setResult).toBe(false);

    const readBack = await getIdempotencyResult(storageKey);
    expect(readBack).toEqual(payload);
  });

  test('withPaymentTransitionLock blocks concurrent transition on same invoice', async () => {
    const hold = createDeferred();
    let firstStarted = false;

    const firstRun = withPaymentTransitionLock(
      { organizationId: 'org-20', invoiceId: 'inv-1' },
      async () => {
        firstStarted = true;
        await hold.promise;
        return { ok: true };
      },
      5000
    );

    while (!firstStarted) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    await expect(
      withPaymentTransitionLock(
        { organizationId: 'org-20', invoiceId: 'inv-1' },
        async () => ({ shouldNotRun: true }),
        5000
      )
    ).rejects.toMatchObject({
      statusCode: 409
    });

    hold.resolve();
    await expect(firstRun).resolves.toEqual({ ok: true });
  });

  test('withPaymentTransitionLock releases lock after completion', async () => {
    const first = await withPaymentTransitionLock(
      { organizationId: 'org-21', invoiceId: 'inv-2' },
      async () => ({ sequence: 'first' }),
      5000
    );

    const second = await withPaymentTransitionLock(
      { organizationId: 'org-21', invoiceId: 'inv-2' },
      async () => ({ sequence: 'second' }),
      5000
    );

    expect(first).toEqual({ sequence: 'first' });
    expect(second).toEqual({ sequence: 'second' });
  });
});

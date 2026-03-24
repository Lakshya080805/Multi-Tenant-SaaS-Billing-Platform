import { jest } from '@jest/globals';

const executeRedisCommandMock = jest.fn();
const loggerDebugMock = jest.fn();
const loggerInfoMock = jest.fn();
const loggerWarnMock = jest.fn();

await jest.unstable_mockModule('../../src/config/redis.js', () => ({
  executeRedisCommand: executeRedisCommandMock
}));

await jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: {
    debug: loggerDebugMock,
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: jest.fn()
  }
}));

const {
  keyBuilders,
  cacheSet,
  invalidateListKeys,
  invalidateDetailKey,
  invalidateInvoiceRelatedCache
} = await import('../../src/services/cacheService.js');

describe('cacheService unit behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('key builders produce stable keys for equivalent filters', () => {
    const keyA = keyBuilders.invoiceList('org-1', {
      page: 1,
      status: 'sent',
      nested: { b: 2, a: 1 },
      dropMe: undefined
    });

    const keyB = keyBuilders.invoiceList('org-1', {
      status: 'sent',
      nested: { a: 1, b: 2 },
      page: 1
    });

    expect(keyA).toBe(keyB);
    expect(keyA).toContain(':cache:org:org-1:list:invoices:');
    expect(keyBuilders.clientDetail('org-2', 'client-9')).toContain(':cache:org:org-2:detail:clients:client-9');
  });

  test('cacheSet uses default ttl when omitted', async () => {
    executeRedisCommandMock.mockImplementation(async (commandName, operation) => {
      if (commandName === 'SET') {
        const fakeClient = {
          set: jest.fn().mockResolvedValue('OK')
        };
        const result = await operation(fakeClient);
        expect(fakeClient.set).toHaveBeenCalledWith(
          'k:1',
          JSON.stringify({ ok: true }),
          { EX: 60 }
        );
        return result;
      }
      return null;
    });

    const stored = await cacheSet('k:1', { ok: true });
    expect(stored).toBe(true);
  });

  test('cacheSet honors explicit ttl', async () => {
    executeRedisCommandMock.mockImplementation(async (commandName, operation) => {
      if (commandName === 'SET') {
        const fakeClient = {
          set: jest.fn().mockResolvedValue('OK')
        };
        const result = await operation(fakeClient);
        expect(fakeClient.set).toHaveBeenCalledWith(
          'k:2',
          JSON.stringify({ ok: true }),
          { EX: 180 }
        );
        return result;
      }
      return null;
    });

    const stored = await cacheSet('k:2', { ok: true }, { ttlSeconds: 180 });
    expect(stored).toBe(true);
  });

  test('invalidateListKeys scans and deletes matching keys', async () => {
    const deletedKeys = [];

    executeRedisCommandMock.mockImplementation(async (commandName, operation) => {
      if (commandName === 'SCAN') {
        const fakeClient = {
          scan: jest
            .fn()
            .mockResolvedValueOnce(['1', ['k:a', 'k:b']])
            .mockResolvedValueOnce(['0', ['k:c']])
        };
        return operation(fakeClient);
      }

      if (commandName === 'DEL') {
        const fakeClient = {
          del: jest.fn().mockImplementation(async (keys) => {
            deletedKeys.push(...keys);
            return keys.length;
          })
        };
        return operation(fakeClient);
      }

      return null;
    });

    const deletedCount = await invalidateListKeys('invoices', 'org-3', { reason: 'unit-test' });

    expect(deletedCount).toBe(3);
    expect(deletedKeys).toEqual(['k:a', 'k:b', 'k:c']);
  });

  test('invalidateDetailKey returns zero when entity id missing', async () => {
    const deletedCount = await invalidateDetailKey('invoices', 'org-3', undefined);
    expect(deletedCount).toBe(0);
    expect(executeRedisCommandMock).not.toHaveBeenCalled();
  });

  test('invalidateInvoiceRelatedCache combines list and dashboard invalidation', async () => {
    let scanInvocation = 0;

    executeRedisCommandMock.mockImplementation(async (commandName, operation) => {
      if (commandName === 'SCAN') {
        scanInvocation += 1;
        const scanRows = scanInvocation === 1 ? ['list:1', 'list:2'] : ['dash:1'];
        const fakeClient = {
          scan: jest.fn().mockResolvedValueOnce(['0', scanRows])
        };
        return operation(fakeClient);
      }

      if (commandName === 'DEL') {
        const fakeClient = {
          del: jest.fn().mockImplementation(async (keys) => keys.length)
        };
        return operation(fakeClient);
      }

      return null;
    });

    const totalDeleted = await invalidateInvoiceRelatedCache('org-4', { trigger: 'test' });
    expect(totalDeleted).toBe(3);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Invoice-related cache invalidated',
      expect.objectContaining({ organizationId: 'org-4', totalDeleted: 3, trigger: 'test' })
    );
  });
});

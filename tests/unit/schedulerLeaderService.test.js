import { jest } from '@jest/globals';

const executeRedisCommandMock = jest.fn();

await jest.unstable_mockModule('../../src/config/redis.js', () => ({
  executeRedisCommand: executeRedisCommandMock
}));

const {
  withSchedulerLeaderLock,
  resetSchedulerLeaderStateForTests
} = await import('../../src/services/schedulerLeaderService.js');

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('scheduler leader coordination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    executeRedisCommandMock.mockResolvedValue(null);
    resetSchedulerLeaderStateForTests();
  });

  test('allows only one concurrent execution per task key', async () => {
    const hold = createDeferred();
    let firstStarted = false;

    const firstRun = withSchedulerLeaderLock(
      { taskName: 'invoice-reminder-daily', instanceId: 'instance-a', ttlMs: 5000 },
      async () => {
        firstStarted = true;
        await hold.promise;
        return { worker: 'first' };
      }
    );

    while (!firstStarted) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const secondRun = await withSchedulerLeaderLock(
      { taskName: 'invoice-reminder-daily', instanceId: 'instance-b', ttlMs: 5000 },
      async () => ({ worker: 'second' })
    );

    expect(secondRun).toEqual({
      executed: false,
      reason: 'leader_lock_not_acquired'
    });

    hold.resolve();
    const firstResult = await firstRun;

    expect(firstResult.executed).toBe(true);
    expect(firstResult.result).toEqual({ worker: 'first' });
  });

  test('releases lock after completion so next execution can proceed', async () => {
    const firstResult = await withSchedulerLeaderLock(
      { taskName: 'invoice-reminder-daily', instanceId: 'instance-a', ttlMs: 5000 },
      async () => ({ sequence: 'first' })
    );

    const secondResult = await withSchedulerLeaderLock(
      { taskName: 'invoice-reminder-daily', instanceId: 'instance-b', ttlMs: 5000 },
      async () => ({ sequence: 'second' })
    );

    expect(firstResult.executed).toBe(true);
    expect(secondResult.executed).toBe(true);
    expect(firstResult.result).toEqual({ sequence: 'first' });
    expect(secondResult.result).toEqual({ sequence: 'second' });
  });

  test('does not block parallel execution for different task keys', async () => {
    const lockOne = createDeferred();
    const lockTwo = createDeferred();

    const firstRun = withSchedulerLeaderLock(
      { taskName: 'invoice-reminder-daily', instanceId: 'instance-a', ttlMs: 5000 },
      async () => {
        await lockOne.promise;
        return { task: 'invoice-reminder-daily' };
      }
    );

    const secondRun = withSchedulerLeaderLock(
      { taskName: 'another-scheduled-task', instanceId: 'instance-b', ttlMs: 5000 },
      async () => {
        await lockTwo.promise;
        return { task: 'another-scheduled-task' };
      }
    );

    lockOne.resolve();
    lockTwo.resolve();

    const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);

    expect(firstResult.executed).toBe(true);
    expect(secondResult.executed).toBe(true);
    expect(firstResult.result).toEqual({ task: 'invoice-reminder-daily' });
    expect(secondResult.result).toEqual({ task: 'another-scheduled-task' });
  });
});

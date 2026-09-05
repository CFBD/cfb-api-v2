import { databasePoolMax, resolveWorkerCount } from './workers';

describe('worker and connection budgets', () => {
  const originalWorkers = process.env.API_WORKERS;
  const originalCount = process.env.CFBD_WORKER_COUNT;
  afterEach(() => {
    if (originalWorkers === undefined) delete process.env.API_WORKERS;
    else process.env.API_WORKERS = originalWorkers;
    if (originalCount === undefined) delete process.env.CFBD_WORKER_COUNT;
    else process.env.CFBD_WORKER_COUNT = originalCount;
  });
  test('defaults to two workers with a one-core fallback', () => {
    delete process.env.API_WORKERS;
    expect(resolveWorkerCount(undefined, 8)).toBe(2);
    expect(resolveWorkerCount(undefined, 2)).toBe(2);
    expect(resolveWorkerCount(undefined, 1)).toBe(1);
    expect(resolveWorkerCount('1', 8)).toBe(1);
    expect(resolveWorkerCount('2', 1)).toBe(2);
  });
  test.each(['0', '3', 'all', ''])(
    'rejects invalid worker count %s',
    (value) => {
      expect(() => resolveWorkerCount(value, 2)).toThrow('API_WORKERS');
    },
  );
  test('preserves the total connection budget across workers', () => {
    delete process.env.CFBD_WORKER_COUNT;
    expect(databasePoolMax()).toBe(10);
    process.env.CFBD_WORKER_COUNT = '2';
    expect(databasePoolMax() * 2).toBe(10);
    process.env.CFBD_WORKER_COUNT = '1';
    expect(databasePoolMax()).toBe(10);
  });
});

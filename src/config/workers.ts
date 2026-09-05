import { availableParallelism } from 'node:os';

export const resolveWorkerCount = (
  value = process.env.API_WORKERS,
  available = availableParallelism(),
): number => {
  if (value === undefined) return Math.min(2, Math.max(1, available));
  if (value !== '1' && value !== '2')
    throw new Error('API_WORKERS must be 1 or 2.');
  return Number(value);
};

// Set by the launcher; direct development starts retain the original pool size.
export const databasePoolMax = (): number => {
  const count = process.env.CFBD_WORKER_COUNT ?? '1';
  if (count !== '1' && count !== '2')
    throw new Error('Invalid CFBD_WORKER_COUNT.');
  return 10 / Number(count);
};

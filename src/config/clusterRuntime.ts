import cluster from 'node:cluster';
import {
  attachConcurrencyCoordinator,
  ConcurrencyStore,
} from './concurrencyCoordinator';
import { resolveWorkerCount } from './workers';

export const runCluster = (
  exec: string,
  count = resolveWorkerCount(),
): void => {
  if (!cluster.isPrimary)
    throw new Error('The cluster launcher must run in the primary process.');
  const store = new ConcurrencyStore();
  const retries = new Set<NodeJS.Timeout>();
  let stopping = false;
  let killTimer: NodeJS.Timeout | undefined;
  cluster.schedulingPolicy = cluster.SCHED_RR;
  cluster.setupPrimary({ exec });

  const fork = (failures = 0): void => {
    if (stopping) return;
    const startedAt = Date.now();
    const worker = cluster.fork({ CFBD_WORKER_COUNT: String(count) });
    attachConcurrencyCoordinator(worker.id, worker, store);
    worker.on('error', (error) => console.error('API worker error', error));
    worker.on('disconnect', () => {
      // A worker without its admission coordinator must stop serving requests.
      if (!worker.isDead()) worker.kill('SIGTERM');
    });
    worker.on('exit', () => {
      if (stopping) {
        if (Object.keys(cluster.workers ?? {}).length === 0) {
          clearTimeout(killTimer);
          store.clear();
          process.exit(0);
        }
        return;
      }
      const nextFailures =
        Date.now() - startedAt >= 30_000 ? 0 : Math.min(failures + 1, 5);
      const delay = Math.min(1000 * 2 ** failures, 30_000);
      console.error(
        `API worker ${worker.process.pid} exited; replacing in ${delay}ms.`,
      );
      const timer = setTimeout(() => {
        retries.delete(timer);
        fork(nextFailures);
      }, delay);
      retries.add(timer);
    });
  };

  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    for (const timer of retries) clearTimeout(timer);
    const workers = Object.values(cluster.workers ?? {}).filter(
      (worker) => worker !== undefined,
    );
    if (workers.length === 0) {
      store.clear();
      process.exit(0);
    }
    for (const worker of workers) worker.kill('SIGTERM');
    // Finish within Docker's default ten-second stop window.
    killTimer = setTimeout(() => {
      for (const worker of Object.values(cluster.workers ?? {}))
        worker?.kill('SIGKILL');
    }, 9000);
    killTimer.unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  for (let i = 0; i < count; i += 1) fork();
};

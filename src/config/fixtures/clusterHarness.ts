// Database-free subprocess fixture for the real cluster/IPC/shutdown test.
import cluster from 'node:cluster';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { runCluster } from '../clusterRuntime';
import { WorkerConcurrencyClient } from '../concurrencyCoordinator';
import { installGracefulShutdown } from '../serverLifecycle';

if (cluster.isPrimary) {
  runCluster(__filename, 2);
  cluster.on('listening', (worker, address) => {
    process.send?.({
      type: 'ready',
      pid: worker.process.pid,
      port: address.port,
    });
  });
  cluster.on('message', (_worker, message) => process.send?.(message));
  process.on('message', (message: { kill?: number }) => {
    for (const worker of Object.values(cluster.workers ?? {})) {
      if (worker && worker.process.pid === message.kill) worker.kill('SIGKILL');
    }
  });
} else {
  const client = new WorkerConcurrencyClient(process);
  const server = createServer((req, res) => {
    void (async () => {
      if (req.url === '/slow') {
        process.send?.({ type: 'slow', pid: process.pid });
        await new Promise((resolve) => setTimeout(resolve, 250));
        res.end('drained');
        return;
      }
      const release = await client.acquire('user:live', 2, 60_000);
      // Deliberately retain leases until process exit to test owner cleanup.
      res.end(JSON.stringify({ pid: process.pid, allowed: release !== null }));
    })().catch(() => {
      res.statusCode = 503;
      res.end();
    });
  });
  server.listen(0, '127.0.0.1', () => {
    const address = server.address() as AddressInfo;
    if (!address.port) throw new Error('Missing listening port');
  });
  installGracefulShutdown(server, async () => {
    client.close();
  });
}

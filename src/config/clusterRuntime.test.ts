import { fork } from 'node:child_process';
import { get } from 'node:http';
import path from 'node:path';

type HarnessMessage = { type: string; pid: number; port?: number };

const request = (port: number, route = '/') =>
  new Promise<string>((resolve, reject) => {
    const req = get(
      { hostname: '127.0.0.1', port, path: route, agent: false },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve(body));
      },
    );
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Request timed out')));
  });

test('two real workers share a port and limit, replace a crash, and drain on shutdown', async () => {
  const child = fork(path.join(__dirname, 'fixtures/clusterHarness.ts'), [], {
    execArgv: ['-r', require.resolve('ts-node/register/transpile-only')],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const seen: HarnessMessage[] = [];
  let output = '';
  child.stdout?.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr?.on('data', (chunk) => {
    output += chunk;
  });
  child.on('message', (message) => seen.push(message as HarnessMessage));
  const exited = new Promise<number | null>((resolve) =>
    child.once('exit', resolve),
  );
  const until = async (predicate: () => boolean) => {
    const deadline = Date.now() + 12_000;
    while (!predicate()) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error(`Cluster did not reach expected state: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  try {
    await until(() => seen.filter((m) => m.type === 'ready').length === 2);
    const ready = seen.filter((m) => m.type === 'ready');
    expect(new Set(ready.map((m) => m.pid)).size).toBe(2);
    expect(ready[0].port).toBe(ready[1].port);
    const port = ready[0].port!;
    const responses: { pid: number; allowed: boolean }[] = [];
    for (let i = 0; i < 12; i += 1)
      responses.push(JSON.parse(await request(port)));
    expect(new Set(responses.map((r) => r.pid)).size).toBe(2);
    expect(responses.filter((r) => r.allowed)).toHaveLength(2);
    const killed = responses.find((r) => r.allowed)!.pid;
    const releasedCount = responses.filter(
      (r) => r.allowed && r.pid === killed,
    ).length;
    child.send({ kill: killed });
    await until(() => seen.filter((m) => m.type === 'ready').length === 3);
    const replacement = seen.filter((m) => m.type === 'ready')[2];
    expect(ready.map((m) => m.pid)).not.toContain(replacement.pid);
    expect(replacement.port).toBe(port);
    const after: { allowed: boolean }[] = [];
    for (let i = 0; i < 8; i += 1) after.push(JSON.parse(await request(port)));
    expect(after.filter((r) => r.allowed)).toHaveLength(releasedCount);
    const inflight = request(port, '/slow');
    await until(() => seen.some((m) => m.type === 'slow'));
    child.kill('SIGTERM');
    expect(await inflight).toBe('drained');
    expect(await exited).toBe(0);
    expect(seen.filter((m) => m.type === 'ready')).toHaveLength(3);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await exited;
    }
  }
}, 30_000);

import { EventEmitter } from 'node:events';
import {
  attachConcurrencyCoordinator,
  ConcurrencyStore,
  WorkerConcurrencyClient,
} from './concurrencyCoordinator';

class Peer extends EventEmitter {
  connected = true;
  other!: Peer;
  send(message: object, callback: (error: Error | null) => void): boolean {
    queueMicrotask(() => {
      this.other.emit('message', message);
      callback(null);
    });
    return true;
  }
}
const connect = (owner: number, store: ConcurrencyStore) => {
  const primary = new Peer();
  const worker = new Peer();
  primary.other = worker;
  worker.other = primary;
  attachConcurrencyCoordinator(owner, primary, store);
  return { primary, worker, client: new WorkerConcurrencyClient(worker, 100) };
};

describe('cluster concurrency coordination', () => {
  let store: ConcurrencyStore;
  beforeEach(() => {
    store = new ConcurrencyStore();
  });
  afterEach(() => {
    store.clear();
    jest.useRealTimers();
  });

  test('enforces one user limit across both workers and releases on worker exit', async () => {
    const a = connect(1, store);
    const b = connect(2, store);
    try {
      const first = await a.client.acquire('user1:live', 2, 1000);
      const second = await b.client.acquire('user1:live', 2, 1000);
      expect(first).toBeInstanceOf(Function);
      expect(second).toBeInstanceOf(Function);
      expect(await a.client.acquire('user1:live', 2, 1000)).toBeNull();
      expect(await b.client.acquire('user2:live', 2, 1000)).toBeInstanceOf(
        Function,
      );
      a.primary.emit('exit');
      const replacement = await b.client.acquire('user1:live', 2, 1000);
      expect(replacement).toBeInstanceOf(Function);
      first?.(); // A late release from the exited worker cannot free a new lease.
      expect(await b.client.acquire('user1:live', 2, 1000)).toBeNull();
      second?.();
      second?.();
      expect(await b.client.acquire('user1:live', 2, 1000)).toBeInstanceOf(
        Function,
      );
      expect(await b.client.acquire('user1:live', 2, 1000)).toBeNull();
    } finally {
      a.client.close();
      b.client.close();
    }
  });

  test('expired leases and late completion never release another request', () => {
    jest.useFakeTimers();
    expect(store.acquire(1, 'old', 'user', 1, 100)).toBe(true);
    jest.advanceTimersByTime(100);
    expect(store.acquire(2, 'new', 'user', 1, 100)).toBe(true);
    store.release(1, 'old');
    expect(store.acquire(1, 'third', 'user', 1, 100)).toBe(false);
    store.releaseOwner(2);
    expect(store.acquire(1, 'third', 'user', 1, 100)).toBe(true);
  });

  test('times out admission and frees a late grant', async () => {
    jest.useFakeTimers();
    const peer = new EventEmitter() as Peer;
    peer.connected = true;
    peer.send = jest.fn().mockReturnValue(true);
    const client = new WorkerConcurrencyClient(peer, 100);
    const admission = client.acquire('user', 2, 1000);
    const rejected = expect(admission).rejects.toThrow('timed out');
    const request = (peer.send as jest.Mock).mock.calls[0][0];
    jest.advanceTimersByTime(100);
    await rejected;
    peer.emit('message', { ...request, action: 'result', allowed: true });
    expect(peer.send).toHaveBeenLastCalledWith(
      { channel: 'cfbd:concurrency', action: 'release', id: request.id },
      expect.any(Function),
    );
    client.close();
  });

  test('fails admission when IPC disconnects or cannot send', async () => {
    const peer = new EventEmitter() as Peer;
    peer.connected = true;
    peer.send = jest.fn().mockReturnValue(true);
    const client = new WorkerConcurrencyClient(peer);
    const admission = client.acquire('user', 2, 1000);
    peer.connected = false;
    peer.emit('disconnect');
    await expect(admission).rejects.toThrow('disconnected');
    await expect(client.acquire('user', 2, 1000)).rejects.toThrow(
      'IPC unavailable',
    );
    client.close();
  });

  test('releases a grant whose reply cannot reach the worker', () => {
    const peer = new EventEmitter() as Peer;
    peer.send = (_message, callback) => {
      callback(new Error('broken pipe'));
      return false;
    };
    attachConcurrencyCoordinator(1, peer, store);
    peer.emit('message', {
      channel: 'cfbd:concurrency',
      action: 'acquire',
      id: 'lost',
      key: 'user',
      max: 1,
      leaseMs: 1000,
    });
    expect(store.acquire(2, 'next', 'user', 1, 1000)).toBe(true);
  });
});

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

const channel = 'cfbd:concurrency';
export type ReleaseSlot = () => void;
export interface ConcurrencyBackend {
  acquire(
    key: string,
    max: number,
    leaseMs: number,
  ): Promise<ReleaseSlot | null>;
}

export class ConcurrencyStore {
  private readonly counts = new Map<string, number>();
  private readonly leases = new Map<
    string,
    { owner: number; key: string; timer: NodeJS.Timeout }
  >();

  acquire(
    owner: number,
    id: string,
    key: string,
    max: number,
    leaseMs: number,
  ): boolean {
    const token = `${owner}:${id}`;
    if (this.leases.has(token)) return true;
    const count = this.counts.get(key) ?? 0;
    if (count >= max) return false;
    this.counts.set(key, count + 1);
    const timer = setTimeout(() => this.release(owner, id), leaseMs);
    timer.unref();
    this.leases.set(token, { owner, key, timer });
    return true;
  }

  release(owner: number, id: string): void {
    const token = `${owner}:${id}`;
    const lease = this.leases.get(token);
    if (!lease) return;
    clearTimeout(lease.timer);
    this.leases.delete(token);
    const remaining = (this.counts.get(lease.key) ?? 1) - 1;
    if (remaining === 0) this.counts.delete(lease.key);
    else this.counts.set(lease.key, remaining);
  }

  releaseOwner(owner: number): void {
    for (const [token, lease] of this.leases) {
      if (lease.owner === owner)
        this.release(owner, token.slice(token.indexOf(':') + 1));
    }
  }

  clear(): void {
    for (const lease of this.leases.values()) clearTimeout(lease.timer);
    this.leases.clear();
    this.counts.clear();
  }
}

export const localConcurrencyBackend = (): ConcurrencyBackend => {
  const store = new ConcurrencyStore();
  return {
    acquire: async (key, max, leaseMs) => {
      const id = randomUUID();
      return store.acquire(0, id, key, max, leaseMs)
        ? () => store.release(0, id)
        : null;
    },
  };
};

interface IpcPeer extends Pick<EventEmitter, 'on' | 'off'> {
  connected?: boolean;
  send?: (message: object, callback: (error: Error | null) => void) => boolean;
}

type Message = {
  channel: typeof channel;
  action: 'acquire' | 'release' | 'result';
  id: string;
  key?: string;
  max?: number;
  leaseMs?: number;
  allowed?: boolean;
};

const isMessage = (value: unknown): value is Message => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<Message>;
  return (
    message.channel === channel &&
    typeof message.id === 'string' &&
    message.id.length <= 128 &&
    ['acquire', 'release', 'result'].includes(message.action ?? '')
  );
};

export const attachConcurrencyCoordinator = (
  owner: number,
  peer: IpcPeer,
  store: ConcurrencyStore,
): void => {
  peer.on('message', (message: unknown) => {
    if (!isMessage(message)) return;
    if (message.action === 'release') {
      store.release(owner, message.id);
      return;
    }
    if (
      message.action !== 'acquire' ||
      typeof message.key !== 'string' ||
      message.key.length > 1024 ||
      !Number.isInteger(message.max) ||
      !Number.isInteger(message.leaseMs) ||
      (message.max ?? 0) < 1 ||
      (message.max ?? 0) > 1000 ||
      (message.leaseMs ?? 0) < 1 ||
      (message.leaseMs ?? 0) > 600_000
    )
      return;
    const allowed = store.acquire(
      owner,
      message.id,
      message.key,
      message.max!,
      message.leaseMs!,
    );
    const reply: Message = {
      channel,
      action: 'result',
      id: message.id,
      allowed,
    };
    try {
      if (!peer.send) throw new Error('IPC unavailable');
      peer.send(reply, (error) => {
        if (error) store.release(owner, message.id);
      });
    } catch {
      store.release(owner, message.id);
    }
  });
  // Do not free slots merely on disconnect: the worker may still be computing.
  peer.on('exit', () => store.releaseOwner(owner));
};

export class WorkerConcurrencyClient implements ConcurrencyBackend {
  private readonly pending = new Map<
    string,
    {
      resolve: (release: ReleaseSlot | null) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  constructor(
    private readonly peer: IpcPeer,
    private readonly timeoutMs = 5000,
  ) {
    peer.on('message', this.onMessage);
    peer.on('disconnect', this.onDisconnect);
  }

  private send(message: Message, onError: (error: Error) => void): void {
    try {
      if (!this.peer.send || this.peer.connected === false)
        throw new Error('IPC unavailable');
      this.peer.send(message, (error) => {
        if (error) onError(error);
      });
    } catch (error) {
      onError(error instanceof Error ? error : new Error('IPC unavailable'));
    }
  }

  private release(id: string): void {
    this.send({ channel, action: 'release', id }, () => undefined);
  }

  private fail(id: string, error: Error): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    // Ordered after acquisition on the same IPC channel; late grants are freed.
    this.release(id);
    pending.reject(error);
  }

  private readonly onMessage = (value: unknown): void => {
    if (
      !isMessage(value) ||
      value.action !== 'result' ||
      typeof value.allowed !== 'boolean'
    )
      return;
    const pending = this.pending.get(value.id);
    if (!pending) {
      if (value.allowed) this.release(value.id);
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(value.id);
    let released = false;
    pending.resolve(
      value.allowed
        ? () => {
            if (released) return;
            released = true;
            this.release(value.id);
          }
        : null,
    );
  };

  private readonly onDisconnect = (): void => {
    for (const id of this.pending.keys())
      this.fail(id, new Error('Concurrency coordinator disconnected'));
  };

  acquire(
    key: string,
    max: number,
    leaseMs: number,
  ): Promise<ReleaseSlot | null> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(
        () => this.fail(id, new Error('Concurrency coordinator timed out')),
        this.timeoutMs,
      );
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      this.send(
        { channel, action: 'acquire', id, key, max, leaseMs },
        (error) => this.fail(id, error),
      );
    });
  }

  close(): void {
    this.onDisconnect();
    this.peer.off('message', this.onMessage);
    this.peer.off('disconnect', this.onDisconnect);
  }
}

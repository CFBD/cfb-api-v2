import { randomUUID } from 'crypto';
import { getRedisClient } from '../../config/redis';
import { checkDeadline, PreviewDataError } from './previewRead';

const prefix = 'cfb-api:v1:game-preview:';
const publishScript =
  "if redis.call('get',KEYS[1]) == ARGV[1] then " +
  "redis.call('psetex',KEYS[2],ARGV[2],ARGV[3]); return 1 else return 0 end";
const releaseScript =
  "if redis.call('get',KEYS[1]) == ARGV[1] then " +
  "return redis.call('del',KEYS[1]) else return 0 end";
export const waitUntil = async <T>(
  work: Promise<T>,
  deadline: number,
): Promise<T> => {
  checkDeadline(deadline);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new PreviewDataError('source_error')),
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
const command = <T>(work: Promise<T>) => waitUntil(work, Date.now() + 250);
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const cacheLifetime = (data: unknown, ttl: number): number => {
  if (Array.isArray(data))
    return data.reduce((min, v) => Math.min(min, cacheLifetime(v, ttl)), ttl);
  if (!object(data)) return ttl;
  const own =
    data.status === 'unavailable'
      ? 5000
      : data.status === 'no_data'
        ? 60000
        : ttl;
  return Object.values(data).reduce<number>(
    (min, v) => Math.min(min, cacheLifetime(v, ttl)),
    Math.min(own, ttl),
  );
};

// One queue per worker; component loaders never enqueue nested refresh jobs.
export interface PreviewRedis {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ): Promise<string | null>;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
}
export const createPreviewCache = (
  redis: () => Promise<PreviewRedis | null> = getRedisClient,
) => {
  const pending = new Map<string, Promise<unknown>>();
  let active = 0;
  const queue: Array<() => void> = [];
  const refresh = async <T>(
    deadline: number,
    load: () => Promise<T>,
  ): Promise<T> => {
    if (active >= 2) {
      if (queue.length >= 16) throw new PreviewDataError('source_error');
      await new Promise<void>((resolve, reject) => {
        const start = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(
          () => {
            const index = queue.indexOf(start);
            if (index >= 0) queue.splice(index, 1);
            reject(new PreviewDataError('source_error'));
          },
          Math.max(1, deadline - Date.now()),
        );
        queue.push(start);
      });
    } else active++;
    try {
      checkDeadline(deadline);
      return await load();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
  return async <T>(
    identity: string,
    ttl: number,
    valid: (value: unknown) => value is T,
    load: () => Promise<T>,
    deadline: number,
    observe: (outcome: string) => void = () => undefined,
  ): Promise<T> => {
    const key = prefix + identity;
    const parse = (raw: string | null): T | undefined => {
      if (!raw) return undefined;
      try {
        const entry: unknown = JSON.parse(raw);
        if (
          !object(entry) ||
          entry.version !== 1 ||
          entry.identity !== identity ||
          typeof entry.assembledAt !== 'number' ||
          typeof entry.expiresAt !== 'number' ||
          !Number.isFinite(entry.assembledAt) ||
          !Number.isFinite(entry.expiresAt) ||
          entry.assembledAt > Date.now() ||
          entry.expiresAt <= Date.now() ||
          entry.expiresAt <= entry.assembledAt ||
          entry.expiresAt - entry.assembledAt > ttl ||
          !valid(entry.data)
        )
          return undefined;
        return entry.data;
      } catch {
        return undefined;
      }
    };
    let work = pending.get(key);
    if (work) observe('local_follower');
    if (!work) {
      work = (async () => {
        let client;
        let token: string | undefined;
        const lock = key + ':lock';
        try {
          client = await command(redis());
          if (client) {
            const hit = parse(await command(client.get(key)));
            if (hit !== undefined) {
              observe('hit');
              return hit;
            }
            const candidate = randomUUID();
            if (
              (await command(
                client.set(lock, candidate, { NX: true, PX: 10000 }),
              )) === 'OK'
            )
              token = candidate;
            else {
              const until = Math.min(deadline, Date.now() + 1000);
              while (Date.now() < until) {
                await new Promise((resolve) => setTimeout(resolve, 50));
                const followed = parse(await command(client.get(key)));
                if (followed !== undefined) {
                  observe('redis_follower');
                  return followed;
                }
              }
            }
          }
        } catch {
          client = null;
        }
        try {
          observe(client && token ? 'refresh' : 'fallback');
          const data = await refresh(deadline, load);
          if (!valid(data)) throw new PreviewDataError();
          checkDeadline(deadline);
          if (client && token) {
            const assembledAt = Date.now();
            const lifetime = cacheLifetime(data, ttl);
            const entry = JSON.stringify({
              version: 1,
              identity,
              assembledAt,
              expiresAt: assembledAt + lifetime,
              data,
            });
            try {
              await command(
                client.eval(publishScript, {
                  keys: [lock, key],
                  arguments: [token, String(lifetime), entry],
                }),
              );
            } catch {
              /* A cache failure does not discard successful source data. */
            }
          }
          return data;
        } finally {
          if (client && token) {
            try {
              await command(
                client.eval(releaseScript, {
                  keys: [lock],
                  arguments: [token],
                }),
              );
            } catch {
              /* The finite lease also releases abandoned locks. */
            }
          }
        }
      })();
      pending.set(key, work);
      void work.finally(() => pending.delete(key)).catch(() => undefined);
    }
    const value = await waitUntil(work, deadline);
    if (!valid(value)) throw new PreviewDataError();
    return value;
  };
};
export const previewCache = createPreviewCache();

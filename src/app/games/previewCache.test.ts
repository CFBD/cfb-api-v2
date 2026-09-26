import {
  createPreviewCache,
  PreviewRedis,
  cacheLifetime,
} from './previewCache';
const valid = (v: unknown): v is { value: number } =>
  typeof v === 'object' &&
  v !== null &&
  'value' in v &&
  typeof v.value === 'number' &&
  Number.isFinite(v.value);
const fakeRedis = () => {
  const entries = new Map<string, { value: string; expires: number }>();
  const get = (key: string) => {
    const entry = entries.get(key);
    return entry && entry.expires > Date.now() ? entry.value : null;
  };
  const client: PreviewRedis = {
    get: jest.fn(async (key) => get(key)),
    set: jest.fn(async (key, value, options) => {
      if (get(key) !== null) return null;
      entries.set(key, { value, expires: Date.now() + options.PX });
      return 'OK';
    }),
    eval: jest.fn(async (script, { keys, arguments: args }) => {
      if (get(keys[0]) !== args[0]) return 0;
      if (script.includes('psetex'))
        entries.set(keys[1], {
          value: args[2],
          expires: Date.now() + Number(args[1]),
        });
      else entries.delete(keys[0]);
      return 1;
    }),
  };
  return { client, entries };
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
afterEach(() => jest.useRealTimers());
it('coalesces locally and across two workers while retaining cached data', async () => {
  const { client } = fakeRedis();
  const a = createPreviewCache(async () => client),
    b = createPreviewCache(async () => client);
  const load = jest.fn(async () => {
    await new Promise((r) => setTimeout(r, 10));
    return { value: 1 };
  });
  const result = await Promise.all([
    a('x', 1000, valid, load, Date.now() + 2000),
    a('x', 1000, valid, load, Date.now() + 2000),
    b('x', 1000, valid, load, Date.now() + 2000),
  ]);
  expect(result).toEqual([{ value: 1 }, { value: 1 }, { value: 1 }]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(await b('x', 1000, valid, load, Date.now() + 2000)).toEqual({
    value: 1,
  });
  expect(load).toHaveBeenCalledTimes(1);
});
it.each([
  'not-json',
  JSON.stringify({ version: 2 }),
  JSON.stringify({
    version: 1,
    identity: 'wrong',
    assembledAt: Date.now(),
    expiresAt: Date.now() + 1000,
    data: { value: 7 },
  }),
])('rejects corrupt cache %s', async (raw) => {
  const { client, entries } = fakeRedis();
  entries.set('cfb-api:v1:game-preview:x', {
    value: raw,
    expires: Date.now() + 1000,
  });
  const load = jest.fn(async () => ({ value: 2 }));
  expect(
    await createPreviewCache(async () => client)(
      'x',
      1000,
      valid,
      load,
      Date.now() + 2000,
    ),
  ).toEqual({ value: 2 });
  expect(load).toHaveBeenCalledTimes(1);
});
it('bounds a hung Redis connection and falls back without waiting forever', async () => {
  jest.useFakeTimers();
  const cache = createPreviewCache(() => new Promise(() => undefined));
  const result = cache(
    'x',
    1000,
    valid,
    async () => ({ value: 3 }),
    Date.now() + 2000,
  );
  await jest.advanceTimersByTimeAsync(251);
  await expect(result).resolves.toEqual({ value: 3 });
});
it('does not publish or release another owners lock after lease expiry', async () => {
  jest.useFakeTimers();
  const { client, entries } = fakeRedis(),
    load = deferred<{ value: number }>();
  const a = createPreviewCache(async () => client),
    b = createPreviewCache(async () => client);
  const first = a('x', 1000, valid, () => load.promise, Date.now() + 15000);
  await jest.advanceTimersByTimeAsync(10001);
  expect(
    await b('x', 1000, valid, async () => ({ value: 2 }), Date.now() + 2000),
  ).toEqual({ value: 2 });
  load.resolve({ value: 1 });
  await first;
  expect(
    JSON.parse(entries.get('cfb-api:v1:game-preview:x')!.value).data,
  ).toEqual({ value: 2 });
});
it('keeps late underlying work coalesced and holds its active slot', async () => {
  jest.useFakeTimers();
  const cache = createPreviewCache(async () => null),
    load = deferred<{ value: number }>(),
    reader = jest.fn(() => load.promise);
  const first = cache('x', 1000, valid, reader, Date.now() + 20);
  const caught = first.catch(() => undefined);
  await jest.advanceTimersByTimeAsync(21);
  await caught;
  const second = cache('x', 1000, valid, reader, Date.now() + 2000).catch(
    () => undefined,
  );
  expect(reader).toHaveBeenCalledTimes(1);
  load.resolve({ value: 1 });
  await second;
  expect(reader).toHaveBeenCalledTimes(1);
  expect(
    await cache(
      'x',
      1000,
      valid,
      async () => ({ value: 2 }),
      Date.now() + 2000,
    ),
  ).toEqual({ value: 2 });
});
it('limits distinct refreshes to two active and sixteen queued', async () => {
  jest.useFakeTimers();
  const cache = createPreviewCache(async () => null),
    load = deferred<{ value: number }>(),
    reader = jest.fn(() => load.promise);
  const calls = Array.from({ length: 20 }, (_, i) =>
    cache(String(i), 1000, valid, reader, Date.now() + 2000).then(
      () => true,
      () => false,
    ),
  );
  await jest.advanceTimersByTimeAsync(1);
  expect(reader).toHaveBeenCalledTimes(2);
  load.resolve({ value: 1 });
  const results = await Promise.all(calls);
  expect(results.filter(Boolean)).toHaveLength(18);
});
it('shortens composite absence/failure reuse', () => {
  expect(cacheLifetime({ team: { status: 'no_data' } }, 600000)).toBe(60000);
  expect(cacheLifetime({ team: { status: 'unavailable' } }, 600000)).toBe(5000);
});

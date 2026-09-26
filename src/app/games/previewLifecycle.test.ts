import { getGamePreview, getAdjustedGamePreview } from './preview';
import { getGameSchedule } from './schedule';
import * as reads from './previewRead';
import { testDatabase, gameRow } from './fixtures/game-previews/testing';
import { getRedisClient } from '../../config/redis';

jest.mock('../../config/redis', () => {
  const entries = new Map<string, string>();
  return {
    getRedisClient: jest.fn(async () => ({
      get: async (key: string) => entries.get(key) ?? null,
      set: async (key: string, value: string) => {
        if (entries.has(key)) return null;
        entries.set(key, value);
        return 'OK';
      },
      eval: async (
        script: string,
        { keys, arguments: args }: { keys: string[]; arguments: string[] },
      ) => {
        if (entries.get(keys[0]) !== args[0]) return 0;
        if (script.includes('psetex')) entries.set(keys[1], args[2]);
        else entries.delete(keys[0]);
        return 1;
      },
      flush: () => entries.clear(),
    })),
  };
});
const start = Date.parse('2025-09-25T12:00:00Z');
beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout'] });
  jest.setSystemTime(start);
  const client = await getRedisClient();
  if (client && 'flush' in client && typeof client.flush === 'function')
    client.flush();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
const install = async (respond: Parameters<typeof testDatabase>[0]) => {
  const result = await testDatabase(respond);
  jest
    .spyOn(reads, 'previewRead')
    .mockImplementation((_deadline, read) => read(result.db));
  return result;
};
it('returns completed metadata from either endpoint with only one shared core query', async () => {
  const { queries } = await install(() => [
    { ...gameRow, status: 'completed' },
  ]);
  expect((await getGamePreview(123)).analysis).toBeNull();
  expect((await getAdjustedGamePreview(123)).analysis).toBeNull();
  expect(queries).toHaveLength(1);
});
it('serves warm components without source reads and keeps analysis at kickoff', async () => {
  const { queries } = await install((q) =>
    q.sql.includes('current_home_score')
      ? [{ ...gameRow, startDate: '2025-09-25 12:00:05' }]
      : [],
  );
  const first = await getGamePreview(123);
  expect(first.availability).toBe('pregame');
  const count = queries.length;
  expect(count).toBe(9);
  const second = await getGamePreview(123);
  expect(queries).toHaveLength(count);
  expect(second.analysis?.home.statistics.assembledAt).toBe(
    first.analysis?.home.statistics.assembledAt,
  );
  jest.setSystemTime(start + 5000);
  const third = await getGamePreview(123);
  expect(third.reason).toBeNull();
  expect(third.analysis).toEqual(first.analysis);
  expect(queries).toHaveLength(count);
});
it('keeps analysis when kickoff passes while optional sources load', async () => {
  await install((q) => {
    if (q.sql.includes('current_home_score'))
      return [{ ...gameRow, startDate: '2025-09-25 12:00:01' }];
    if (q.sql.includes('team_season_snapshot'))
      jest.setSystemTime(start + 2000);
    return [];
  });
  const result = await getGamePreview(123);
  expect(result.reason).toBeNull();
  expect(result.analysis).not.toBeNull();
});
it.each(['scheduled', 'in_progress'])(
  'returns both analyses for a directly opened ongoing game with %s status',
  async (status) => {
    await install((q) =>
      q.sql.includes('current_home_score')
        ? [{ ...gameRow, status, startDate: '2025-09-25 11:00:00' }]
        : [],
    );
    for (const read of [getGamePreview, getAdjustedGamePreview]) {
      const result = await read(123);
      expect(result.availability).toBe('pregame');
      expect(result.reason).toBeNull();
      expect(result.analysis).not.toBeNull();
    }
  },
);
it.each([getGamePreview, getAdjustedGamePreview])(
  'closes analysis when refreshed game metadata reports completion',
  async (read) => {
    let completed = false;
    await install((q) =>
      q.sql.includes('current_home_score')
        ? [{ ...gameRow, status: completed ? 'completed' : 'in_progress' }]
        : [],
    );
    expect((await read(123)).analysis).not.toBeNull();
    completed = true;
    jest.setSystemTime(start + 10001);
    const result = await read(123);
    expect(result.reason).toBe('game_completed');
    expect(result.analysis).toBeNull();
  },
);
it('rejects unknown games and validates IDs before sources', async () => {
  const { queries } = await install(() => []);
  await expect(getGamePreview(0)).rejects.toThrow();
  expect(queries).toHaveLength(0);
  await expect(getGamePreview(123)).rejects.toThrow(reads.PreviewNotFound);
});
it('refreshes status after ten seconds and never uses the old team identity', async () => {
  let corrected = false;
  const { queries } = await install((q) =>
    q.sql.includes('current_home_score')
      ? [
          {
            ...gameRow,
            awayId: corrected ? 200 : 194,
            awayName: corrected ? 'Other' : 'Ohio State',
          },
        ]
      : [],
  );
  expect((await getGamePreview(123)).game.awayTeam.id).toBe(194);
  corrected = true;
  jest.setSystemTime(start + 10001);
  const next = await getGamePreview(123);
  expect(next.game.awayTeam.id).toBe(200);
  expect(next.analysis?.away.teamId).toBe(200);
  expect(
    queries.filter((q) => q.sql.includes('current_home_score')),
  ).toHaveLength(2);
});
it('returns the newly active slate after a rollover during enrichment', async () => {
  const { queries } = await install((q) => {
    if (q.sql.includes('from "calendar"'))
      return [
        {
          year: 2025,
          seasonType: 'regular',
          week: 4,
          startDate: '2025-09-21 12:00:00',
          endDate: '2025-09-25 11:59:00',
        },
        {
          year: 2025,
          seasonType: 'regular',
          week: 5,
          startDate: '2025-09-25 12:00:00',
          endDate: '2025-09-28 11:59:00',
        },
      ];
    if (q.sql.includes('current_home_score'))
      return [
        {
          ...gameRow,
          week: 99,
          startDate:
            Date.now() < start ? '2025-09-24 12:00:00' : '2025-09-26 12:00:00',
        },
      ];
    if (q.sql.includes('game_media')) jest.setSystemTime(start);
    return [];
  });
  jest.setSystemTime(start - 100);
  const result = await getGameSchedule();
  expect(result.window?.week).toBe(5);
  expect(result.games[0].week).toBe(99);
  expect(result.selection).toBe('active');
  expect(
    queries.filter((q) => q.sql.includes('current_home_score')),
  ).toHaveLength(2);
});
it('filters either participant independently without changing window selection', async () => {
  await install((q) =>
    q.sql.includes('from "calendar"')
      ? [
          {
            year: 2025,
            seasonType: 'regular',
            week: 4,
            startDate: '2025-09-21 07:00:00',
            endDate: '2025-09-28 06:59:00',
          },
        ]
      : q.sql.includes('current_home_score')
        ? [{ ...gameRow, awayClassification: 'fcs', awayAbbreviation: 'X' }]
        : [],
  );
  const fbs = await getGameSchedule(
    undefined,
    undefined,
    undefined,
    'fbs',
    ' x ',
  );
  const fcs = await getGameSchedule(
    undefined,
    undefined,
    undefined,
    'fcs',
    'B1G',
  );
  const empty = await getGameSchedule(
    undefined,
    undefined,
    undefined,
    'fbs',
    'unknown',
  );
  expect(fbs.games).toHaveLength(1);
  expect(fcs.games).toHaveLength(1);
  expect(empty.games).toEqual([]);
  expect(empty.window).toEqual(fbs.window);
  expect(fbs.filters.conference).toBe('x');
});

it('loads independent cold sections while enrichment is waiting and bounds source concurrency', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(start);
  let release!: () => void;
  const stalledMedia = new Promise<void>((resolve) => {
    release = resolve;
  });
  let active = 0;
  let peak = 0;
  const { queries } = await install(async (q) => {
    active++;
    peak = Math.max(peak, active);
    try {
      if (q.sql.includes('current_home_score')) return [gameRow];
      if (q.sql.includes('game_media')) await stalledMedia;
      else await new Promise((resolve) => setTimeout(resolve, 5));
      return [];
    } finally {
      active--;
    }
  });
  const response = getGamePreview(123);
  try {
    await jest.advanceTimersByTimeAsync(100);
    expect(queries.some((q) => q.sql.includes('team_season_snapshot'))).toBe(
      true,
    );
    expect(queries.some((q) => q.sql.includes('rank() over'))).toBe(true);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(2);
  } finally {
    release();
    await jest.advanceTimersByTimeAsync(100);
    await response;
  }
  expect((await response).availability).toBe('pregame');
  expect(queries).toHaveLength(9);
});

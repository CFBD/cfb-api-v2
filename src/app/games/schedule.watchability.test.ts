import { CompiledQuery } from 'kysely';
import { testDatabase, gameRow } from './fixtures/game-previews/testing';
import * as reads from './previewRead';
import { previewCache } from './previewCache';
import { getGameSchedule } from './schedule';

jest.mock('./previewCache', () => ({ previewCache: jest.fn() }));

const scored = {
  watchGameId: 123,
  watchSeason: 2026,
  watchWeek: 5,
  watchHomeId: 130,
  watchAwayId: 194,
  watchNeutralSite: false,
  watchScore: 77.5,
  homeRatingCurrent: true,
  awayRatingCurrent: true,
};
let now = Date.parse('2026-09-30T16:00:00.000Z');
let watch: Record<string, unknown> = scored;
const statements: string[] = [];
const cache = new Map<string, unknown>();

const respond = (query: CompiledQuery): unknown[] => {
  statements.push(query.sql);
  if (query.sql.includes('from "calendar"'))
    return [
      {
        year: 2026,
        seasonType: 'regular',
        week: 5,
        startDate: '2026-09-28 07:00:00',
        endDate: '2026-10-05 06:59:00',
      },
    ];
  if (query.sql.includes('from "game" as "g"'))
    return [
      {
        ...gameRow,
        season: 2026,
        week: 5,
        startDate: '2026-10-03 23:00:00',
        ...watch,
      },
    ];
  return [];
};

beforeEach(async () => {
  now = Date.parse('2026-09-30T16:00:00.000Z');
  watch = scored;
  statements.length = 0;
  cache.clear();
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  const { db } = await testDatabase(respond);
  jest
    .spyOn(reads, 'previewRead')
    .mockImplementation((_deadline, read) => read(db));
  jest.mocked(previewCache).mockImplementation((async (
    identity: string,
    _ttl: number,
    valid: (value: unknown) => boolean,
    load: () => Promise<unknown>,
  ) => {
    if (cache.has(identity) && valid(cache.get(identity)))
      return cache.get(identity);
    const value = await load();
    if (!valid(value)) throw new reads.PreviewDataError();
    cache.set(identity, value);
    return value;
  }) as unknown as typeof previewCache);
});
afterEach(() => jest.restoreAllMocks());

const schedule = () => getGameSchedule(2026, 'regular', 5);

it('serves only the score, read in the existing game statement', async () => {
  const [item] = (await schedule()).games;
  expect(item.watchabilityScore).toBe(77.5);
  expect(Object.keys(item).filter((key) => /watch|rating/i.test(key))).toEqual([
    'watchabilityScore',
  ]);
  expect(
    statements.filter((sql) => sql.includes('"game_watchability"')),
  ).toHaveLength(1);
  expect(
    statements.filter((sql) =>
      /from "(game_watchability|core_ratings)"/.test(sql),
    ),
  ).toEqual([]);
});

it('has a null score without a stored row or with a stale one', async () => {
  watch = { ...scored, watchGameId: null, watchScore: null };
  expect((await schedule()).games[0].watchabilityScore).toBeNull();
  cache.clear();
  watch = { ...scored, homeRatingCurrent: false };
  const result = await schedule();
  expect(result.games).toHaveLength(1);
  expect(result.games[0].watchabilityScore).toBeNull();
});

it('drops a cached score at kickoff without refreshing or hiding the game', async () => {
  expect((await schedule()).games[0].watchabilityScore).toBe(77.5);
  const reads = statements.length;
  now = Date.parse('2026-10-03T22:59:59.999Z');
  expect((await schedule()).games[0].watchabilityScore).toBe(77.5);
  now = Date.parse('2026-10-03T23:00:00.000Z');
  const result = await schedule();
  expect(result.games).toHaveLength(1);
  expect(result.games[0].watchabilityScore).toBeNull();
  expect(statements.length).toBe(reads);
});

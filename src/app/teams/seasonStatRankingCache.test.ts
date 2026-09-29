import {
  getSeasonStatCohort,
  seasonStatCohortQuery,
} from './seasonStatRankingCache';
import { getTeamSeasonOverview } from './seasonOverview';
import { getGamePreview } from '../games/preview';
import { testDatabase, gameRow } from '../games/fixtures/game-previews/testing';
import * as reads from '../games/previewRead';
import fixture from './fixtures/team-season-snapshots/contract.json';
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
      entries,
    })),
  };
});
const now = Date.parse('2025-09-25T12:00:00.000Z'),
  source = new Date(now - 1000);
const cohortRow = (teamId = 130, season = 2025) => ({
  teamId,
  team: teamId === 130 ? 'Michigan' : 'Ohio State',
  snapshotTeamId: teamId,
  season,
  formatVersion: 1,
  generatedAt: source,
  division: 'fbs',
  advanced: {
    ...fixture.advanced,
    season,
    team: teamId === 130 ? 'Michigan' : 'Ohio State',
  },
});
const overviewRow = {
  teamId: 130,
  team: 'Michigan',
  snapshotTeamId: 130,
  season: 2025,
  formatVersion: 1,
  generatedAt: source,
  payload: fixture,
};
beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout'] });
  jest.setSystemTime(now);
  const client = await getRedisClient();
  if (client && 'flush' in client) (client.flush as () => void)();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
async function install(respond: Parameters<typeof testDatabase>[0]) {
  const result = await testDatabase(respond);
  jest
    .spyOn(reads, 'previewRead')
    .mockImplementation((_deadline, read) => read(result.db));
  return result;
}
it('projects only advanced JSON with inclusive season membership and deduplication', async () => {
  const { db } = await testDatabase(() => []);
  const q = seasonStatCohortQuery(db, 2024).compile();
  expect(q.sql).toContain('jsonb_extract_path');
  expect(q.parameters).toContain('advanced');
  expect(q.sql).toContain('"start_year" <=');
  expect(q.sql).toContain('"end_year" >=');
  expect(q.sql).toContain('having count(distinct');
  expect(q.sql).toContain('left join "team_season_snapshot"');
  expect(q.sql).not.toMatch(/from "play"|from "drive"|players|rushing|passing/);
  await db.destroy();
});
it('shares a cohort across overview and concurrent preview requests without nesting refreshes', async () => {
  const { db, queries } = await install((q) => {
    if (q.sql.includes('jsonb_extract_path'))
      return [cohortRow(), cohortRow(194)];
    if (q.sql.includes('current_home_score')) return [gameRow];
    if (q.sql.includes('team_season_snapshot')) {
      if (q.sql.includes('rating_cohort')) return [overviewRow];
      return [130, 194].map((teamId) => ({
        teamId,
        season: 2025,
        formatVersion: 1,
        generatedAt: source,
        payload: {
          ...fixture,
          advanced: {
            ...fixture.advanced,
            team: teamId === 130 ? 'Michigan' : 'Ohio State',
          },
          players: { ppa: [], usage: [] },
          passing: null,
          rushing: null,
        },
      }));
    }
    return [];
  });
  const result = await Promise.all([
    getTeamSeasonOverview(2025, 'Michigan', db),
    getGamePreview(123),
    getSeasonStatCohort(2025),
  ]);
  expect(result[0].status).toBe('found');
  if (result[0].status === 'found')
    expect(result[0].overview.statRankings?.teamId).toBe(130);
  expect(result[1].analysis?.home.statistics.data?.statRankings?.teamId).toBe(
    130,
  );
  expect(
    queries.filter((q) => q.sql.includes('jsonb_extract_path')),
  ).toHaveLength(1);
  const again = await getGamePreview(123);
  expect(again.analysis?.home.statistics.data?.statRankings?.calculatedAt).toBe(
    new Date(now).toISOString(),
  );
  expect(
    queries.filter((q) => q.sql.includes('jsonb_extract_path')),
  ).toHaveLength(1);
  await db.destroy();
});
it('does not cache source failure as a successful empty cohort; bounds expiry and mismatches', async () => {
  let fail = true;
  const { db, queries } = await install((q) => {
    if (q.sql.includes('jsonb_extract_path')) {
      if (fail) throw new Error('fixture');
      return [cohortRow(), cohortRow(194)];
    }
    return [{ ...overviewRow, generatedAt: new Date(now - 2000) }];
  });
  expect(await getSeasonStatCohort(2025)).toBeNull();
  fail = false;
  expect(await getSeasonStatCohort(2025)).not.toBeNull();
  const result = await getTeamSeasonOverview(2025, 'Michigan', db);
  expect(result.status).toBe('found');
  if (result.status === 'found')
    expect(result.overview.statRankings).toBeNull();
  expect(
    queries.filter((q) => q.sql.includes('jsonb_extract_path')),
  ).toHaveLength(2);
  jest.setSystemTime(now + 600001);
  await getSeasonStatCohort(2025);
  expect(
    queries.filter((q) => q.sql.includes('jsonb_extract_path')),
  ).toHaveLength(3);
  await db.destroy();
});
it('returns prior-season ranks from the statistics source and shares one enrichment deadline', async () => {
  const { db, queries } = await install((q) => {
    if (q.sql.includes('jsonb_extract_path'))
      return [cohortRow(130, 2024), cohortRow(194, 2024)];
    if (q.sql.includes('current_home_score')) return [gameRow];
    if (q.sql.includes('team_season_snapshot'))
      return [130, 194].map((teamId) => ({
        teamId,
        season: 2024,
        formatVersion: 1,
        generatedAt: source,
        payload: {
          ...fixture,
          advanced: {
            ...fixture.advanced,
            season: 2024,
            team: teamId === 130 ? 'Michigan' : 'Ohio State',
          },
          players: { ppa: [], usage: [] },
          passing: null,
          rushing: null,
        },
      }));
    return [];
  });
  const result = await getGamePreview(123);
  expect(result.analysis?.home.statistics.data?.statRankings?.season).toBe(
    2024,
  );
  const cohort = queries.find((q) => q.sql.includes('jsonb_extract_path'))!;
  expect(cohort.parameters).toContain(2024);
  expect(cohort.parameters).not.toContain(2025);
  expect(reads.previewRead).toHaveBeenCalledWith(
    now + 3000,
    expect.any(Function),
  );
  await db.destroy();
});

it('shares the budget across two source seasons and preserves stats on ranking failure', async () => {
  const { db, queries } = await install((q) => {
    if (q.sql.includes('jsonb_extract_path'))
      throw new Error('optional cohort unavailable');
    if (q.sql.includes('current_home_score')) return [gameRow];
    if (q.sql.includes('team_season_snapshot'))
      return [130, 194].map((teamId) => {
        const season = teamId === 130 ? 2025 : 2024;
        return {
          teamId,
          season,
          formatVersion: 1,
          generatedAt: source,
          payload: {
            ...fixture,
            advanced: {
              ...fixture.advanced,
              season,
              team: teamId === 130 ? 'Michigan' : 'Ohio State',
            },
            players: { ppa: [], usage: [] },
            passing: null,
            rushing: null,
          },
        };
      });
    return [];
  });
  const result = await getGamePreview(123);
  expect(result.analysis?.home.statistics.status).toBe('available');
  expect(result.analysis?.away.statistics.status).toBe('available');
  expect(result.analysis?.home.statistics.data?.statRankings).toBeNull();
  expect(result.analysis?.away.statistics.data?.statRankings).toBeNull();
  expect(
    queries.filter((q) => q.sql.includes('jsonb_extract_path')),
  ).toHaveLength(2);
  const calls = jest
    .mocked(reads.previewRead)
    .mock.calls.filter(([deadline]) => deadline === now + 3000);
  expect(calls).toHaveLength(2);
  await db.destroy();
});

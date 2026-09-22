import {
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { DB } from '../../config/types/db';
import {
  getTeamSeasonOverview,
  seasonOverviewQuery,
  isTeamSeasonStorageError,
} from './seasonOverview';
import { isTeamSeasonSnapshotPayload } from './seasonOverviewPayload';
import fixture from './fixtures/team-season-snapshots/contract.json';
import observedAdvanced from './fixtures/team-season-snapshots/observed-advanced.json';

jest.mock('../../config/database', () => ({ kdb: {} }));
const database = async (rows: unknown[], error?: Error) => {
  const driver = new DummyDriver();
  const connection = await driver.acquireConnection();
  const queries: CompiledQuery[] = [];
  const original = connection.executeQuery.bind(connection);
  connection.executeQuery = async <R>(query: CompiledQuery) => {
    queries.push(query);
    if (error) throw error;
    return Object.assign(await original<R>(query), { rows });
  };
  driver.acquireConnection = async () => connection;
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return { db, queries };
};
const row = {
  team_id: 130,
  team: 'Michigan',
  snapshot_team_id: 130,
  season: 2025,
  format_version: 1,
  payload: fixture,
};
it('reads once, preserves nested keys, and ignores age and unrecognized root identity', async () => {
  const { db, queries } = await database([
    { ...row, generated_at: new Date(0), payload: { ...fixture, teamId: 999 } },
  ]);
  const result = await getTeamSeasonOverview(2025, '  MICHIGAN  ', db);
  expect(result).toEqual({
    status: 'found',
    overview: {
      ...fixture,
      teamId: 130,
      team: 'Michigan',
      season: 2025,
      record: { games: 0, wins: 0, losses: 0, ties: 0 },
      ratings: { core: null, elo: null, srs: null, sp: null, fpi: null },
    },
  });
  expect(queries).toHaveLength(1);
  expect(queries[0].sql).toContain('left join "team_season_snapshot"');
  expect(queries[0].sql).not.toMatch(
    /insert|update|delete|generated_at|player_usage|drive/,
  );
  expect(queries[0].parameters).toEqual(
    expect.arrayContaining([2025, 'michigan', 2]),
  );
  await db.destroy();
});
it.each([
  [[], 'not-found'],
  [[{ ...row, snapshot_team_id: null }], 'not-found'],
  [[{ ...row, format_version: 2 }], 'unavailable'],
  [[{ ...row, payload: {} }], 'unavailable'],
  [[{ ...row, team: 'Renamed' }], 'unavailable'],
  [[{ ...row, season: 2024 }], 'unavailable'],
])('never falls back on misses or unusable snapshots', async (rows, status) => {
  const { db, queries } = await database(rows);
  expect(await getTeamSeasonOverview(2025, 'Michigan', db)).toEqual({ status });
  expect(queries).toHaveLength(1);
  await db.destroy();
});
it('rejects invalid input before querying and ambiguous names after one query', async () => {
  const { db, queries } = await database([row, row]);
  for (const year of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])
    await expect(getTeamSeasonOverview(year, 'Michigan', db)).rejects.toThrow();
  await expect(getTeamSeasonOverview(2025, ' ', db)).rejects.toThrow();
  expect(queries).toHaveLength(0);
  await expect(getTeamSeasonOverview(2025, 'Michigan', db)).rejects.toThrow();
  expect(queries).toHaveLength(1);
  await db.destroy();
});
it('recognizes only missing/inaccessible snapshot storage', async () => {
  for (const code of ['42P01', '42501']) {
    const error = Object.assign(
      new Error('permission denied for table team_season_snapshot'),
      { code },
    );
    expect(isTeamSeasonStorageError(error)).toBe(true);
    const { db, queries } = await database([], error);
    expect(await getTeamSeasonOverview(2025, 'Michigan', db)).toEqual({
      status: 'unavailable',
    });
    expect(queries).toHaveLength(1);
    await db.destroy();
  }
  const error = Object.assign(new Error('permission denied for table team'), {
    code: '42501',
  });
  const { db } = await database([], error);
  await expect(getTeamSeasonOverview(2025, 'Michigan', db)).rejects.toBe(error);
  await db.destroy();
});
it('keeps the season in the join and binds exact names without wildcards', async () => {
  const { db } = await database([]);
  const query = seasonOverviewQuery(db, 2025, "Michigan' OR true --").compile();
  expect(query.sql).toMatch(/on .*"snapshot"\."season" = \$\d+ left join/);
  expect(query.sql).not.toContain('OR true');
  await db.destroy();
});
it('validates every required leaf, nullable sections, player identities and bucket names', () => {
  expect(isTeamSeasonSnapshotPayload(fixture, 2025, 'Michigan')).toBe(true);
  expect(
    isTeamSeasonSnapshotPayload(
      {
        ...fixture,
        passing: null,
        rushing: null,
        players: { ppa: [], usage: [] },
      },
      2025,
      'Michigan',
    ),
  ).toBe(true);
  const mutate = (value: unknown): unknown[] => {
    if (Array.isArray(value))
      return value.flatMap((v, i) =>
        mutate(v).map((changed) =>
          value.map((item, j) => (i === j ? changed : item)),
        ),
      );
    if (value && typeof value === 'object')
      return Object.entries(value).flatMap(([key, v]) => [
        Object.fromEntries(Object.entries(value).filter(([k]) => k !== key)),
        ...mutate(v).map((changed) => ({ ...value, [key]: changed })),
      ]);
    return [typeof value === 'number' ? Infinity : { invalid: true }];
  };
  for (const invalid of mutate(fixture))
    expect(isTeamSeasonSnapshotPayload(invalid, 2025, 'Michigan')).toBe(false);
});

it('rounds existing stored advanced values without changing counts, nulls or the stored payload', async () => {
  const advanced = structuredClone(observedAdvanced);
  const payload = { ...fixture, advanced };
  const before = structuredClone(payload);
  const { db, queries } = await database([{ ...row, payload }]);
  try {
    const result = await getTeamSeasonOverview(2025, 'Michigan', db);
    if (result.status !== 'found') throw new Error('Expected stored snapshot');
    expect(result.overview.advanced.offense).toMatchObject({
      plays: 855,
      drives: 147,
      ppa: 0.144,
      totalPPA: 123.399,
      lineYards: 3.32,
      secondLevelYards: 1.2,
      openFieldYards: 1.7,
      pointsPerOpportunity: 3.64,
      successRate: 0.455,
      explosiveness: 1.128,
      powerSuccess: 0.797,
      stuffRate: 0.137,
      lineYardsTotal: 1596,
      totalOpportunies: 87,
      standardDowns: {
        rate: 0.709,
        ppa: 0.151,
        successRate: 0.523,
        explosiveness: 0.993,
      },
    });
    expect(result.overview.advanced.defense).toMatchObject({
      ppa: 0.032,
      totalPPA: 27.657,
      lineYards: 2.64,
      pointsPerOpportunity: 3.79,
      passingDowns: { totalPPA: 48.856 },
      rushingPlays: { ppa: -0.006, totalPPA: -2.279 },
      fieldPosition: { averageStart: 72.1, averagePredictedPoints: -1.245 },
    });
    expect(result.overview.players).toEqual(fixture.players);
    expect(result.overview.passing).toEqual(fixture.passing);
    expect(result.overview.rushing).toEqual(fixture.rushing);
    expect(payload).toEqual(before);
    expect(queries).toHaveLength(1);
    const numbers = (value: unknown): void => {
      if (typeof value === 'number')
        expect(String(value)).toMatch(/^-?\d+(?:\.\d{1,3})?$/);
      else if (value && typeof value === 'object')
        Object.values(value).forEach(numbers);
    };
    numbers(result.overview.advanced);
  } finally {
    await db.destroy();
  }
});

it('joins live season ratings and records without requiring them in snapshot JSON', async () => {
  const { db, queries } = await database([
    {
      ...row,
      games: '13',
      wins: '9',
      losses: '3',
      ties: '1',
      core_team_id: 130,
      core_overall: 12.345,
      core_offense: 0,
      core_defense: -2.345,
      core_overall_rank: '12',
      core_offense_rank: '13',
      core_defense_rank: '14',
      srs_rank: '8',
      sp_overall_rank: '9',
      sp_offense_rank: '10',
      sp_defense_rank: '11',
      sp_special_teams_rank: '12',
      fpi_team_id: 130,
      fpi_overall: '85.678',
      fpi_offense: '0',
      fpi_defense: '76.543',
      fpi_special_teams: null,
      fpi_overall_rank: '6',
      fpi_offense_rank: '100',
      fpi_defense_rank: '22',
      fpi_special_teams_rank: null,
      elo_rating: 1625,
      srs_rating: '9.87654',
      sp_team_id: 130,
      sp_overall: '17.456',
      sp_offense: '32.123',
      sp_defense: '14.667',
      sp_special_teams: '0',
    },
  ]);
  try {
    const result = await getTeamSeasonOverview(2025, 'Michigan', db);
    expect(result).toMatchObject({
      status: 'found',
      overview: {
        record: { games: 13, wins: 9, losses: 3, ties: 1 },
        ratings: {
          core: {
            overall: { rating: 12.35, rank: 12 },
            offense: { rating: 0, rank: 13 },
            defense: { rating: -2.35, rank: 14 },
          },
          fpi: {
            overall: { rating: 85.68, rank: 6 },
            offense: { rating: 0, rank: 100 },
            defense: { rating: 76.54, rank: 22 },
            specialTeams: { rating: null, rank: null },
          },
          elo: 1625,
          srs: { rating: 9.88, rank: 8 },
          sp: {
            overall: { rating: 17.46, rank: 9 },
            offense: { rating: 32.12, rank: 10 },
            defense: { rating: 14.67, rank: 11 },
            specialTeams: { rating: 0, rank: 12 },
          },
        },
      },
    });
    expect(queries).toHaveLength(1);
    const sql = queries[0].sql;
    for (const source of ['core', 'srs', 'sp', 'fpi']) {
      expect(sql).toContain(`"${source}"."team_id" = "snapshot"."team_id"`);
      expect(sql).toContain(`"${source}"."year" = "snapshot"."season"`);
    }
    expect(sql).toContain('"g"."season" = "snapshot"."season"');
    expect(sql).toContain('"gt"."team_id" = "snapshot"."team_id"');
    expect(sql).toContain('"eg"."season" = "snapshot"."season"');
    expect(sql).toContain('"egt"."team_id" = "snapshot"."team_id"');
    expect(sql).toContain('"egt"."end_elo" is not null');
    expect(sql).toContain(
      'order by "eg"."start_date" desc, "eg"."id" desc limit',
    );
    expect(sql).toContain('"opponent"."id" <> "gt"."id"');
    expect(queries[0].parameters.filter((p) => p === 'completed')).toHaveLength(
      2,
    );
    expect(sql).not.toMatch(/"play"|"drive"|"player_usage_stats"/);
  } finally {
    await db.destroy();
  }
});

it('preserves absent systems and nullable SP special teams without fabricating zero ratings', async () => {
  const { db } = await database([
    {
      ...row,
      core_team_id: null,
      srs_rating: null,
      elo_rating: null,
      sp_team_id: 130,
      sp_overall: '0',
      sp_offense: '0',
      sp_defense: '0',
      sp_special_teams: null,
    },
  ]);
  try {
    expect(await getTeamSeasonOverview(2025, 'Michigan', db)).toMatchObject({
      status: 'found',
      overview: {
        ratings: {
          core: null,
          srs: null,
          elo: null,
          sp: {
            overall: { rating: 0, rank: null },
            offense: { rating: 0, rank: null },
            defense: { rating: 0, rank: null },
            specialTeams: { rating: null, rank: null },
          },
          fpi: null,
        },
      },
    });
  } finally {
    await db.destroy();
  }
});

it('ranks season/division cohorts before team filtering with correct direction and null handling', async () => {
  const { db } = await database([]);
  try {
    const { sql, parameters } = seasonOverviewQuery(
      db,
      2026,
      'Michigan',
    ).compile();
    const cohortEnd = sql.indexOf('select "t"."id"');
    const cohorts = sql.slice(0, cohortEnd);
    expect(cohorts).toContain('count(distinct "c"."division")');
    expect(cohorts).toContain('group by "ct"."team_id"');
    expect(cohorts).not.toMatch(/"school"|"snapshot"/);
    expect(cohorts.match(/rank\(\) over/g)).toHaveLength(12);
    expect(cohorts.match(/partition by "c"."division"/g)).toHaveLength(12);
    expect(cohorts).toContain('order by "r"."defense" asc nulls last');
    expect(cohorts).not.toContain('order by "r"."defense" desc');
    expect(cohorts).toContain('order by "r"."d_rating" asc nulls last');
    for (const field of [
      'overall_efficiency',
      'offensive_efficiency',
      'defensive_efficiency',
      'special_teams_efficiency',
    ]) {
      expect(cohorts).toContain(`"r"."${field}" is null`);
      expect(cohorts).toContain(`order by "r"."${field}" desc nulls last`);
    }
    expect(cohorts).not.toContain('round(');
    expect(cohorts.match(/"r"\."year" = /g)).toHaveLength(4);
    expect(parameters.filter((value) => value === 2026)).toHaveLength(7);
    expect(parameters.filter((value) => value === 'michigan')).toHaveLength(1);
    expect(sql).not.toMatch(/latest_elo|elo_rank/);
  } finally {
    await db.destroy();
  }
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CamelCasePlugin,
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import { DB } from '../../config/types/db';
import { DivisionClassification, SeasonType } from '../enums';
import {
  getPassingPlays,
  getPlayerPassingByGame,
  getPlayerPassingBySeason,
  getTeamPassingByGame,
  getTeamPassingBySeason,
} from './service';

jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: { selectFrom: jest.fn(), with: jest.fn() },
}));

const selectFrom = kdb.selectFrom as jest.Mock;

const createQueryBuilder = (rows: unknown[] = []) => {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'clearSelect',
    'clearGroupBy',
    'clearOrderBy',
    'distinct',
    'as',
    'selectAll',
    'groupBy',
    'innerJoin',
    'leftJoin',
    'leftJoinLateral',
    'orderBy',
    'select',
    'where',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.$if = jest
    .fn()
    .mockImplementation((condition, callback) =>
      condition ? callback(builder) : builder,
    );
  builder.execute = jest.fn().mockResolvedValue(rows);
  return builder;
};

const createCompileDatabase = (
  compiledQueries: CompiledQuery<unknown>[],
): Kysely<DB> => {
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
    log: (event) => {
      if (event.level === 'query') {
        compiledQueries.push(event.query);
      }
    },
  });
  (kdb.with as jest.Mock).mockImplementation(db.with.bind(db));
  return db;
};

const locationNames = [
  'short left',
  'short middle',
  'short right',
  'deep left',
  'deep middle',
  'deep right',
  'unknown',
] as const;
const bucketPrefixes = [
  'shortLeft',
  'shortMiddle',
  'shortRight',
  'deepLeft',
  'deepMiddle',
  'deepRight',
  'unknown',
];
const prefixFields = (prefix: string, fields: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      `${prefix}${key[0].toUpperCase()}${key.slice(1)}`,
      value,
    ]),
  );
const emptyAdvanced = {
  successRate: 0,
  ppa: 0,
  totalPpa: 0,
  explosiveness: 0,
  ppaAttemptsAvailable: 0,
  successAttemptsAvailable: 0,
  successfulAttempts: 0,
  successfulPpaAttemptsAvailable: 0,
};
const emptyBaseRow = {
  attempts: 0,
  completions: 0,
  incompletions: 0,
  interceptions: 0,
  airYardsAttemptsAvailable: 0,
  totalAirYards: null,
  averageDepthOfTarget: null,
  totalYardsAttemptsAvailable: 0,
  totalYards: null,
  yardsAfterCatchAttemptsAvailable: 0,
  totalYardsAfterCatch: null,
  averageYardsAfterCatch: null,
};
const emptyLocation = {
  ...emptyBaseRow,
  ...emptyAdvanced,
  completionRate: null,
  yardsPerAttempt: null,
  airYardsPerAttempt: null,
};
const emptyAggregateRow = {
  ...emptyBaseRow,
  ...emptyAdvanced,
  locationEligibleAttempts: 0,
  locationAvailableAttempts: 0,
  ...Object.assign(
    {},
    ...bucketPrefixes.map((prefix) =>
      prefixFields(prefix, { ...emptyBaseRow, ...emptyAdvanced }),
    ),
  ),
};

const passingPlayRow = {
  gameId: 401752820,
  playId: '401752820104849901',
  driveId: '4017528201004849',
  season: 2026,
  week: 1,
  seasonType: 'regular',
  offenseId: 127,
  offense: 'Michigan State',
  offenseConference: 'B1G',
  defenseId: 189,
  defense: 'Western Michigan',
  defenseConference: 'MAC',
  period: 1,
  clock: { minutes: 12, seconds: 41 },
  down: 2,
  distance: 8,
  playNumber: 12,
  playText: 'Complete pass to the right for 14 yards',
  passerId: '4685151',
  passer: 'Example Passer',
  targetId: '4899123',
  target: 'Example Receiver',
  outcome: 'completion',
  airYards: -1,
  passDepth: 'short',
  passDirection: 'right',
  passLocation: 'short right',
  totalYards: 4,
  yardsAfterCatch: 5,
  startYardline: 35,
  startYardsToGoal: 65,
  targetYardsToGoal: 66,
  isSpike: false,
  isThrowaway: false,
  isIntentionalGrounding: false,
  completionProbability: null,
  parseStatus: 'complete',
  ppa: '1.23456',
  success: true,
  locationAnalysisEligible: true,
};

const productionRow = {
  ...emptyAggregateRow,
  attempts: '4',
  completions: '2',
  incompletions: '1',
  interceptions: '1',
  airYardsAttemptsAvailable: '3',
  totalAirYards: '20',
  averageDepthOfTarget: '6.6667',
  totalYardsAttemptsAvailable: '3',
  totalYards: '37',
  yardsAfterCatchAttemptsAvailable: '2',
  totalYardsAfterCatch: '9',
  averageYardsAfterCatch: '4.5',
};

beforeEach(() => {
  jest.clearAllMocks();
  const creator = {
    with: () => creator,
    selectFrom: () => createQueryBuilder(),
  };
  (kdb.with as jest.Mock).mockReturnValue(creator);
});

describe('getPassingPlays', () => {
  test('requires a year', async () => {
    await expect(
      getPassingPlays(
        undefined,
        undefined,
        undefined,
        undefined,
        'Michigan State',
      ),
    ).rejects.toMatchObject({
      fields: {
        year: { value: undefined, message: 'year is required' },
      },
      message: 'Validation error',
      status: 400,
    });
    await expect(getPassingPlays()).rejects.toBeInstanceOf(ValidateError);
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('accepts team without week', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getPassingPlays(
      undefined,
      2026,
      undefined,
      undefined,
      'Michigan State',
    );

    expect(builder.where.mock.calls).toContainEqual([expect.any(Function)]);
    expect(builder.where).toHaveBeenCalledWith('game.season', '=', 2026);
  });

  test('requires either a team or week in addition to year', async () => {
    await expect(getPassingPlays(undefined, 2026)).rejects.toMatchObject({
      fields: {
        team: { value: undefined, message: 'team or week is required' },
        week: { value: undefined, message: 'team or week is required' },
      },
      message: 'Validation error',
    });
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('defaults classification to FBS and preserves the exact play contract', async () => {
    const builder = createQueryBuilder([passingPlayRow]);
    selectFrom.mockReturnValue(builder);

    await expect(getPassingPlays(undefined, 2026, 1)).resolves.toEqual([
      {
        gameId: 401752820,
        playId: '401752820104849901',
        driveId: '4017528201004849',
        season: 2026,
        week: 1,
        seasonType: 'regular',
        offenseId: 127,
        offense: 'Michigan State',
        offenseConference: 'B1G',
        defenseId: 189,
        defense: 'Western Michigan',
        defenseConference: 'MAC',
        period: 1,
        clock: { minutes: 12, seconds: 41 },
        down: 2,
        distance: 8,
        playText: 'Complete pass to the right for 14 yards',
        passerId: '4685151',
        passer: 'Example Passer',
        targetId: '4899123',
        target: 'Example Receiver',
        outcome: 'completion',
        airYards: -1,
        passDepth: 'short',
        passDirection: 'right',
        passLocation: 'short right',
        totalYards: 4,
        yardsAfterCatch: 5,
        startYardline: 35,
        startYardsToGoal: 65,
        targetYardsToGoal: 66,
        isSpike: false,
        isThrowaway: false,
        isIntentionalGrounding: false,
        completionProbability: null,
        cpoe: null,
        parseStatus: 'complete',
        ppa: 1.23456,
        success: true,
        locationAnalysisEligible: true,
      },
    ]);

    expect(selectFrom).toHaveBeenCalledWith('game');
    expect(builder.innerJoin).toHaveBeenCalledWith(
      'passPlay as pp',
      'pp.playId',
      'play.id',
    );
    expect(builder.leftJoinLateral).toHaveBeenCalled();
    expect(builder.where).toHaveBeenCalledWith(
      'offenseConference.division',
      '=',
      DivisionClassification.FBS,
    );
    expect(JSON.stringify(builder.select.mock.calls)).not.toContain(
      'parserVersion',
    );
  });

  test('compiles the optimized query through the camel-case plugin', async () => {
    const compiledQueries: CompiledQuery<unknown>[] = [];
    const compileDb = createCompileDatabase(compiledQueries);
    selectFrom.mockImplementation(compileDb.selectFrom.bind(compileDb));

    await getPassingPlays(undefined, 2026, 1);

    const [{ sql: compiledSql, parameters }] = compiledQueries;
    expect(compiledSql).toContain('from "game"');
    expect(compiledSql).toContain('inner join "pass_play" as "pp"');
    expect(compiledSql).toContain('left join lateral');
    expect(compiledSql).toContain('"game_team" as "home_team"');
    expect(compiledSql).toContain('"home_team"."team_id"');
    expect(compiledSql).not.toContain('pass_play_data');
    expect(compiledSql).not.toContain('homeTeam');
    expect(compiledSql).toContain('cast($1 as text)');
    expect(parameters[0]).toBe(' ');

    await compileDb.destroy();
  });

  test('keeps nullable partial data and zeroes a missing clock interval', async () => {
    const builder = createQueryBuilder([
      {
        ...passingPlayRow,
        clock: null,
        passerId: null,
        passer: null,
        targetId: null,
        target: null,
        airYards: null,
        passDepth: null,
        passDirection: null,
        passLocation: null,
        yardsAfterCatch: null,
        parseStatus: 'partial',
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const [result] = await getPassingPlays(undefined, 2026, 1);

    expect(result).toMatchObject({
      clock: { minutes: 0, seconds: 0 },
      passerId: null,
      passer: null,
      targetId: null,
      target: null,
      airYards: null,
      passLocation: null,
      yardsAfterCatch: null,
      parseStatus: 'partial',
    });
  });

  test('applies both athlete filters and explicit FCS', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getPassingPlays(
      undefined,
      2026,
      1,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '4685151',
      '4899123',
      undefined,
      // false, // Restore the CPOE eligibility filter when CPOE goes live.
      DivisionClassification.FCS,
    );

    expect(builder.where).toHaveBeenCalledWith(
      'offenseConference.division',
      '=',
      DivisionClassification.FCS,
    );
    expect(builder.where).toHaveBeenCalledWith(
      'roles.passerId',
      '=',
      '4685151',
    );
    expect(builder.where).toHaveBeenCalledWith(
      'roles.targetId',
      '=',
      '4899123',
    );
    // CPOE eligibility filter assertion:
    // expect(builder.where.mock.calls).toContainEqual([expect.any(Function)]);
  });

  test('SeasonType.Both adds no season type predicate', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getPassingPlays(undefined, 2026, 1, SeasonType.Both);

    expect(builder.where).not.toHaveBeenCalledWith(
      'game.seasonType',
      '=',
      SeasonType.Both,
    );
  });
});

describe('passing availability field names', () => {
  test.each([
    {
      endpoint: 'players/season',
      run: () => getPlayerPassingBySeason(2026),
      team: false,
    },
    {
      endpoint: 'players/games',
      run: () => getPlayerPassingByGame(2026, 1),
      team: false,
    },
    {
      endpoint: 'teams/season',
      run: () => getTeamPassingBySeason(2026),
      team: true,
    },
    {
      endpoint: 'teams/games',
      run: () => getTeamPassingByGame(2026, 1),
      team: true,
    },
  ])(
    '$endpoint exposes attempt counts with the new names',
    async ({ run, team }) => {
      const builder = createQueryBuilder([
        {
          ...productionRow,
          ...Object.fromEntries(
            ['offense', 'defense'].flatMap((side) =>
              Object.entries(productionRow).map(([key, value]) => [
                `${side}${key[0].toUpperCase()}${key.slice(1)}`,
                value,
              ]),
            ),
          ),
        },
      ]);
      selectFrom.mockReturnValue(builder);

      const [result] = await run();
      const availability = {
        airYardsAttemptsAvailable: 3,
        totalYardsAttemptsAvailable: 3,
        yardsAfterCatchAttemptsAvailable: 2,
      };

      expect(result).toMatchObject(
        team ? { offense: availability, defense: availability } : availability,
      );
      expect(JSON.stringify(result)).not.toMatch(
        /"(?:airYards|totalYards|yardsAfterCatch)Available":/,
      );
    },
  );
});

describe('player passing aggregates', () => {
  test('requires a year or passer for the player season endpoint', async () => {
    await expect(getPlayerPassingBySeason()).rejects.toBeInstanceOf(
      ValidateError,
    );
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test.each([
    {},
    { week: 1 },
    { team: 'Michigan' },
    { passerId: '4685151' },
    { week: 1, team: 'Michigan', passerId: '4685151' },
  ])(
    'requires a year for player games with filters %j',
    async ({ week, team, passerId }) => {
      await expect(
        getPlayerPassingByGame(
          undefined,
          week,
          undefined,
          team,
          undefined,
          passerId,
        ),
      ).rejects.toMatchObject({
        fields: { year: { value: undefined, message: 'year is required' } },
        status: 400,
      });
      expect(selectFrom).not.toHaveBeenCalled();
    },
  );

  test.each([undefined, 'B1G'])(
    'rejects player games without passerId, team, or week (conference=%s)',
    async (conference) => {
      await expect(
        getPlayerPassingByGame(
          2026,
          undefined,
          undefined,
          undefined,
          conference,
        ),
      ).rejects.toMatchObject({
        fields: {
          passerId: { message: 'passerId, team, or week is required' },
          team: { message: 'passerId, team, or week is required' },
          week: { message: 'passerId, team, or week is required' },
        },
        status: 400,
      });
      expect(selectFrom).not.toHaveBeenCalled();
    },
  );

  test.each([
    { week: 0 },
    { team: 'Michigan' },
    { passerId: '4685151' },
    { week: 1, team: 'Michigan', passerId: '4685151' },
  ])(
    'accepts player games with year and filters %j',
    async ({ week, team, passerId }) => {
      const builder = createQueryBuilder();
      selectFrom.mockReturnValue(builder);

      await expect(
        getPlayerPassingByGame(
          2026,
          week,
          undefined,
          team,
          undefined,
          passerId,
        ),
      ).resolves.toEqual([]);

      expect(builder.where).toHaveBeenCalledWith('game.season', '=', 2026);
      if (week !== undefined) {
        expect(builder.where).toHaveBeenCalledWith('game.week', '=', week);
      }
      if (passerId !== undefined) {
        expect(builder.where).toHaveBeenCalledWith(
          'roles.passerId',
          '=',
          passerId,
        );
      }
    },
  );

  test('maps PostgreSQL aggregate strings and rounds season metrics', async () => {
    const builder = createQueryBuilder([
      {
        season: 2026,
        playerId: '4685151',
        player: 'Example Passer',
        team: 'Michigan State',
        conference: 'B1G',
        ...productionRow,
      },
    ]);
    selectFrom.mockReturnValue(builder);

    await expect(getPlayerPassingBySeason(2026)).resolves.toMatchObject([
      {
        season: 2026,
        playerId: '4685151',
        player: 'Example Passer',
        team: 'Michigan State',
        conference: 'B1G',
        attempts: 4,
        completions: 2,
        incompletions: 1,
        interceptions: 1,
        completionRate: 0.5,
        airYardsAttemptsAvailable: 3,
        totalAirYards: 20,
        averageDepthOfTarget: 6.7,
        totalYardsAttemptsAvailable: 3,
        totalYards: 37,
        yardsAfterCatchAttemptsAvailable: 2,
        totalYardsAfterCatch: 9,
        averageYardsAfterCatch: 4.5,
      },
    ]);

    expect(builder.innerJoin).toHaveBeenCalledWith(
      'athlete as passer',
      'roles.passerId',
      'passer.id',
    );
    expect(builder.groupBy).toHaveBeenCalledWith(
      expect.arrayContaining(['game.season', 'offenseTeam.school']),
    );
  });

  test('maps game context and the defensive team as opponent', async () => {
    const builder = createQueryBuilder([
      {
        gameId: 401752820,
        season: 2026,
        week: 1,
        seasonType: 'regular',
        playerId: '4685151',
        player: 'Example Passer',
        team: 'Michigan State',
        conference: null,
        opponent: 'Western Michigan',
        ...productionRow,
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const [result] = await getPlayerPassingByGame(2026, 1);

    expect(result).toMatchObject({
      gameId: 401752820,
      season: 2026,
      week: 1,
      seasonType: 'regular',
      team: 'Michigan State',
      conference: null,
      opponent: 'Western Michigan',
    });
    expect(builder.orderBy.mock.calls).toEqual([
      ['game.season', 'desc'],
      ['game.week'],
      ['game.id'],
      ['offenseTeam.school'],
      ['passer.name'],
    ]);
  });

  test('compiles all four aggregates from base tables with typed expressions', async () => {
    const compiledQueries: CompiledQuery<unknown>[] = [];
    const compileDb = createCompileDatabase(compiledQueries);
    selectFrom.mockImplementation(compileDb.selectFrom.bind(compileDb));

    await getPlayerPassingBySeason(2026);
    await getPlayerPassingByGame(2026, 1);
    await getTeamPassingBySeason(2026);
    await getTeamPassingByGame(2026, 1);

    expect(compiledQueries).toHaveLength(4);
    for (const { sql } of compiledQueries) {
      expect(sql).toContain('from "game"');
      expect(sql).toContain('inner join "pass_play" as "pp"');
      expect(sql).toContain('then "play"."yards_gained"');
      expect(sql).toContain('then 0 end');
      expect(sql).toContain(
        'then "play"."yards_gained" - "pp"."air_yards" end',
      );
      expect(sql).not.toContain('pass_play_data');
      expect(sql).not.toContain('target_id');
      expect(sql).not.toContain('home_team');
      expect(sql).not.toContain('representedTeam');
    }
    for (const { sql } of compiledQueries.slice(0, 2)) {
      expect(sql).toContain('left join lateral');
      expect(sql).toContain('count(distinct "ps"."athlete_id")');
      expect(sql).toContain('"roles"."passer_id" = "passer"."id"');
      expect(sql).toContain('count(*) filter(where "pp"."outcome" =');
    }
    for (const { sql } of compiledQueries.slice(2)) {
      expect(sql).not.toContain('play_stat');
      expect(sql).not.toContain('lateral');
      expect(sql).toContain(
        'filter(where ("play"."offense_id" = "represented_team"."id"',
      );
      expect(sql).toContain(
        'filter(where ("play"."defense_id" = "represented_team"."id"',
      );
      expect(sql).toContain('and "pp"."outcome" =');
    }

    await compileDb.destroy();
  });

  test('preserves player scope filters with the resolved passer ID', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getPlayerPassingByGame(
      2025,
      3,
      SeasonType.Regular,
      'Michigan',
      'B1G',
      '4685151',
      DivisionClassification.FCS,
    );

    expect(builder.where).toHaveBeenCalledWith('game.season', '=', 2025);
    expect(builder.where).toHaveBeenCalledWith('game.week', '=', 3);
    expect(builder.where).toHaveBeenCalledWith(
      'game.seasonType',
      '=',
      SeasonType.Regular,
    );
    expect(builder.where).toHaveBeenCalledWith(
      'roles.passerId',
      '=',
      '4685151',
    );
    expect(builder.where).toHaveBeenCalledWith(
      'offenseConference.division',
      '=',
      DivisionClassification.FCS,
    );
  });

  test('uses each game season for conference membership without a year filter', async () => {
    const compiledQueries: CompiledQuery<unknown>[] = [];
    const compileDb = createCompileDatabase(compiledQueries);
    selectFrom.mockImplementation(compileDb.selectFrom.bind(compileDb));

    await getPlayerPassingBySeason(
      undefined,
      undefined,
      undefined,
      undefined,
      '4685151',
    );
    await getTeamPassingBySeason(undefined, undefined, 'Michigan');

    expect(compiledQueries[0].sql).toContain(
      '"offense_ct"."start_year" <= "game"."season"',
    );
    expect(compiledQueries[0].sql).toContain(
      '"offense_ct"."end_year" >= "game"."season"',
    );
    expect(compiledQueries[1].sql).toContain(
      '"represented_ct"."start_year" <= "game"."season"',
    );
    expect(compiledQueries[1].sql).toContain(
      '"represented_ct"."end_year" >= "game"."season"',
    );

    await compileDb.destroy();
  });
});

describe('team passing aggregates', () => {
  test.each([
    {},
    { week: 1 },
    { team: 'Michigan' },
    { week: 1, team: 'Michigan' },
  ])(
    'requires a year for team games with filters %j',
    async ({ week, team }) => {
      await expect(
        getTeamPassingByGame(undefined, week, undefined, team),
      ).rejects.toMatchObject({
        fields: {
          year: { message: 'year is required' },
        },
        message: 'Validation error',
        status: 400,
      });
      expect(selectFrom).not.toHaveBeenCalled();
    },
  );

  test.each([undefined, 'B1G'])(
    'rejects team games without team or week (conference=%s)',
    async (conference) => {
      await expect(
        getTeamPassingByGame(2026, undefined, undefined, undefined, conference),
      ).rejects.toMatchObject({
        fields: {
          team: { message: 'team or week is required' },
          week: { message: 'team or week is required' },
        },
        status: 400,
      });
      expect(selectFrom).not.toHaveBeenCalled();
    },
  );

  test('accepts a game year and week without a team', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await expect(getTeamPassingByGame(2026, 0)).resolves.toEqual([]);

    expect(builder.where).toHaveBeenCalledWith('game.season', '=', 2026);
    expect(builder.where).toHaveBeenCalledWith('game.week', '=', 0);
  });

  test('compiles team games with year and team but no week', async () => {
    const compiledQueries: CompiledQuery<unknown>[] = [];
    const compileDb = createCompileDatabase(compiledQueries);
    selectFrom.mockImplementation(compileDb.selectFrom.bind(compileDb));

    await getTeamPassingByGame(2026, undefined, undefined, 'Michigan');

    const [{ sql: compiledSql, parameters }] = compiledQueries;
    expect(compiledSql).toMatch(/"represented_ct"\."start_year" <= \$\d+/);
    expect(compiledSql).toMatch(/"represented_ct"\."end_year" >= \$\d+/);
    expect(compiledSql).toContain('"game"."season" =');
    expect(compiledSql).not.toContain('"game"."week" =');
    expect(compiledSql).toContain('lower("represented_team"."school") =');
    expect(compiledSql).toContain('lower("represented_team"."abbreviation") =');
    expect(parameters).toContain('michigan');
    expect(parameters).not.toContain(undefined);

    await compileDb.destroy();
  });

  test('compiles year-scoped games with constant conference boundaries', async () => {
    const compiledQueries: CompiledQuery<unknown>[] = [];
    const compileDb = createCompileDatabase(compiledQueries);
    selectFrom.mockImplementation(compileDb.selectFrom.bind(compileDb));

    await getTeamPassingByGame(2026, 1, undefined, 'Michigan');

    const [{ sql: compiledSql, parameters }] = compiledQueries;
    expect(compiledSql).toMatch(/"represented_ct"\."start_year" <= \$\d+/);
    expect(compiledSql).toMatch(/"represented_ct"\."end_year" >= \$\d+/);
    expect(compiledSql).toMatch(/"game"\."season" = \$\d+/);
    expect(compiledSql).toMatch(/"game"\."week" = \$\d+/);
    // Original aggregate and its distinct-game scope use the same boundaries.
    expect(parameters.filter((value) => value === 2026)).toHaveLength(6);
    expect(parameters).not.toContain(undefined);

    await compileDb.destroy();
  });

  test('requires a year or team for the season endpoint', async () => {
    await expect(getTeamPassingBySeason()).rejects.toMatchObject({
      fields: {
        year: expect.any(Object),
        team: expect.any(Object),
      },
      message: 'Validation error',
    });
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('maps offense and defense separately, including an empty side', async () => {
    const builder = createQueryBuilder([
      {
        season: 2026,
        team: 'Michigan State',
        conference: 'B1G',
        ...prefixFields('offense', emptyAggregateRow),
        ...prefixFields('defense', emptyAggregateRow),
        offenseAttempts: '4',
        offenseCompletions: '2',
        offenseIncompletions: '1',
        offenseInterceptions: '1',
        offenseCpoeEligibleAttempts: '3',
        offenseAirYardsAttemptsAvailable: '3',
        offenseTotalAirYards: '-2',
        offenseAverageDepthOfTarget: '-0.6667',
        offenseTotalYardsAttemptsAvailable: '3',
        offenseTotalYards: '37',
        offenseYardsAfterCatchAttemptsAvailable: '2',
        offenseTotalYardsAfterCatch: '0',
        offenseAverageYardsAfterCatch: '0',
        defenseAttempts: '0',
        defenseCompletions: '0',
        defenseIncompletions: '0',
        defenseInterceptions: '0',
        defenseCpoeEligibleAttempts: '0',
        defenseAirYardsAttemptsAvailable: '0',
        defenseTotalAirYards: null,
        defenseAverageDepthOfTarget: null,
        defenseTotalYardsAttemptsAvailable: '0',
        defenseTotalYards: null,
        defenseYardsAfterCatchAttemptsAvailable: '0',
        defenseTotalYardsAfterCatch: null,
        defenseAverageYardsAfterCatch: null,
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const [result] = await getTeamPassingBySeason(2026);

    expect(result.offense).toMatchObject({
      attempts: 4,
      completions: 2,
      incompletions: 1,
      interceptions: 1,
      completionRate: 0.5,
      airYardsAttemptsAvailable: 3,
      totalAirYards: -2,
      averageDepthOfTarget: -0.7,
      totalYardsAttemptsAvailable: 3,
      totalYards: 37,
      yardsAfterCatchAttemptsAvailable: 2,
      totalYardsAfterCatch: 0,
      averageYardsAfterCatch: 0,
    });
    expect(result.defense).toMatchObject({
      attempts: 0,
      completions: 0,
      incompletions: 0,
      interceptions: 0,
      completionRate: null,
      airYardsAttemptsAvailable: 0,
      totalAirYards: null,
      averageDepthOfTarget: null,
      totalYardsAttemptsAvailable: 0,
      totalYards: null,
      yardsAfterCatchAttemptsAvailable: 0,
      totalYardsAfterCatch: null,
      averageYardsAfterCatch: null,
    });
  });

  test('maps game grain and joins the other participant as opponent', async () => {
    const builder = createQueryBuilder([
      {
        gameId: 401752820,
        season: 2026,
        week: 1,
        seasonType: 'regular',
        team: 'Michigan State',
        conference: 'B1G',
        opponent: 'Western Michigan',
        ...Object.fromEntries(
          ['offense', 'defense'].flatMap((side) =>
            Object.entries(productionRow).map(([key, value]) => [
              `${side}${key[0].toUpperCase()}${key.slice(1)}`,
              value,
            ]),
          ),
        ),
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const [result] = await getTeamPassingByGame(2026, 1);

    expect(result).toMatchObject({
      gameId: 401752820,
      season: 2026,
      week: 1,
      seasonType: 'regular',
      team: 'Michigan State',
      conference: 'B1G',
      opponent: 'Western Michigan',
      offense: { attempts: 4 },
      defense: { attempts: 4 },
    });
    expect(builder.where).toHaveBeenCalledWith('game.season', '=', 2026);
    expect(builder.innerJoin).toHaveBeenCalledWith(
      'team as opponentTeam',
      'opponentGt.teamId',
      'opponentTeam.id',
    );
  });
});

describe('passing advanced metrics and location mapping', () => {
  test.each([
    { run: () => getPlayerPassingBySeason(2026), team: false },
    { run: () => getPlayerPassingByGame(2026, 1), team: false },
    { run: () => getTeamPassingBySeason(2026), team: true },
    { run: () => getTeamPassingByGame(2026, 1), team: true },
  ])('maps all metrics and every bucket for $run', async ({ run, team }) => {
    const advancedRow = {
      successRate: '0.333333',
      ppa: '-0.123456',
      totalPpa: '-0.246912',
      explosiveness: '1.234567',
      ppaAttemptsAvailable: '2',
      successAttemptsAvailable: '2',
      successfulAttempts: '1',
      successfulPpaAttemptsAvailable: '1',
    };
    const row = {
      ...productionRow,
      ...advancedRow,
      locationEligibleAttempts: '3',
      locationAvailableAttempts: '3',
      ...prefixFields('shortLeft', {
        ...emptyBaseRow,
        ...advancedRow,
        attempts: '3',
        completions: '1',
        incompletions: '1',
        interceptions: '1',
        totalYardsAttemptsAvailable: '3',
        totalYards: '10',
        airYardsAttemptsAvailable: '2',
        totalAirYards: '-1',
        averageDepthOfTarget: '-0.5',
      }),
    };
    selectFrom.mockReturnValue(
      createQueryBuilder([
        team
          ? {
              ...prefixFields('offense', row),
              ...prefixFields('defense', emptyAggregateRow),
            }
          : row,
      ]),
    );
    const [result] = await run();
    const production = 'offense' in result ? result.offense : result;
    expect(production).toMatchObject({
      attempts: 4,
      locationEligibleAttempts: 3,
      locationAvailableAttempts: 3,
      successRate: 0.333,
      ppa: -0.123,
      totalPpa: -0.247,
      explosiveness: 1.235,
      ppaAttemptsAvailable: 2,
      successAttemptsAvailable: 2,
      successfulAttempts: 1,
      successfulPpaAttemptsAvailable: 1,
    });
    expect(Object.keys(production.locations)).toEqual(locationNames);
    expect(production.locations['short left']).toEqual({
      ...emptyLocation,
      attempts: 3,
      completions: 1,
      incompletions: 1,
      interceptions: 1,
      completionRate: 0.333,
      totalYardsAttemptsAvailable: 3,
      totalYards: 10,
      yardsPerAttempt: 3.3,
      airYardsAttemptsAvailable: 2,
      totalAirYards: -1,
      averageDepthOfTarget: -0.5,
      airYardsPerAttempt: -0.5,
      successRate: 0.333,
      ppa: -0.123,
      totalPpa: -0.247,
      explosiveness: 1.235,
      ppaAttemptsAvailable: 2,
      successAttemptsAvailable: 2,
      successfulAttempts: 1,
      successfulPpaAttemptsAvailable: 1,
    });
    for (const location of locationNames.slice(1)) {
      expect(production.locations[location]).toEqual(emptyLocation);
    }
    if ('defense' in result) {
      expect(result.defense).toEqual({
        ...emptyBaseRow,
        ...emptyAdvanced,
        cpoeAttemptsAvailable: 0,
        cpoeCompletions: 0,
        expectedCompletions: null,
        expectedCompletionRate: null,
        cpoe: null,
        completionRate: null,
        locationEligibleAttempts: 0,
        locationAvailableAttempts: 0,
        locations: Object.fromEntries(
          locationNames.map((name) => [name, emptyLocation]),
        ),
      });
    }
  });

  test.each([null, false, true])(
    'preserves stored success=%s and raw PPA on ineligible plays',
    async (success) => {
      selectFrom.mockReturnValue(
        createQueryBuilder([
          {
            ...passingPlayRow,
            success,
            ppa: success === null ? null : '-0.25',
            isSpike: true,
            locationAnalysisEligible: false,
          },
        ]),
      );
      const [result] = await getPassingPlays(undefined, 2026, 1);
      expect(result).toMatchObject({
        success,
        ppa: success === null ? null : -0.25,
        isSpike: true,
        locationAnalysisEligible: false,
      });
    },
  );

  test('compiles every bucket with eligibility, nullable coverage, and unique PostgreSQL-safe aliases', async () => {
    const compiledQueries: CompiledQuery<unknown>[] = [];
    const compileDb = createCompileDatabase(compiledQueries);
    selectFrom.mockImplementation(compileDb.selectFrom.bind(compileDb));
    await getTeamPassingBySeason(2026);
    expect(compiledQueries).toHaveLength(1);
    const [{ sql, parameters }] = compiledQueries;
    expect(sql).toContain('not case when');
    expect(sql).toContain('"pp"."pass_depth" in');
    expect(sql).toContain('"pp"."pass_direction" in');
    // Throwaways remain eligible for advanced and location metrics.
    expect(sql).not.toContain('"pp"."is_throwaway"');
    expect(sql).toContain('"pp"."is_spike" =');
    expect(sql).toContain('"pp"."is_intentional_grounding" =');
    expect(sql).toContain('"pp"."parse_status" <>');
    expect(sql).toContain('count("play"."success") filter');
    expect(sql).toContain('count("play"."ppa") filter');
    const aliases = [...sql.matchAll(/ as "((?:offense|defense)_\w+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(aliases).size).toBe(aliases.length);
    expect(aliases.every((alias) => Buffer.byteLength(alias) <= 63)).toBe(true);
    for (const side of ['offense', 'defense']) {
      for (const location of locationNames) {
        expect(aliases).toContain(
          `${side}_${location.replace(' ', '_')}_total_ppa`,
        );
        expect(aliases).toContain(
          `${side}_${location.replace(' ', '_')}_total_air_yards`,
        );
      }
    }
    expect(parameters).not.toContain(undefined);
    await compileDb.destroy();
  });
});

describe('standalone CPOE contract', () => {
  test.each([
    { outcome: 'completion', p: 0.123456, probability: 0.123, cpoe: 87.65 },
    { outcome: 'incompletion', p: 0.123456, probability: 0.123, cpoe: -12.35 },
    { outcome: 'interception', p: 1, probability: 1, cpoe: -100 },
    { outcome: 'completion', p: 0, probability: 0, cpoe: 100 },
    { outcome: 'completion', p: 1, probability: 1, cpoe: 0 },
    { outcome: 'incompletion', p: 0.000001, probability: 0, cpoe: 0 },
    { outcome: 'completion', p: null, probability: null, cpoe: null },
  ])(
    'maps $outcome with p=$p using stored precision',
    async ({ outcome, p, probability, cpoe }) => {
      selectFrom.mockReturnValue(
        createQueryBuilder([
          {
            ...passingPlayRow,
            outcome,
            // Completion-plus-fumble still uses the canonical completion outcome.
            playText: 'Complete pass; receiver fumbles',
            targetId: null,
            passerId: null,
            completionProbability: p,
          },
        ]),
      );
      const [result] = await getPassingPlays(undefined, 2026, 1);
      expect(result).toMatchObject({
        outcome,
        completionProbability: probability,
        cpoe,
        targetId: null,
        passerId: null,
      });
      expect(Object.is(result.cpoe, -0)).toBe(false);
      expect(result).not.toHaveProperty('cpoeEligible');
      expect(result).not.toHaveProperty('cpoeModelVersion');
    },
  );

  test('plays query selects only the completion probability from predictions', async () => {
    const queries: CompiledQuery<unknown>[] = [];
    const db = createCompileDatabase(queries);
    selectFrom.mockImplementation(db.selectFrom.bind(db));
    await getPassingPlays(undefined, 2026, 1);
    expect(queries).toHaveLength(1);
    const { sql } = queries[0];
    expect(sql).toContain('"cp"."completion_probability"');
    expect(sql).not.toContain('as "cpoe_eligible"');
    expect(sql).not.toContain('as "cpoe_model_version"');
    await db.destroy();
  });

  const handlers = [
    {
      name: 'player season',
      team: false,
      run: () => getPlayerPassingBySeason(2026),
    },
    {
      name: 'player game',
      team: false,
      run: () => getPlayerPassingByGame(2026, 1),
    },
    {
      name: 'team season',
      team: true,
      run: () => getTeamPassingBySeason(2026),
    },
    { name: 'team game', team: true, run: () => getTeamPassingByGame(2026, 1) },
  ];
  test.each(handlers)(
    '$name uses the scored subset and preserves location fields',
    async ({ team, run }) => {
      const scored = {
        ...productionRow,
        attempts: '5',
        completions: '3',
        cpoeAttemptsAvailable: '3',
        cpoeCompletions: '2',
        expectedCompletions: '1.8',
        cpoeVersions: '1',
        cpoeModelVersion: 'test-v2',
      };
      selectFrom.mockReturnValue(
        createQueryBuilder([
          team
            ? {
                ...prefixFields('offense', scored),
                ...prefixFields('defense', scored),
              }
            : scored,
        ]),
      );
      const [result] = await run();
      const productions =
        'offense' in result ? [result.offense, result.defense] : [result];
      for (const production of productions) {
        expect(production).toMatchObject({
          attempts: 5,
          completions: 3,
          completionRate: 0.6,
          cpoeAttemptsAvailable: 3,
          cpoeCompletions: 2,
          expectedCompletions: 1.8,
          expectedCompletionRate: 0.6,
          cpoe: 6.67,
        });
        for (const bucket of Object.values(production.locations)) {
          expect(bucket).not.toHaveProperty('cpoe');
        }
        expect(production).not.toHaveProperty('cpoeEligibleAttempts');
        expect(production).not.toHaveProperty('cpoeModelVersion');
      }
    },
  );

  test.each(handlers)(
    '$name returns explicit unavailability without scored attempts',
    async ({ team, run }) => {
      const unscored = {
        ...productionRow,
        cpoeAttemptsAvailable: 0,
        cpoeCompletions: 0,
        expectedCompletions: null,
        cpoeModelVersion: null,
        cpoeVersions: 0,
      };
      selectFrom.mockReturnValue(
        createQueryBuilder([
          team
            ? {
                ...prefixFields('offense', unscored),
                ...prefixFields('defense', unscored),
              }
            : unscored,
        ]),
      );
      const [result] = await run();
      for (const production of 'offense' in result
        ? [result.offense, result.defense]
        : [result]) {
        expect(production).toMatchObject({
          cpoeAttemptsAvailable: 0,
          cpoeCompletions: 0,
          expectedCompletions: null,
          expectedCompletionRate: null,
          cpoe: null,
        });
      }
    },
  );

  test('all five public queries use one bounded optional current-prediction join', async () => {
    const queries: CompiledQuery<unknown>[] = [];
    const db = createCompileDatabase(queries);
    selectFrom.mockImplementation(db.selectFrom.bind(db));
    await getPassingPlays(undefined, 2026, 1);
    for (const handler of handlers) await handler.run();
    expect(queries).toHaveLength(5);
    for (const { sql, parameters } of queries) {
      expect(sql.match(/join "pass_play_cpoe_current"/g)).toHaveLength(1);
      expect(sql).toContain('"cpoe_predictions" as materialized');
      expect(sql).toContain('select distinct "game"."id" as "game_id"');
      expect(sql).toContain('"prediction"."game_id" = "cpoe_games"."game_id"');
      expect(sql).toContain('"cp"."game_id" = "game"."id"');
      expect(sql).toContain('"cp"."play_id" = "pp"."play_id"');
      expect(sql).toMatch(/"game"\."season" = \$\d+/);
      expect(parameters).toContain(2026);
      expect(sql).not.toContain('join "pass_play_cpoe"');
    }
    for (const { sql } of queries.slice(1)) {
      expect(sql).toContain('count("cp"."play_id")');
      expect(sql).toContain('sum("cp"."completion_probability")');
      expect(sql).toContain('count(distinct "cp"."model_version")');
    }
    await db.destroy();
  });

  test('weights season CPOE by attempts and uses full precision before rounding', async () => {
    // A 1-attempt game (1 completion, E=.8) and a 3-attempt game
    // (1 completion, E=1.4) combine to -5, not their unweighted mean.
    selectFrom.mockReturnValue(
      createQueryBuilder([
        {
          ...productionRow,
          cpoeAttemptsAvailable: '4',
          cpoeCompletions: '2',
          expectedCompletions: '2.2',
          cpoeVersions: 1,
          cpoeModelVersion: 'test-v2',
        },
      ]),
    );
    expect((await getPlayerPassingBySeason(2026))[0]).toMatchObject({
      cpoe: -5,
      expectedCompletionRate: 0.55,
      expectedCompletions: 2.2,
    });
    selectFrom.mockReturnValue(
      createQueryBuilder([
        {
          ...productionRow,
          cpoeAttemptsAvailable: 3,
          cpoeCompletions: 2,
          expectedCompletions: 1.23456,
          cpoeVersions: 1,
          cpoeModelVersion: 'test-v2',
        },
      ]),
    );
    expect((await getPlayerPassingBySeason(2026))[0]).toMatchObject({
      cpoe: 25.51,
      expectedCompletionRate: 0.412,
      expectedCompletions: 1.235,
    });
  });

  test('conflicting releases suppress only scored metrics, retaining base production', async () => {
    const diagnostic = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      selectFrom.mockReturnValue(
        createQueryBuilder([
          {
            ...productionRow,
            cpoeAttemptsAvailable: 3,
            cpoeCompletions: 2,
            expectedCompletions: 1.8,
            cpoeVersions: 2,
            cpoeModelVersion: 'test-v1',
          },
        ]),
      );
      expect((await getPlayerPassingBySeason(2026))[0]).toMatchObject({
        attempts: 4,
        completions: 2,
        cpoeAttemptsAvailable: 0,
        cpoeCompletions: 0,
        expectedCompletions: null,
        expectedCompletionRate: null,
        cpoe: null,
      });
      expect(diagnostic).toHaveBeenCalledTimes(1);
    } finally {
      diagnostic.mockRestore();
    }
  });

  test('generated schemas require CPOE fields without eligibility or model version', () => {
    const doc = JSON.parse(
      readFileSync(join(process.cwd(), 'build/swagger.json'), 'utf8'),
    );
    for (const name of [
      'PassingProduction',
      'PlayerPassingSeason',
      'PlayerPassingGame',
    ]) {
      const schema = doc.components.schemas[name];
      for (const key of ['cpoeAttemptsAvailable', 'cpoeCompletions']) {
        expect(schema.required).toContain(key);
        expect(schema.properties[key].type).toBe('integer');
      }
      for (const key of [
        'expectedCompletions',
        'expectedCompletionRate',
        'cpoe',
      ]) {
        expect(schema.required).toContain(key);
        expect(schema.properties[key].nullable).toBe(true);
      }
      expect(schema.properties).not.toHaveProperty('cpoeEligibleAttempts');
      expect(schema.properties).not.toHaveProperty('cpoeModelVersion');
    }
    const play = doc.components.schemas.PassingPlay;
    for (const key of ['completionProbability', 'cpoe']) {
      expect(play.required).toContain(key);
      expect(play.properties[key].nullable).toBe(true);
    }
    expect(play.properties).not.toHaveProperty('cpoeEligible');
    expect(play.properties).not.toHaveProperty('cpoeModelVersion');
    expect(
      doc.paths['/passing/plays'].get.parameters.map(
        ({ name }: { name: string }) => name,
      ),
    ).not.toContain('cpoeEligible');
    expect(
      doc.components.schemas.PassingLocationProduction.properties,
    ).not.toHaveProperty('cpoe');
  });
});

describe('CPOE game scope', () => {
  test.each([
    {
      name: 'plays for a team season without a week',
      run: () =>
        getPassingPlays(undefined, 2026, undefined, undefined, 'michigan'),
      filter: 'lower("offense_team"."school") =',
      boundary: '"game"."season" =',
      value: 'michigan',
      occurrences: 8,
    },
    {
      name: 'plays for a week without a team',
      run: () => getPassingPlays(undefined, 2026, 5),
      filter: '"offense_conference"."division" =',
      boundary: '"game"."week" =',
      value: 2026,
      occurrences: 2,
    },
    {
      name: 'player across seasons',
      run: () =>
        getPlayerPassingBySeason(
          undefined,
          SeasonType.Both,
          undefined,
          undefined,
          '5141741',
        ),
      filter: '"roles"."passer_id" =',
      boundary: '"offense_ct"."start_year" <= "game"."season"',
      value: '5141741',
    },
    {
      name: 'team across seasons',
      run: () => getTeamPassingBySeason(undefined, SeasonType.Both, 'Michigan'),
      filter: 'lower("represented_team"."school") =',
      boundary: '"represented_ct"."start_year" <= "game"."season"',
      value: 'michigan',
    },
    {
      name: 'player game with all filters',
      run: () =>
        getPlayerPassingByGame(
          2026,
          5,
          SeasonType.Regular,
          'Michigan',
          'B1G',
          '5141741',
        ),
      filter: '"roles"."passer_id" =',
      boundary: '"game"."week" =',
      value: '5141741',
    },
    {
      name: 'FCS team game',
      run: () =>
        getTeamPassingByGame(
          2026,
          5,
          SeasonType.Regular,
          'North Dakota State',
          'MVFC',
          DivisionClassification.FCS,
        ),
      filter: '"represented_conference"."division" =',
      boundary: '"game"."week" =',
      value: DivisionClassification.FCS,
    },
  ])(
    'materializes predictions only after $name filters',
    async ({ run, filter, boundary, value, occurrences }) => {
      const queries: CompiledQuery<unknown>[] = [];
      const db = createCompileDatabase(queries);
      selectFrom.mockImplementation(db.selectFrom.bind(db));
      await run();
      expect(queries).toHaveLength(1);
      const { sql, parameters } = queries[0];
      const scope = sql
        .split('with "cpoe_games" as (')[1]
        .split('), "cpoe_predictions"')[0];
      expect(scope).toContain('select distinct "game"."id" as "game_id"');
      expect(scope).toContain(filter);
      expect(scope).toContain(boundary);
      expect(scope).not.toContain('"cp".');
      expect(scope).not.toContain('pass_play_cpoe_current');
      if (value === '5141741') {
        expect(scope).toContain(
          'inner join (select distinct "play_id" from "play_stat"',
        );
        expect(scope).toContain('"athlete_id" =');
        expect(scope).toContain('count(distinct "ps"."athlete_id")');
      }
      expect(scope).not.toContain('group by');
      expect(scope).not.toContain('order by');
      expect(parameters.filter((p) => p === value)).toHaveLength(
        occurrences ?? (value === 'michigan' || value === '5141741' ? 4 : 2),
      );
      expect(sql).toContain('"cpoe_predictions" as materialized');
      expect(sql).toContain('"prediction"."game_id" = "cpoe_games"."game_id"');
      await db.destroy();
    },
  );
});

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
  kdb: { selectFrom: jest.fn() },
}));

const selectFrom = kdb.selectFrom as jest.Mock;

const createQueryBuilder = (rows: unknown[] = []) => {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
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
  builder.execute = jest.fn().mockResolvedValue(rows);
  return builder;
};

const createCompileDatabase = (
  compiledQueries: CompiledQuery<unknown>[],
): Kysely<DB> =>
  new Kysely<DB>({
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
  // CPOE fixtures and assertions stay disabled until CPOE goes live.
  // cpoeEligible: true,
  parseStatus: 'complete',
};

const productionRow = {
  attempts: '4',
  completions: '2',
  incompletions: '1',
  interceptions: '1',
  // cpoeEligibleAttempts: '3',
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
        // cpoeEligible: true,
        parseStatus: 'complete',
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
    // Restore these CPOE-specific assertions when CPOE goes live.
    // expect(compiledSql).toContain(
    //   'and "pp"."is_intentional_grounding" = $12) as boolean) as "cpoe_eligible"',
    // );
    // expect(parameters.slice(9, 12)).toEqual([false, false, false]);

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

    await expect(getPlayerPassingBySeason(2026)).resolves.toEqual([
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
        // cpoeEligibleAttempts: 3,
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
        'filter(where "play"."offense_id" = "represented_team"."id"',
      );
      expect(sql).toContain(
        'filter(where "play"."defense_id" = "represented_team"."id"',
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
    expect(parameters.filter((value) => value === 2026)).toHaveLength(3);
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
        offenseAttempts: '4',
        offenseCompletions: '2',
        offenseIncompletions: '1',
        offenseInterceptions: '1',
        // offenseCpoeEligibleAttempts: '3',
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
        // defenseCpoeEligibleAttempts: '0',
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

    expect(result.offense).toEqual({
      attempts: 4,
      completions: 2,
      incompletions: 1,
      interceptions: 1,
      completionRate: 0.5,
      // cpoeEligibleAttempts: 3,
      airYardsAttemptsAvailable: 3,
      totalAirYards: -2,
      averageDepthOfTarget: -0.7,
      totalYardsAttemptsAvailable: 3,
      totalYards: 37,
      yardsAfterCatchAttemptsAvailable: 2,
      totalYardsAfterCatch: 0,
      averageYardsAfterCatch: 0,
    });
    expect(result.defense).toEqual({
      attempts: 0,
      completions: 0,
      incompletions: 0,
      interceptions: 0,
      completionRate: null,
      // cpoeEligibleAttempts: 0,
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

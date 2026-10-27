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
  getPlayerRushingByGame,
  getPlayerRushingBySeason,
  getRushingPlays,
  getTeamRushingByGame,
  getTeamRushingBySeason,
  queryTeamRushingBySeason,
} from './service';
import { readTeamRushingSeasonSnapshots } from './teamSeasonSnapshots';

jest.mock('./teamSeasonSnapshots', () => ({
  readTeamRushingSeasonSnapshots: jest.fn(),
}));
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
  builder.$if = jest.fn(
    (condition: boolean, apply: (query: typeof builder) => unknown) =>
      condition ? apply(builder) : builder,
  );
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

const rushingPlayRow = {
  gameId: 401752752,
  playId: '40175275287',
  driveId: '4017527521008700',
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
  clock: { minutes: 8, seconds: 42 },
  down: 3,
  distance: 7,
  playText: 'Quarterback sacked for a loss of 5 yards',
  startYardline: 42,
  startYardsToGoal: 58,
  rusherId: '4685151',
  rusher: 'Example Quarterback',
  rushDirection: null,
  rushingYards: -5,
  rusherYards: -5,
  isRushingTouchdown: false,
  isSack: true,
  isKneel: false,
  isTeamRush: false,
  attributionStatus: 'individual',
  directionAnalysisEligible: false,
  parseStatus: 'complete',
  ppa: '0',
  success: false,
};

const advancedProductionRow = {
  successRate: '0.5555',
  ppa: '0.12345',
  totalPpa: '0.98765',
  lineYards: '2.34',
  lineYardsTotal: '18.26',
  secondLevelYards: '1.26',
  secondLevelYardsTotal: '10.26',
  openFieldYards: '0.51',
  openFieldYardsTotal: '4.49',
  stuffRate: '0.1254',
  powerSuccess: '0.6666',
  explosiveness: '0.4567',
};

const directionProductionRow = (
  direction: 'left' | 'middle' | 'right' | 'unknown',
  yards: string,
) => {
  const prefix = `direction${direction[0].toUpperCase()}${direction.slice(1)}`;
  return Object.fromEntries(
    Object.entries({
      carries: '1',
      yards,
      yardsPerCarry: yards,
      ...advancedProductionRow,
    }).map(([key, value]) => [
      `${prefix}${key[0].toUpperCase()}${key.slice(1)}`,
      value,
    ]),
  );
};

const directionProductionRows = {
  ...directionProductionRow('left', '5'),
  ...directionProductionRow('middle', '-1'),
  ...directionProductionRow('right', '7'),
  ...directionProductionRow('unknown', '0'),
};
const zeroAdvancedProductionRow = Object.fromEntries(
  Object.keys(advancedProductionRow).map((key) => [key, '0']),
);
const zeroDirectionProductionRows = Object.fromEntries(
  Object.keys(directionProductionRows).map((key) => [key, '0']),
);

const productionRow = {
  attempts: '8',
  rushingYardsAvailable: '7',
  totalRushingYards: '-2',
  yardsPerCarry: '-0.2857',
  individualAttempts: '4',
  unattributedAttempts: '4',
  sacks: '1',
  kneels: '1',
  teamRushes: '1',
  multiCarrierAttempts: '1',
  directionEligibleAttempts: '4',
  directionAvailableAttempts: '3',
  ...advancedProductionRow,
  ...directionProductionRows,
  touchdownStatusAvailable: '7',
  rushingTouchdowns: '2',
};

const expectedAdvancedProduction = {
  successRate: 0.556,
  ppa: 0.123,
  totalPpa: 0.988,
  lineYards: 2.3,
  lineYardsTotal: 18.3,
  secondLevelYards: 1.3,
  secondLevelYardsTotal: 10.3,
  openFieldYards: 0.5,
  openFieldYardsTotal: 4.5,
  stuffRate: 0.125,
  powerSuccess: 0.667,
  explosiveness: 0.457,
};

const expectedDirectionProduction = (yards: number) => ({
  carries: 1,
  yards,
  yardsPerCarry: yards,
  ...expectedAdvancedProduction,
});
const zeroAdvancedProduction = Object.fromEntries(
  Object.keys(expectedAdvancedProduction).map((key) => [key, 0]),
);
const zeroDirectionProduction = {
  carries: 0,
  yards: 0,
  yardsPerCarry: 0,
  ...zeroAdvancedProduction,
};

const playerProductionRow = {
  ...productionRow,
  attempts: '4',
  rushingYardsAvailable: '4',
  totalRushingYards: '-5',
  yardsPerCarry: '-1.25',
  individualAttempts: '4',
  unattributedAttempts: '0',
  kneels: '0',
  teamRushes: '0',
  multiCarrierAttempts: '0',
};

const prefixedProduction = (
  prefix: string,
  row: Record<string, string | null>,
) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      `${prefix}${key[0].toUpperCase()}${key.slice(1)}`,
      value,
    ]),
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('rushing validation', () => {
  test('requires an approved primary scope for plays', async () => {
    await expect(getRushingPlays()).rejects.toMatchObject({
      fields: {
        gameId: expect.any(Object),
        year: expect.any(Object),
        rusherId: expect.any(Object),
      },
      message: 'Validation error',
      status: 400,
    });
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('rejects week without year for plays and player games', async () => {
    await expect(
      getRushingPlays(
        undefined,
        undefined,
        1,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '4685151',
      ),
    ).rejects.toMatchObject({
      fields: { week: { value: 1, message: 'week requires year' } },
    });
    await expect(
      getPlayerRushingByGame(
        undefined,
        1,
        undefined,
        undefined,
        undefined,
        '4685151',
      ),
    ).rejects.toBeInstanceOf(ValidateError);
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('requires year or rusher for player aggregates', async () => {
    await expect(getPlayerRushingBySeason()).rejects.toBeInstanceOf(
      ValidateError,
    );
    await expect(getPlayerRushingByGame()).rejects.toMatchObject({
      message: 'Validation error',
      status: 400,
    });
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('requires year or team for team season aggregates', async () => {
    await expect(getTeamRushingBySeason()).rejects.toMatchObject({
      fields: { year: expect.any(Object), team: expect.any(Object) },
      message: 'Validation error',
    });
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('requires team or week whenever plays use a year scope', async () => {
    await expect(getRushingPlays(undefined, 2026)).rejects.toMatchObject({
      fields: {
        team: {
          value: undefined,
          message: 'team or week is required with year',
        },
        week: {
          value: undefined,
          message: 'team or week is required with year',
        },
      },
    });
    await expect(getRushingPlays(401752752, 2026)).rejects.toBeInstanceOf(
      ValidateError,
    );
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('requires team or week whenever player games use a year scope', async () => {
    await expect(
      getPlayerRushingByGame(
        2026,
        undefined,
        undefined,
        undefined,
        undefined,
        '4685151',
      ),
    ).rejects.toMatchObject({
      fields: {
        team: expect.any(Object),
        week: expect.any(Object),
      },
    });
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('requires team or week for team games', async () => {
    await expect(getTeamRushingByGame(undefined)).rejects.toMatchObject({
      fields: {
        year: { value: undefined, message: 'year is required' },
      },
    });
    await expect(getTeamRushingByGame(2026)).rejects.toMatchObject({
      fields: {
        team: { value: undefined, message: 'team or week is required' },
        week: { value: undefined, message: 'team or week is required' },
      },
    });
    expect(selectFrom).not.toHaveBeenCalled();
  });
});

describe('getRushingPlays', () => {
  test('maps the authoritative row and preserves signed, zero, and false values', async () => {
    const builder = createQueryBuilder([rushingPlayRow]);
    selectFrom.mockReturnValue(builder);

    await expect(getRushingPlays(401752752)).resolves.toEqual([
      {
        gameId: 401752752,
        playId: '40175275287',
        driveId: '4017527521008700',
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
        clock: { minutes: 8, seconds: 42 },
        down: 3,
        distance: 7,
        playText: 'Quarterback sacked for a loss of 5 yards',
        startYardline: 42,
        startYardsToGoal: 58,
        rusherId: '4685151',
        rusher: 'Example Quarterback',
        rushDirection: null,
        rushingYards: -5,
        rusherYards: -5,
        isRushingTouchdown: false,
        isSack: true,
        isKneel: false,
        isTeamRush: false,
        attributionStatus: 'individual',
        directionAnalysisEligible: false,
        parseStatus: 'complete',
        ppa: 0,
        success: false,
      },
    ]);

    expect(selectFrom).toHaveBeenCalledWith('game');
    expect(builder.innerJoin).toHaveBeenCalledWith(
      'rushPlay as rp',
      'rp.playId',
      'play.id',
    );
    expect(builder.leftJoinLateral).toHaveBeenCalled();
    expect(builder.where).toHaveBeenCalledWith(
      'offenseConference.division',
      '=',
      DivisionClassification.FBS,
    );
    expect(JSON.stringify(builder.select.mock.calls)).not.toMatch(
      /parserVersion|playTypeId/,
    );
  });

  test('preserves partial team-only data and nullable fields', async () => {
    const builder = createQueryBuilder([
      {
        ...rushingPlayRow,
        clock: null,
        offenseConference: null,
        defenseConference: null,
        rusherId: null,
        rusher: null,
        rushingYards: 0,
        rusherYards: null,
        isRushingTouchdown: null,
        isSack: false,
        isTeamRush: true,
        attributionStatus: 'team',
        directionAnalysisEligible: false,
        parseStatus: 'partial',
        ppa: null,
        success: null,
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const [result] = await getRushingPlays(401752752);

    expect(result).toMatchObject({
      clock: { minutes: 0, seconds: 0 },
      offenseConference: null,
      defenseConference: null,
      rusherId: null,
      rusher: null,
      rushingYards: 0,
      rusherYards: null,
      isRushingTouchdown: null,
      isTeamRush: true,
      attributionStatus: 'team',
      directionAnalysisEligible: false,
      parseStatus: 'partial',
      ppa: null,
      success: null,
    });
  });

  test('retains zero and every explicit false filter', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getRushingPlays(
      0,
      2026,
      0,
      SeasonType.Both,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      false,
      false,
      false,
      false,
      DivisionClassification.FCS,
    );

    expect(builder.where).toHaveBeenCalledWith('game.id', '=', 0);
    expect(builder.where).toHaveBeenCalledWith('game.week', '=', 0);
    expect(builder.where).toHaveBeenCalledWith(expect.anything(), '=', false);
    expect(builder.where).toHaveBeenCalledWith(
      'rp.isRushingTouchdown',
      '=',
      false,
    );
    expect(builder.where).toHaveBeenCalledWith('rp.isSack', '=', false);
    expect(builder.where).toHaveBeenCalledWith('rp.isKneel', '=', false);
    expect(builder.where).toHaveBeenCalledWith('rp.isTeamRush', '=', false);
    expect(builder.where).toHaveBeenCalledWith(
      'offenseConference.division',
      '=',
      DivisionClassification.FCS,
    );
    expect(builder.where).not.toHaveBeenCalledWith(
      'game.seasonType',
      '=',
      SeasonType.Both,
    );
  });

  test('composes the rusher, direction, and attribution filters', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getRushingPlays(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '4685151',
      'left',
      undefined,
      'conflict',
    );

    expect(builder.where).toHaveBeenCalledWith(
      'roles.rusherId',
      '=',
      '4685151',
    );
    expect(builder.where).toHaveBeenCalledWith('rp.rushDirection', '=', 'left');
    expect(builder.where).toHaveBeenCalledWith(
      'rp.attributionStatus',
      '=',
      'conflict',
    );
    expect(builder.where).not.toHaveBeenCalledWith(
      expect.anything(),
      '=',
      true,
    );
  });
});

describe('player rushing aggregates', () => {
  test('maps a signed sack-inclusive season group without touchdown fields', async () => {
    const builder = createQueryBuilder([
      {
        season: 2026,
        playerId: '4685151',
        player: 'Example Quarterback',
        team: 'Michigan State',
        conference: 'B1G',
        ...playerProductionRow,
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const [result] = await getPlayerRushingBySeason(2026);

    expect(result).toMatchObject({
      season: 2026,
      playerId: '4685151',
      team: 'Michigan State',
      attempts: 4,
      rushingYardsAvailable: 4,
      totalRushingYards: -5,
      yardsPerCarry: -1.2,
      individualAttempts: 4,
      unattributedAttempts: 0,
      sacks: 1,
      teamRushes: 0,
      multiCarrierAttempts: 0,
    });
    expect(result).not.toHaveProperty('touchdownStatusAvailable');
    expect(result).not.toHaveProperty('rushingTouchdowns');
    expect(builder.where).toHaveBeenCalledWith(
      'roles.rusherId',
      'is not',
      null,
    );
  });

  test('maps game context and keeps the offense team grouping', async () => {
    const builder = createQueryBuilder([
      {
        gameId: 401752752,
        season: 2026,
        week: 1,
        seasonType: 'regular',
        playerId: '4685151',
        player: 'Example Quarterback',
        team: 'Michigan State',
        conference: null,
        opponent: 'Western Michigan',
        ...playerProductionRow,
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const [result] = await getPlayerRushingByGame(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '4685151',
    );

    expect(result).toMatchObject({
      gameId: 401752752,
      season: 2026,
      week: 1,
      team: 'Michigan State',
      conference: null,
      opponent: 'Western Michigan',
    });
    expect(builder.groupBy).toHaveBeenCalledWith(
      expect.arrayContaining(['game.id', 'offenseTeam.school', 'rusher.id']),
    );
  });
});

describe('team rushing aggregates', () => {
  test('maps complete offense and a zero-attempt defense separately', async () => {
    const zeroSide = {
      ...productionRow,
      attempts: '0',
      rushingYardsAvailable: '0',
      totalRushingYards: null,
      yardsPerCarry: null,
      individualAttempts: '0',
      unattributedAttempts: '0',
      sacks: '0',
      kneels: '0',
      teamRushes: '0',
      multiCarrierAttempts: '0',
      directionEligibleAttempts: '0',
      directionAvailableAttempts: '0',
      ...zeroAdvancedProductionRow,
      ...zeroDirectionProductionRows,
      touchdownStatusAvailable: '0',
      rushingTouchdowns: '0',
    };
    const builder = createQueryBuilder([
      {
        season: 2026,
        team: 'Michigan State',
        conference: 'B1G',
        ...prefixedProduction('offense', productionRow),
        ...prefixedProduction('defense', zeroSide),
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const [result] = await queryTeamRushingBySeason(2026);

    expect(result.offense).toEqual({
      attempts: 8,
      rushingYardsAvailable: 7,
      totalRushingYards: -2,
      yardsPerCarry: -0.3,
      individualAttempts: 4,
      unattributedAttempts: 4,
      sacks: 1,
      kneels: 1,
      teamRushes: 1,
      multiCarrierAttempts: 1,
      directionEligibleAttempts: 4,
      directionAvailableAttempts: 3,
      ...expectedAdvancedProduction,
      directions: {
        left: expectedDirectionProduction(5),
        middle: expectedDirectionProduction(-1),
        right: expectedDirectionProduction(7),
        unknown: expectedDirectionProduction(0),
      },
      touchdownStatusAvailable: 7,
      rushingTouchdowns: 2,
    });
    expect(result.defense).toEqual({
      attempts: 0,
      rushingYardsAvailable: 0,
      totalRushingYards: null,
      yardsPerCarry: null,
      individualAttempts: 0,
      unattributedAttempts: 0,
      sacks: 0,
      kneels: 0,
      teamRushes: 0,
      multiCarrierAttempts: 0,
      directionEligibleAttempts: 0,
      directionAvailableAttempts: 0,
      ...zeroAdvancedProduction,
      directions: {
        left: zeroDirectionProduction,
        middle: zeroDirectionProduction,
        right: zeroDirectionProduction,
        unknown: zeroDirectionProduction,
      },
      touchdownStatusAvailable: 0,
      rushingTouchdowns: 0,
    });
  });

  test('maps the game opponent and does not invert defense production', async () => {
    const defense = {
      ...productionRow,
      totalRushingYards: '-14',
      yardsPerCarry: '-2',
    };
    const builder = createQueryBuilder([
      {
        gameId: 401752752,
        season: 2026,
        week: 1,
        seasonType: 'regular',
        team: 'Michigan State',
        conference: 'B1G',
        opponent: 'Western Michigan',
        ...prefixedProduction('offense', productionRow),
        ...prefixedProduction('defense', defense),
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const [result] = await getTeamRushingByGame(2026, 1);

    expect(result).toMatchObject({
      gameId: 401752752,
      team: 'Michigan State',
      opponent: 'Western Michigan',
      offense: { totalRushingYards: -2 },
      defense: { totalRushingYards: -14, yardsPerCarry: -2 },
    });
    expect(builder.where).toHaveBeenCalledWith('game.season', '=', 2026);
  });
});

describe('compiled rushing queries', () => {
  test('use base tables and preserve the enrichment boundaries', async () => {
    const compiledQueries: CompiledQuery<unknown>[] = [];
    const compileDb = createCompileDatabase(compiledQueries);
    selectFrom.mockImplementation(compileDb.selectFrom.bind(compileDb));

    await getRushingPlays(undefined, 2026, 1);
    await getPlayerRushingBySeason(2026);
    await getPlayerRushingByGame(2026, 1);
    await queryTeamRushingBySeason(2026);
    await getTeamRushingByGame(2026, 1);

    expect(compiledQueries).toHaveLength(5);
    for (const { sql: compiledSql } of compiledQueries) {
      expect(compiledSql).toContain('from "game"');
      expect(compiledSql).toContain(
        'inner join "drive" on "drive"."game_id" = "game"."id"',
      );
      expect(compiledSql).toContain(
        'inner join "play" on "play"."drive_id" = "drive"."id"',
      );
      expect(compiledSql).toContain(
        'inner join "rush_play" as "rp" on "rp"."play_id" = "play"."id"',
      );
      expect(compiledSql).toContain('left join lateral');
      expect(compiledSql).toContain('from "play_stat" as "ps"');
      expect(compiledSql).toContain('count(distinct "ps"."athlete_id") filter');
      expect(compiledSql).toContain('bool_and(');
      expect(compiledSql).toContain('case when "rp"."is_sack" = $');
      expect(compiledSql).toContain('else "rp"."rushing_yards" end');
      expect(compiledSql).not.toContain('rush_play_data');
      expect(compiledSql).not.toContain('parser_version');
      expect(compiledSql).not.toContain('play_type_id');
    }

    for (const { sql: compiledSql } of compiledQueries.slice(1, 3)) {
      expect(compiledSql).toContain(
        'inner join "athlete" as "rusher" on "roles"."rusher_id" = "rusher"."id"',
      );
      expect(compiledSql).toContain('"roles"."rusher_id" is not null');
      expect(compiledSql).toContain('sum(case');
      expect(compiledSql).toContain('then "rp"."rushing_yards"');
      expect(compiledSql).toContain(
        'avg("play"."ppa") filter(where ("rp"."is_sack"',
      );
      expect(compiledSql).not.toContain('touchdown_status_available');
    }

    for (const { sql: compiledSql } of compiledQueries.slice(1)) {
      expect(compiledSql).toContain('success_rate"');
      expect(compiledSql).toContain('total_ppa"');
      expect(compiledSql).toContain('line_yards_total"');
      expect(compiledSql).toContain('direction_left_carries"');
      expect(compiledSql).toContain('direction_middle_yards"');
      expect(compiledSql).toContain('direction_right_power_success"');
      expect(compiledSql).toContain('direction_unknown_explosiveness"');
      expect(compiledSql).not.toContain('direction_left_attempts');
    }

    for (const { sql: compiledSql } of compiledQueries.slice(3)) {
      expect(compiledSql).toContain('sum("rp"."rushing_yards")');
      expect(compiledSql).toContain(
        'filter(where "play"."offense_id" = "represented_team"."id"',
      );
      expect(compiledSql).toContain(
        'filter(where "play"."defense_id" = "represented_team"."id"',
      );
      expect(compiledSql).toContain('touchdown_status_available');
    }

    expect(compiledQueries[1].sql).toContain('"rp"."is_sack" = $');
    expect(compiledQueries[1].sql).toContain('"rp"."is_kneel" = $');
    expect(compiledQueries[1].sql).toContain('"rp"."is_team_rush" = $');
    expect(compiledQueries[3].sql).toContain('"rp"."rush_direction" is null');

    await compileDb.destroy();
  });
});

describe('compiled rushing scopes', () => {
  const compile = async (
    run: () => Promise<unknown>,
  ): Promise<CompiledQuery<unknown>> => {
    const compiledQueries: CompiledQuery<unknown>[] = [];
    const compileDb = createCompileDatabase(compiledQueries);
    selectFrom.mockImplementation(compileDb.selectFrom.bind(compileDb));
    await run();
    await compileDb.destroy();
    expect(compiledQueries).toHaveLength(1);
    return compiledQueries[0];
  };
  const parameter = (query: CompiledQuery<unknown>, placeholder: string) =>
    query.parameters[Number(placeholder) - 1];
  // Both joins must sit at these positions; a later join is applied too late.
  const teamGames = new RegExp(
    [
      String.raw`from "game" inner join \(select distinct "scope_gt"\."game_id"`,
      String.raw` from "game_team" as "scope_gt" inner join "team" as "scope_team"`,
      String.raw` on "scope_team"\."id" = "scope_gt"\."team_id"`,
      String.raw` where \(lower\("scope_team"\."school"\) = \$(\d+)`,
      String.raw` or lower\("scope_team"\."abbreviation"\) = \$(\d+)\)\)`,
      String.raw` as "team_games" on "team_games"\."game_id" = "game"\."id"`,
      String.raw` inner join "drive"`,
    ].join(''),
  );
  const rusherPlays = new RegExp(
    [
      String.raw`inner join "play" on "play"\."drive_id" = "drive"\."id"`,
      String.raw` inner join \(select distinct "play_id" from "play_stat"`,
      String.raw` where "athlete_id" = \$(\d+) and "stat_type_id" in \(([^)]*)\)\)`,
      String.raw` as "rusher_plays" on "rusher_plays"\."play_id" = "play"\."id"`,
      String.raw` inner join "rush_play" as "rp"`,
    ].join(''),
  );

  const queries = [
    {
      name: 'plays',
      team: () => getRushingPlays(undefined, 2026, undefined, undefined, 'WYO'),
      rusher: () =>
        getRushingPlays(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          '4875127',
        ),
      week: () => getRushingPlays(undefined, 2026, 1),
    },
    {
      name: 'player seasons',
      team: () => getPlayerRushingBySeason(2026, undefined, 'WYO'),
      rusher: () =>
        getPlayerRushingBySeason(
          undefined,
          undefined,
          undefined,
          undefined,
          '4875127',
        ),
      week: () => getPlayerRushingBySeason(2026, undefined, undefined, 'SEC'),
    },
    {
      name: 'player games',
      team: () => getPlayerRushingByGame(2026, undefined, undefined, 'WYO'),
      rusher: () =>
        getPlayerRushingByGame(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          '4875127',
        ),
      week: () => getPlayerRushingByGame(2026, 1),
    },
  ];

  describe.each(queries)('$name', ({ team, rusher, week }) => {
    test('a team scope starts from that team’s games', async () => {
      const query = await compile(team);

      const match = teamGames.exec(query.sql);
      expect(match).not.toBeNull();
      const [, school, abbreviation] = match as RegExpExecArray;
      expect(parameter(query, school)).toBe('wyo');
      expect(parameter(query, abbreviation)).toBe('wyo');
      // The play-level team predicate remains the filter.
      expect(query.sql).toContain('(lower("offense_team"."school") = $');
      expect(query.sql).not.toContain('"rusher_plays"');
    });

    test('a rusher scope starts from that athlete’s rush and sack plays', async () => {
      const query = await compile(rusher);

      const match = rusherPlays.exec(query.sql);
      expect(match).not.toBeNull();
      const [, athlete, types] = match as RegExpExecArray;
      expect(parameter(query, athlete)).toBe('4875127');
      expect(
        types.split(',').map((type) => parameter(query, type.trim().slice(1))),
      ).toEqual([7, 11]);
      // The guarded role remains the filter.
      expect(query.sql).toContain('"roles"."rusher_id" = $');
      expect(query.sql).not.toContain('"team_games"');
    });

    test('other scopes are unchanged', async () => {
      const query = await compile(week);

      expect(query.sql).toContain('from "game" inner join "drive"');
      expect(query.sql).not.toContain('"team_games"');
      expect(query.sql).not.toContain('"rusher_plays"');
    });
  });
});

describe('team-season rushing source', () => {
  const readSnapshots = readTeamRushingSeasonSnapshots as jest.Mock;
  const stored = [{ season: 2026, team: 'Michigan', conference: 'B1G' }];

  beforeEach(() => {
    readSnapshots.mockReset();
    selectFrom.mockReset();
  });

  test.each([undefined, SeasonType.Both])(
    'serves seasonType=%s from complete snapshots',
    async (seasonType) => {
      readSnapshots.mockResolvedValue({ status: 'found', rows: stored });
      await expect(
        getTeamRushingBySeason(2026, seasonType, 'Michigan', 'B1G'),
      ).resolves.toBe(stored);
      expect(readSnapshots).toHaveBeenCalledWith(kdb, {
        year: 2026,
        team: 'Michigan',
        conference: 'B1G',
        classification: DivisionClassification.FBS,
      });
      expect(selectFrom).not.toHaveBeenCalled();
    },
  );

  test('falls back to the live read when snapshots are incomplete', async () => {
    readSnapshots.mockResolvedValue({
      status: 'incomplete',
      reason: 'missing-snapshot',
      season: 2025,
      teamId: 2,
    });
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    selectFrom.mockReturnValue(createQueryBuilder());
    await expect(getTeamRushingBySeason(2025)).resolves.toEqual([]);
    expect(info).toHaveBeenCalledWith('Team rushing season snapshot fallback', {
      season: 2025,
      teamId: 2,
      reason: 'missing-snapshot',
    });
    expect(selectFrom).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  test.each([
    DivisionClassification.FCS,
    DivisionClassification.II,
    DivisionClassification.III,
  ])(
    'reads %s live because only FBS snapshots are rebuilt daily',
    async (classification) => {
      selectFrom.mockReturnValue(createQueryBuilder());
      await getTeamRushingBySeason(
        2025,
        undefined,
        undefined,
        undefined,
        classification,
      );
      expect(readSnapshots).not.toHaveBeenCalled();
      expect(selectFrom).toHaveBeenCalledTimes(1);
    },
  );

  test.each([SeasonType.Regular, SeasonType.Postseason])(
    'reads %s splits live because snapshots aggregate all season types',
    async (seasonType) => {
      selectFrom.mockReturnValue(createQueryBuilder());
      await getTeamRushingBySeason(2026, seasonType);
      expect(readSnapshots).not.toHaveBeenCalled();
      expect(selectFrom).toHaveBeenCalledTimes(1);
    },
  );
});

import {
  AliasedExpression,
  Expression,
  SqlBool,
  expressionBuilder,
} from 'kysely';
import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import { DB } from '../../config/types/db';
import { DivisionClassification, SeasonType } from '../enums';
import {
  PlayerRushingGame,
  PlayerRushingSeason,
  RushAttributionStatus,
  RushDirection,
  RushParseStatus,
  RushingDirectionProduction,
  RushingPlay,
  RushingProduction,
  TeamRushingGame,
  TeamRushingProduction,
  TeamRushingSeason,
} from './types';

type AggregateRow = Record<string, unknown>;
interface RushingAggregateTables {
  play: DB['play'];
  representedTeam: DB['team'];
  roles: { rusherId: string | null };
  rp: DB['rushPlay'];
}
interface RushingRoleTables {
  playStat: DB['playStat'];
  rp: DB['rushPlay'];
}
type RushingAggregateTable = keyof RushingAggregateTables;
type AggregateCondition = Expression<SqlBool>;
type AggregateSelection = AliasedExpression<number | string | null, string>;
type AggregatePopulation = 'player' | 'team';
type AggregateSide = 'offense' | 'defense';
type DirectionBucket = RushDirection | 'unknown';
type AdvancedRushingProduction = Omit<
  RushingDirectionProduction,
  'carries' | 'yards' | 'yardsPerCarry'
>;

const directionBuckets: DirectionBucket[] = [
  'left',
  'middle',
  'right',
  'unknown',
];

const guardedRusherRoles = () => {
  const eb = expressionBuilder<RushingRoleTables, 'rp'>();

  return eb
    .selectFrom('playStat as ps')
    .select((roleEb) => {
      const primaryStatType = roleEb
        .case()
        .when('rp.isSack', '=', true)
        .then(11)
        .else(7)
        .end();
      const otherPrimaryStatType = roleEb
        .case()
        .when('rp.isSack', '=', true)
        .then(7)
        .else(11)
        .end();
      const expectedRusherYards = roleEb
        .case()
        .when('rp.isSack', '=', true)
        .then(roleEb(roleEb.val(0), '-', roleEb.ref('rp.rushingYards')))
        .else(roleEb.ref('rp.rushingYards'))
        .end();
      const primaryStat = roleEb('ps.statTypeId', '=', primaryStatType);
      const otherPrimaryStat = roleEb(
        'ps.statTypeId',
        '=',
        otherPrimaryStatType,
      );
      const primaryAthleteCount = roleEb.fn
        .count<number>('ps.athleteId')
        .distinct()
        .filterWhere(primaryStat);
      const matchingPrimaryYards = roleEb.fn
        .agg<SqlBool>('bool_and', [
          roleEb.and([
            roleEb('ps.stat', 'is not', null),
            roleEb('ps.stat', '=', expectedRusherYards),
          ]),
        ])
        .filterWhere(primaryStat);
      const otherPrimaryCount = roleEb.fn
        .countAll<number>()
        .filterWhere(otherPrimaryStat);
      const rusherId = roleEb.fn
        .min<string>('ps.athleteId')
        .filterWhere(primaryStat);

      return roleEb
        .case()
        .when(
          roleEb.and([
            roleEb('rp.attributionStatus', '=', 'individual'),
            roleEb('rp.rushingYards', 'is not', null),
            roleEb(primaryAthleteCount, '=', 1),
            matchingPrimaryYards,
            roleEb(otherPrimaryCount, '=', 0),
          ]),
        )
        .then(rusherId)
        .end()
        .as('rusherId');
    })
    .whereRef('ps.playId', '=', 'rp.playId')
    .as('roles');
};

const validateRushingPlayScope = (
  gameId?: number,
  year?: number,
  week?: number,
  team?: string,
  rusherId?: string,
): void => {
  if (week !== undefined && year === undefined) {
    throw new ValidateError(
      {
        week: { value: week, message: 'week requires year' },
      },
      'Validation error',
    );
  }

  if (gameId === undefined && year === undefined && rusherId === undefined) {
    throw new ValidateError(
      {
        gameId: {
          value: gameId,
          message: 'gameId, year, or rusherId is required',
        },
        year: {
          value: year,
          message: 'gameId, year, or rusherId is required',
        },
        rusherId: {
          value: rusherId,
          message: 'gameId, year, or rusherId is required',
        },
      },
      'Validation error',
    );
  }

  if (year !== undefined && team === undefined && week === undefined) {
    throw new ValidateError(
      {
        team: { value: team, message: 'team or week is required with year' },
        week: { value: week, message: 'team or week is required with year' },
      },
      'Validation error',
    );
  }
};

const validatePlayerRushingSeasonScope = (
  year?: number,
  rusherId?: string,
): void => {
  if (year === undefined && rusherId === undefined) {
    throw new ValidateError(
      {
        year: {
          value: year,
          message: 'year required when rusherId not specified',
        },
        rusherId: {
          value: rusherId,
          message: 'rusherId required when year not specified',
        },
      },
      'Validation error',
    );
  }
};

const validatePlayerRushingGameScope = (
  year?: number,
  week?: number,
  team?: string,
  rusherId?: string,
): void => {
  if (week !== undefined && year === undefined) {
    throw new ValidateError(
      {
        week: { value: week, message: 'week requires year' },
      },
      'Validation error',
    );
  }

  if (year === undefined && rusherId === undefined) {
    throw new ValidateError(
      {
        year: {
          value: year,
          message: 'year required when rusherId not specified',
        },
        rusherId: {
          value: rusherId,
          message: 'rusherId required when year not specified',
        },
      },
      'Validation error',
    );
  }

  if (year !== undefined && team === undefined && week === undefined) {
    throw new ValidateError(
      {
        team: { value: team, message: 'team or week is required with year' },
        week: { value: week, message: 'team or week is required with year' },
      },
      'Validation error',
    );
  }
};

const validateTeamRushingSeasonScope = (year?: number, team?: string): void => {
  if (year === undefined && team === undefined) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }
};

const validateTeamRushingGameScope = (
  year?: number,
  week?: number,
  team?: string,
): void => {
  if (year === undefined) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year is required' },
      },
      'Validation error',
    );
  }

  if (team === undefined && week === undefined) {
    throw new ValidateError(
      {
        team: { value: team, message: 'team or week is required' },
        week: { value: week, message: 'team or week is required' },
      },
      'Validation error',
    );
  }
};

const fieldName = (prefix: string, name: string): string =>
  prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;

const directionFieldName = (
  prefix: string,
  direction: DirectionBucket,
  name: string,
): string =>
  fieldName(
    prefix,
    `direction${direction[0].toUpperCase()}${direction.slice(1)}${name[0].toUpperCase()}${name.slice(1)}`,
  );

const aggregateSelections = (
  population: AggregatePopulation,
  prefix = '',
  side?: AggregateSide,
  includeTouchdowns = false,
): AggregateSelection[] => {
  const eb = expressionBuilder<RushingAggregateTables, RushingAggregateTable>();
  const sideConditions: AggregateCondition[] =
    side === 'offense'
      ? [eb('play.offenseId', '=', eb.ref('representedTeam.id'))]
      : side === 'defense'
        ? [eb('play.defenseId', '=', eb.ref('representedTeam.id'))]
        : [];
  const alias = (name: string): string => fieldName(prefix, name);
  const yardage =
    population === 'player'
      ? eb
          .case()
          .when(
            eb.and([
              eb('roles.rusherId', 'is not', null),
              eb('rp.parseStatus', '<>', 'invalid'),
            ]),
          )
          .then(eb.ref('rp.rushingYards'))
          .end()
      : eb.ref('rp.rushingYards');
  const filteredCount = (conditions: AggregateCondition[]) => {
    const aggregate = eb.fn.countAll<number>();

    return conditions.length
      ? aggregate.filterWhere(eb.and(conditions))
      : aggregate;
  };
  const filteredColumnCount = (conditions: AggregateCondition[]) => {
    const aggregate = eb.fn.count<number>(yardage);

    return conditions.length
      ? aggregate.filterWhere(eb.and(conditions))
      : aggregate;
  };
  const filteredSum = (
    expression: Expression<number | string | null>,
    conditions: AggregateCondition[],
  ) => {
    const aggregate = eb.fn.sum<number>(expression);

    return conditions.length
      ? aggregate.filterWhere(eb.and(conditions))
      : aggregate;
  };
  const filteredAverage = (
    expression: Expression<number | string | null>,
    conditions: AggregateCondition[],
  ) => {
    const aggregate = eb.fn.avg<number>(expression);

    return conditions.length
      ? aggregate.filterWhere(eb.and(conditions))
      : aggregate;
  };
  const count = (
    name: string,
    conditions: AggregateCondition[] = [],
  ): AggregateSelection =>
    filteredCount([...sideConditions, ...conditions]).as(alias(name));
  const countColumn = (name: string): AggregateSelection =>
    filteredColumnCount(sideConditions).as(alias(name));
  const aggregateColumn = (
    operation: 'sum' | 'avg',
    name: string,
  ): AggregateSelection =>
    (operation === 'sum'
      ? filteredSum(yardage, sideConditions)
      : filteredAverage(yardage, sideConditions)
    ).as(alias(name));
  const directionEligible = eb.and([
    eb('rp.isSack', '=', false),
    eb('rp.isKneel', '=', false),
    eb('rp.isTeamRush', '=', false),
    eb('rp.parseStatus', '<>', 'invalid'),
  ]);
  const advancedMetricSelections = (
    conditions: AggregateCondition[],
    metricAlias: (name: string) => string,
  ): AggregateSelection[] => {
    const withConditions = (...extra: AggregateCondition[]) => [
      ...conditions,
      ...extra,
    ];
    const attemptCount = filteredCount(conditions);
    const safeAttemptCount = eb
      .case()
      .when(attemptCount, '=', 0)
      .then(1)
      .else(attemptCount)
      .end();
    const shortYardage = eb('play.distance', '<=', 2);
    const shortYardageAttemptCount = filteredCount(
      withConditions(shortYardage),
    );
    const safeShortYardageAttemptCount = eb
      .case()
      .when(shortYardageAttemptCount, '=', 0)
      .then(1)
      .else(shortYardageAttemptCount)
      .end();
    const successful = eb('play.success', '=', true);
    const numericYardage = eb.cast<number>(yardage, 'numeric');
    const lineYards = eb
      .case()
      .when(yardage, 'is', null)
      .then(null)
      .when(yardage, '<=', 0)
      .then(eb(numericYardage, '*', 1.2))
      .when(yardage, '<', 5)
      .then(numericYardage)
      .when(yardage, '<', 11)
      .then(
        eb(eb.val(4), '+', eb(eb.parens(eb(numericYardage, '-', 4)), '*', 0.5)),
      )
      .else(7)
      .end();
    const secondLevelYards = eb
      .case()
      .when(yardage, 'is', null)
      .then(null)
      .when(yardage, '>=', 10)
      .then(5)
      .when(yardage, '>', 5)
      .then(eb(yardage, '-', 5))
      .else(0)
      .end();
    const openFieldYards = eb
      .case()
      .when(yardage, 'is', null)
      .then(null)
      .when(yardage, '>', 10)
      .then(eb(yardage, '-', 10))
      .else(0)
      .end();
    const as = (
      expression: Expression<number | string | null>,
      name: string,
    ): AggregateSelection => eb.parens(expression).as(metricAlias(name));
    const zero = eb.val(0);
    const averagePpa = filteredAverage(eb.ref('play.ppa'), conditions);
    const totalPpa = filteredSum(eb.ref('play.ppa'), conditions);
    const totalLineYards = filteredSum(lineYards, conditions);
    const totalSecondLevelYards = filteredSum(secondLevelYards, conditions);
    const totalOpenFieldYards = filteredSum(openFieldYards, conditions);

    return [
      as(
        eb(
          eb.cast<number>(filteredCount(withConditions(successful)), 'numeric'),
          '/',
          safeAttemptCount,
        ),
        'successRate',
      ),
      as(eb.fn.coalesce(averagePpa, zero), 'ppa'),
      as(eb.fn.coalesce(totalPpa, zero), 'totalPpa'),
      as(
        eb.fn.coalesce(
          eb(eb.cast<number>(totalLineYards, 'numeric'), '/', safeAttemptCount),
          zero,
        ),
        'lineYards',
      ),
      as(eb.fn.coalesce(totalLineYards, zero), 'lineYardsTotal'),
      as(
        eb.fn.coalesce(
          eb(
            eb.cast<number>(totalSecondLevelYards, 'numeric'),
            '/',
            safeAttemptCount,
          ),
          zero,
        ),
        'secondLevelYards',
      ),
      as(eb.fn.coalesce(totalSecondLevelYards, zero), 'secondLevelYardsTotal'),
      as(
        eb.fn.coalesce(
          eb(
            eb.cast<number>(totalOpenFieldYards, 'numeric'),
            '/',
            safeAttemptCount,
          ),
          zero,
        ),
        'openFieldYards',
      ),
      as(eb.fn.coalesce(totalOpenFieldYards, zero), 'openFieldYardsTotal'),
      as(
        eb(
          eb.cast<number>(
            filteredCount(withConditions(eb(yardage, '<=', 0))),
            'numeric',
          ),
          '/',
          safeAttemptCount,
        ),
        'stuffRate',
      ),
      as(
        eb(
          eb.cast<number>(
            filteredCount(withConditions(shortYardage, successful)),
            'numeric',
          ),
          '/',
          safeShortYardageAttemptCount,
        ),
        'powerSuccess',
      ),
      as(
        eb.fn.coalesce(
          filteredAverage(eb.ref('play.ppa'), withConditions(successful)),
          zero,
        ),
        'explosiveness',
      ),
    ];
  };
  const directionSelections = (
    direction: DirectionBucket,
  ): AggregateSelection[] => {
    const directionCondition =
      direction === 'unknown'
        ? eb('rp.rushDirection', 'is', null)
        : eb('rp.rushDirection', '=', direction);
    const bucketConditions = [
      ...sideConditions,
      directionEligible,
      directionCondition,
    ];
    const metricAlias = (name: string): string =>
      directionFieldName(prefix, direction, name);

    return [
      filteredCount(bucketConditions).as(metricAlias('carries')),
      eb.fn
        .coalesce(filteredSum(yardage, bucketConditions), eb.val(0))
        .as(metricAlias('yards')),
      eb.fn
        .coalesce(filteredAverage(yardage, bucketConditions), eb.val(0))
        .as(metricAlias('yardsPerCarry')),
      ...advancedMetricSelections(bucketConditions, metricAlias),
    ];
  };

  const selections = [
    count('attempts'),
    countColumn('rushingYardsAvailable'),
    aggregateColumn('sum', 'totalRushingYards'),
    aggregateColumn('avg', 'yardsPerCarry'),
    count('individualAttempts', [eb('roles.rusherId', 'is not', null)]),
    count('unattributedAttempts', [eb('roles.rusherId', 'is', null)]),
    count('sacks', [eb('rp.isSack', '=', true)]),
    count('kneels', [eb('rp.isKneel', '=', true)]),
    count('teamRushes', [eb('rp.isTeamRush', '=', true)]),
    count('multiCarrierAttempts', [
      eb('rp.attributionStatus', '=', 'multi_carrier'),
    ]),
    count('directionEligibleAttempts', [directionEligible]),
    count('directionAvailableAttempts', [
      directionEligible,
      eb('rp.rushDirection', 'is not', null),
    ]),
    ...advancedMetricSelections([...sideConditions, directionEligible], alias),
    ...directionBuckets.flatMap(directionSelections),
  ];

  if (includeTouchdowns) {
    selections.push(
      count('touchdownStatusAvailable', [
        eb('rp.isRushingTouchdown', 'is not', null),
      ]),
      count('rushingTouchdowns', [eb('rp.isRushingTouchdown', '=', true)]),
    );
  }

  return selections;
};

const numericValue = (row: AggregateRow, field: string): number =>
  Number(row[field]);

const nullableNumericValue = (
  row: AggregateRow,
  field: string,
): number | null => {
  const value = row[field];
  return value === null || value === undefined ? null : Number(value);
};

const round = (value: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

const mapAdvancedProduction = (
  value: (name: string) => number,
): AdvancedRushingProduction => ({
  successRate: round(value('successRate'), 3),
  ppa: round(value('ppa'), 3),
  totalPpa: round(value('totalPpa'), 3),
  lineYards: round(value('lineYards'), 1),
  lineYardsTotal: round(value('lineYardsTotal'), 1),
  secondLevelYards: round(value('secondLevelYards'), 1),
  secondLevelYardsTotal: round(value('secondLevelYardsTotal'), 1),
  openFieldYards: round(value('openFieldYards'), 1),
  openFieldYardsTotal: round(value('openFieldYardsTotal'), 1),
  stuffRate: round(value('stuffRate'), 3),
  powerSuccess: round(value('powerSuccess'), 3),
  explosiveness: round(value('explosiveness'), 3),
});

const mapDirectionProduction = (
  row: AggregateRow,
  prefix: string,
  direction: DirectionBucket,
): RushingDirectionProduction => {
  const value = (name: string): number =>
    numericValue(row, directionFieldName(prefix, direction, name));

  return {
    carries: value('carries'),
    yards: value('yards'),
    yardsPerCarry: round(value('yardsPerCarry'), 1),
    ...mapAdvancedProduction(value),
  };
};

const mapProduction = (row: AggregateRow, prefix = ''): RushingProduction => {
  const field = (name: string): string => fieldName(prefix, name);
  const rushingYardsAvailable = numericValue(
    row,
    field('rushingYardsAvailable'),
  );

  return {
    attempts: numericValue(row, field('attempts')),
    rushingYardsAvailable,
    totalRushingYards:
      rushingYardsAvailable === 0
        ? null
        : nullableNumericValue(row, field('totalRushingYards')),
    yardsPerCarry:
      rushingYardsAvailable === 0
        ? null
        : round(nullableNumericValue(row, field('yardsPerCarry')) ?? 0, 1),
    individualAttempts: numericValue(row, field('individualAttempts')),
    unattributedAttempts: numericValue(row, field('unattributedAttempts')),
    sacks: numericValue(row, field('sacks')),
    kneels: numericValue(row, field('kneels')),
    teamRushes: numericValue(row, field('teamRushes')),
    multiCarrierAttempts: numericValue(row, field('multiCarrierAttempts')),
    directionEligibleAttempts: numericValue(
      row,
      field('directionEligibleAttempts'),
    ),
    directionAvailableAttempts: numericValue(
      row,
      field('directionAvailableAttempts'),
    ),
    ...mapAdvancedProduction((name) => numericValue(row, field(name))),
    directions: {
      left: mapDirectionProduction(row, prefix, 'left'),
      middle: mapDirectionProduction(row, prefix, 'middle'),
      right: mapDirectionProduction(row, prefix, 'right'),
      unknown: mapDirectionProduction(row, prefix, 'unknown'),
    },
  };
};

const mapTeamProduction = (
  row: AggregateRow,
  prefix: 'offense' | 'defense',
): TeamRushingProduction => ({
  ...mapProduction(row, prefix),
  touchdownStatusAvailable: numericValue(
    row,
    fieldName(prefix, 'touchdownStatusAvailable'),
  ),
  rushingTouchdowns: numericValue(row, fieldName(prefix, 'rushingTouchdowns')),
});

export const getRushingPlays = async (
  gameId?: number,
  year?: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
  offense?: string,
  defense?: string,
  conference?: string,
  rusherId?: string,
  rushDirection?: RushDirection,
  directionAnalysisEligible?: boolean,
  attributionStatus?: RushAttributionStatus,
  isRushingTouchdown?: boolean,
  isSack?: boolean,
  isKneel?: boolean,
  isTeamRush?: boolean,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<RushingPlay[]> => {
  validateRushingPlayScope(gameId, year, week, team, rusherId);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('rushPlay as rp', 'rp.playId', 'play.id')
    .innerJoin('gameTeam as homeTeam', (join) =>
      join
        .onRef('homeTeam.gameId', '=', 'game.id')
        .on('homeTeam.homeAway', '=', 'home'),
    )
    .innerJoin('team as offenseTeam', 'play.offenseId', 'offenseTeam.id')
    .innerJoin('team as defenseTeam', 'play.defenseId', 'defenseTeam.id')
    .leftJoinLateral(guardedRusherRoles(), (join) => join.onTrue())
    .leftJoin('athlete as rusher', 'roles.rusherId', 'rusher.id')
    .leftJoin('conferenceTeam as offenseCt', (join) =>
      join
        .onRef('offenseTeam.id', '=', 'offenseCt.teamId')
        .onRef('offenseCt.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('offenseCt.endYear', '>=', eb.ref('game.season')),
            eb('offenseCt.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as offenseConference', (join) =>
      join.onRef('offenseCt.conferenceId', '=', 'offenseConference.id'),
    )
    .leftJoin('conferenceTeam as defenseCt', (join) =>
      join
        .onRef('defenseTeam.id', '=', 'defenseCt.teamId')
        .onRef('defenseCt.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('defenseCt.endYear', '>=', eb.ref('game.season')),
            eb('defenseCt.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as defenseConference', (join) =>
      join.onRef('defenseCt.conferenceId', '=', 'defenseConference.id'),
    )
    .select((eb) => [
      'game.id as gameId',
      'rp.playId',
      'drive.id as driveId',
      'game.season',
      'game.week',
      'game.seasonType',
      'play.offenseId',
      'offenseTeam.school as offense',
      'offenseConference.abbreviation as offenseConference',
      'play.defenseId',
      'defenseTeam.school as defense',
      'defenseConference.abbreviation as defenseConference',
      'play.period',
      'play.clock',
      'play.down',
      'play.distance',
      'play.playNumber',
      'play.playText',
      'play.yardLine as startYardline',
      eb
        .case()
        .when(eb('homeTeam.teamId', '=', eb.ref('play.offenseId')))
        .then(eb(eb.val(100), '-', eb.ref('play.yardLine')))
        .else(eb.ref('play.yardLine'))
        .end()
        .as('startYardsToGoal'),
      'roles.rusherId',
      'rusher.name as rusher',
      'rp.rushDirection',
      'rp.rushingYards',
      eb
        .case()
        .when(
          eb.and([
            eb('roles.rusherId', 'is not', null),
            eb('rp.parseStatus', '<>', 'invalid'),
          ]),
        )
        .then(eb.ref('rp.rushingYards'))
        .end()
        .as('rusherYards'),
      'rp.isRushingTouchdown',
      'rp.isSack',
      'rp.isKneel',
      'rp.isTeamRush',
      'rp.attributionStatus',
      eb
        .and([
          eb('rp.isSack', '=', false),
          eb('rp.isKneel', '=', false),
          eb('rp.isTeamRush', '=', false),
          eb('rp.parseStatus', '<>', 'invalid'),
        ])
        .as('directionAnalysisEligible'),
      'rp.parseStatus',
      'play.ppa',
      'play.success',
    ])
    .where('offenseConference.division', '=', classification)
    .orderBy('game.season', 'desc')
    .orderBy('game.week')
    .orderBy('game.id')
    .orderBy('play.period')
    .orderBy('play.playNumber')
    .orderBy('rp.playId');

  if (gameId !== undefined) {
    query = query.where('game.id', '=', gameId);
  }
  if (year !== undefined) {
    query = query.where('game.season', '=', year);
  }
  if (week !== undefined) {
    query = query.where('game.week', '=', week);
  }
  if (seasonType !== undefined && seasonType !== SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
  }
  if (team !== undefined) {
    const value = team.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['offenseTeam.school']), '=', value),
        eb(eb.fn('lower', ['offenseTeam.abbreviation']), '=', value),
        eb(eb.fn('lower', ['defenseTeam.school']), '=', value),
        eb(eb.fn('lower', ['defenseTeam.abbreviation']), '=', value),
      ]),
    );
  }
  if (offense !== undefined) {
    const value = offense.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['offenseTeam.school']), '=', value),
        eb(eb.fn('lower', ['offenseTeam.abbreviation']), '=', value),
      ]),
    );
  }
  if (defense !== undefined) {
    const value = defense.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['defenseTeam.school']), '=', value),
        eb(eb.fn('lower', ['defenseTeam.abbreviation']), '=', value),
      ]),
    );
  }
  if (conference !== undefined) {
    const value = conference.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['offenseConference.name']), '=', value),
        eb(eb.fn('lower', ['offenseConference.abbreviation']), '=', value),
        eb(eb.fn('lower', ['defenseConference.name']), '=', value),
        eb(eb.fn('lower', ['defenseConference.abbreviation']), '=', value),
      ]),
    );
  }
  if (rusherId !== undefined) {
    query = query.where('roles.rusherId', '=', rusherId);
  }
  if (rushDirection !== undefined) {
    query = query.where('rp.rushDirection', '=', rushDirection);
  }
  if (directionAnalysisEligible !== undefined) {
    query = query.where((eb) =>
      eb(
        eb.and([
          eb('rp.isSack', '=', false),
          eb('rp.isKneel', '=', false),
          eb('rp.isTeamRush', '=', false),
          eb('rp.parseStatus', '<>', 'invalid'),
        ]),
        '=',
        directionAnalysisEligible,
      ),
    );
  }
  if (attributionStatus !== undefined) {
    query = query.where('rp.attributionStatus', '=', attributionStatus);
  }
  if (isRushingTouchdown !== undefined) {
    query = query.where('rp.isRushingTouchdown', '=', isRushingTouchdown);
  }
  if (isSack !== undefined) {
    query = query.where('rp.isSack', '=', isSack);
  }
  if (isKneel !== undefined) {
    query = query.where('rp.isKneel', '=', isKneel);
  }
  if (isTeamRush !== undefined) {
    query = query.where('rp.isTeamRush', '=', isTeamRush);
  }

  const rows = await query.execute();

  return rows.map(
    (row): RushingPlay => ({
      gameId: row.gameId,
      playId: row.playId,
      driveId: row.driveId,
      season: row.season,
      week: row.week,
      seasonType: row.seasonType as SeasonType,
      offenseId: row.offenseId,
      offense: row.offense,
      offenseConference: row.offenseConference,
      defenseId: row.defenseId,
      defense: row.defense,
      defenseConference: row.defenseConference,
      period: row.period,
      clock: {
        minutes: row.clock?.minutes ?? 0,
        seconds: row.clock?.seconds ?? 0,
      },
      down: row.down,
      distance: row.distance,
      playText: row.playText,
      startYardline: row.startYardline,
      startYardsToGoal: row.startYardsToGoal,
      rusherId: row.rusherId,
      rusher: row.rusher,
      rushDirection: row.rushDirection as RushDirection | null,
      rushingYards: row.rushingYards,
      rusherYards: row.rusherYards,
      isRushingTouchdown: row.isRushingTouchdown,
      isSack: row.isSack,
      isKneel: row.isKneel,
      isTeamRush: row.isTeamRush,
      attributionStatus: row.attributionStatus as RushAttributionStatus,
      directionAnalysisEligible: row.directionAnalysisEligible as boolean,
      parseStatus: row.parseStatus as RushParseStatus,
      ppa: row.ppa === null ? null : Number(row.ppa),
      success: row.success,
    }),
  );
};

export const getPlayerRushingBySeason = async (
  year?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
  rusherId?: string,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<PlayerRushingSeason[]> => {
  validatePlayerRushingSeasonScope(year, rusherId);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('rushPlay as rp', 'rp.playId', 'play.id')
    .leftJoinLateral(guardedRusherRoles(), (join) => join.onTrue())
    .innerJoin('athlete as rusher', 'roles.rusherId', 'rusher.id')
    .innerJoin('team as offenseTeam', 'play.offenseId', 'offenseTeam.id')
    .leftJoin('conferenceTeam as offenseCt', (join) =>
      join
        .onRef('offenseTeam.id', '=', 'offenseCt.teamId')
        .onRef('offenseCt.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('offenseCt.endYear', '>=', eb.ref('game.season')),
            eb('offenseCt.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as offenseConference', (join) =>
      join.onRef('offenseCt.conferenceId', '=', 'offenseConference.id'),
    )
    .select([
      'game.season',
      'rusher.id as playerId',
      'rusher.name as player',
      'offenseTeam.school as team',
      'offenseConference.abbreviation as conference',
    ])
    .select(aggregateSelections('player'))
    .where('roles.rusherId', 'is not', null)
    .where('offenseConference.division', '=', classification)
    .groupBy([
      'game.season',
      'rusher.id',
      'rusher.name',
      'offenseTeam.school',
      'offenseConference.abbreviation',
    ])
    .orderBy('game.season', 'desc')
    .orderBy('offenseTeam.school')
    .orderBy('rusher.name');

  if (year !== undefined) {
    query = query.where('game.season', '=', year);
  }
  if (seasonType !== undefined && seasonType !== SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
  }
  if (team !== undefined) {
    const value = team.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['offenseTeam.school']), '=', value),
        eb(eb.fn('lower', ['offenseTeam.abbreviation']), '=', value),
      ]),
    );
  }
  if (conference !== undefined) {
    const value = conference.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['offenseConference.name']), '=', value),
        eb(eb.fn('lower', ['offenseConference.abbreviation']), '=', value),
      ]),
    );
  }
  if (rusherId !== undefined) {
    query = query.where('roles.rusherId', '=', rusherId);
  }

  const rows = await query.execute();

  return rows.map((row) => ({
    season: row.season,
    playerId: row.playerId,
    player: row.player,
    team: row.team,
    conference: row.conference,
    ...mapProduction(row),
  }));
};

export const getPlayerRushingByGame = async (
  year?: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
  rusherId?: string,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<PlayerRushingGame[]> => {
  validatePlayerRushingGameScope(year, week, team, rusherId);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('rushPlay as rp', 'rp.playId', 'play.id')
    .leftJoinLateral(guardedRusherRoles(), (join) => join.onTrue())
    .innerJoin('athlete as rusher', 'roles.rusherId', 'rusher.id')
    .innerJoin('team as offenseTeam', 'play.offenseId', 'offenseTeam.id')
    .innerJoin('team as defenseTeam', 'play.defenseId', 'defenseTeam.id')
    .leftJoin('conferenceTeam as offenseCt', (join) =>
      join
        .onRef('offenseTeam.id', '=', 'offenseCt.teamId')
        .onRef('offenseCt.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('offenseCt.endYear', '>=', eb.ref('game.season')),
            eb('offenseCt.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as offenseConference', (join) =>
      join.onRef('offenseCt.conferenceId', '=', 'offenseConference.id'),
    )
    .select([
      'game.id as gameId',
      'game.season',
      'game.week',
      'game.seasonType',
      'rusher.id as playerId',
      'rusher.name as player',
      'offenseTeam.school as team',
      'offenseConference.abbreviation as conference',
      'defenseTeam.school as opponent',
    ])
    .select(aggregateSelections('player'))
    .where('roles.rusherId', 'is not', null)
    .where('offenseConference.division', '=', classification)
    .groupBy([
      'game.id',
      'game.season',
      'game.week',
      'game.seasonType',
      'rusher.id',
      'rusher.name',
      'offenseTeam.school',
      'offenseConference.abbreviation',
      'defenseTeam.school',
    ])
    .orderBy('game.season', 'desc')
    .orderBy('game.week')
    .orderBy('game.id')
    .orderBy('offenseTeam.school')
    .orderBy('rusher.name');

  if (year !== undefined) {
    query = query.where('game.season', '=', year);
  }
  if (week !== undefined) {
    query = query.where('game.week', '=', week);
  }
  if (seasonType !== undefined && seasonType !== SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
  }
  if (team !== undefined) {
    const value = team.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['offenseTeam.school']), '=', value),
        eb(eb.fn('lower', ['offenseTeam.abbreviation']), '=', value),
      ]),
    );
  }
  if (conference !== undefined) {
    const value = conference.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['offenseConference.name']), '=', value),
        eb(eb.fn('lower', ['offenseConference.abbreviation']), '=', value),
      ]),
    );
  }
  if (rusherId !== undefined) {
    query = query.where('roles.rusherId', '=', rusherId);
  }

  const rows = await query.execute();

  return rows.map((row) => ({
    gameId: row.gameId,
    season: row.season,
    week: row.week,
    seasonType: row.seasonType as SeasonType,
    playerId: row.playerId,
    player: row.player,
    team: row.team,
    conference: row.conference,
    opponent: row.opponent,
    ...mapProduction(row),
  }));
};

export const getTeamRushingBySeason = async (
  year?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<TeamRushingSeason[]> => {
  validateTeamRushingSeasonScope(year, team);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('rushPlay as rp', 'rp.playId', 'play.id')
    .leftJoinLateral(guardedRusherRoles(), (join) => join.onTrue())
    .innerJoin('gameTeam as representedGt', 'game.id', 'representedGt.gameId')
    .innerJoin(
      'team as representedTeam',
      'representedGt.teamId',
      'representedTeam.id',
    )
    .leftJoin('conferenceTeam as representedCt', (join) =>
      join
        .onRef('representedTeam.id', '=', 'representedCt.teamId')
        .onRef('representedCt.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('representedCt.endYear', '>=', eb.ref('game.season')),
            eb('representedCt.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as representedConference', (join) =>
      join.onRef('representedCt.conferenceId', '=', 'representedConference.id'),
    )
    .where((eb) =>
      eb.or([
        eb('play.offenseId', '=', eb.ref('representedTeam.id')),
        eb('play.defenseId', '=', eb.ref('representedTeam.id')),
      ]),
    )
    .where('representedConference.division', '=', classification)
    .select([
      'game.season',
      'representedTeam.school as team',
      'representedConference.abbreviation as conference',
    ])
    .select([
      ...aggregateSelections('team', 'offense', 'offense', true),
      ...aggregateSelections('team', 'defense', 'defense', true),
    ])
    .groupBy([
      'game.season',
      'representedTeam.school',
      'representedConference.abbreviation',
    ])
    .orderBy('game.season', 'desc')
    .orderBy('representedTeam.school');

  if (year !== undefined) {
    query = query.where('game.season', '=', year);
  }
  if (seasonType !== undefined && seasonType !== SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
  }
  if (team !== undefined) {
    const value = team.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['representedTeam.school']), '=', value),
        eb(eb.fn('lower', ['representedTeam.abbreviation']), '=', value),
      ]),
    );
  }
  if (conference !== undefined) {
    const value = conference.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['representedConference.name']), '=', value),
        eb(eb.fn('lower', ['representedConference.abbreviation']), '=', value),
      ]),
    );
  }

  const rows = await query.execute();

  return rows.map((row) => ({
    season: row.season,
    team: row.team,
    conference: row.conference,
    offense: mapTeamProduction(row, 'offense'),
    defense: mapTeamProduction(row, 'defense'),
  }));
};

export const getTeamRushingByGame = async (
  year?: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<TeamRushingGame[]> => {
  validateTeamRushingGameScope(year, week, team);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('rushPlay as rp', 'rp.playId', 'play.id')
    .leftJoinLateral(guardedRusherRoles(), (join) => join.onTrue())
    .innerJoin('gameTeam as representedGt', 'game.id', 'representedGt.gameId')
    .innerJoin(
      'team as representedTeam',
      'representedGt.teamId',
      'representedTeam.id',
    )
    .innerJoin('gameTeam as opponentGt', (join) =>
      join
        .onRef('game.id', '=', 'opponentGt.gameId')
        .onRef('representedGt.id', '<>', 'opponentGt.id'),
    )
    .innerJoin('team as opponentTeam', 'opponentGt.teamId', 'opponentTeam.id')
    .leftJoin('conferenceTeam as representedCt', (join) =>
      join
        .onRef('representedTeam.id', '=', 'representedCt.teamId')
        .onRef('representedCt.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('representedCt.endYear', '>=', eb.ref('game.season')),
            eb('representedCt.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as representedConference', (join) =>
      join.onRef('representedCt.conferenceId', '=', 'representedConference.id'),
    )
    .where((eb) =>
      eb.or([
        eb('play.offenseId', '=', eb.ref('representedTeam.id')),
        eb('play.defenseId', '=', eb.ref('representedTeam.id')),
      ]),
    )
    .where('representedConference.division', '=', classification)
    .select([
      'game.id as gameId',
      'game.season',
      'game.week',
      'game.seasonType',
      'representedTeam.school as team',
      'representedConference.abbreviation as conference',
      'opponentTeam.school as opponent',
    ])
    .select([
      ...aggregateSelections('team', 'offense', 'offense', true),
      ...aggregateSelections('team', 'defense', 'defense', true),
    ])
    .groupBy([
      'game.id',
      'game.season',
      'game.week',
      'game.seasonType',
      'representedTeam.school',
      'representedConference.abbreviation',
      'opponentTeam.school',
    ])
    .orderBy('game.season', 'desc')
    .orderBy('game.week')
    .orderBy('game.id')
    .orderBy('representedTeam.school');

  if (year !== undefined) {
    query = query.where('game.season', '=', year);
  }
  if (week !== undefined) {
    query = query.where('game.week', '=', week);
  }
  if (seasonType !== undefined && seasonType !== SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
  }
  if (team !== undefined) {
    const value = team.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['representedTeam.school']), '=', value),
        eb(eb.fn('lower', ['representedTeam.abbreviation']), '=', value),
      ]),
    );
  }
  if (conference !== undefined) {
    const value = conference.toLowerCase();
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['representedConference.name']), '=', value),
        eb(eb.fn('lower', ['representedConference.abbreviation']), '=', value),
      ]),
    );
  }

  const rows = await query.execute();

  return rows.map((row) => ({
    gameId: row.gameId,
    season: row.season,
    week: row.week,
    seasonType: row.seasonType as SeasonType,
    team: row.team,
    conference: row.conference,
    opponent: row.opponent,
    offense: mapTeamProduction(row, 'offense'),
    defense: mapTeamProduction(row, 'defense'),
  }));
};

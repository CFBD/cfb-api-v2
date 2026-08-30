import { expressionBuilder } from 'kysely';
import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import type { DB } from '../../config/types/db';
import { DivisionClassification, SeasonType } from '../enums';
import {
  PassDepth,
  PassDirection,
  PassLocation,
  PassOutcome,
  PassParseStatus,
  PassingPlay,
  PassingProduction,
  PlayerPassingGame,
  PlayerPassingSeason,
  TeamPassingGame,
  TeamPassingSeason,
} from './types';

type AggregateRow = Record<string, unknown>;

interface PassingAggregateTables {
  pp: DB['passPlay'];
  play: DB['play'];
  representedTeam: DB['team'];
}

const validatePassingTeamWeekScope = (
  year?: number,
  week?: number,
  team?: string,
): void => {
  if (year === undefined) {
    throw new ValidateError(
      {
        year: {
          value: year,
          message: 'year is required',
        },
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

const validatePlayerPassingSeasonScope = (
  year?: number,
  passerId?: string,
): void => {
  if (year === undefined && passerId === undefined) {
    throw new ValidateError(
      {
        year: {
          value: year,
          message: 'year required when passerId not specified',
        },
        passerId: {
          value: passerId,
          message: 'passerId required when year not specified',
        },
      },
      'Validation error',
    );
  }
};

const validatePlayerPassingGameScope = (
  year?: number,
  week?: number,
  team?: string,
  passerId?: string,
): void => {
  if (year === undefined) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year is required' },
      },
      'Validation error',
    );
  }

  if (passerId === undefined && team === undefined && week === undefined) {
    throw new ValidateError(
      {
        passerId: {
          value: passerId,
          message: 'passerId, team, or week is required',
        },
        team: { value: team, message: 'passerId, team, or week is required' },
        week: { value: week, message: 'passerId, team, or week is required' },
      },
      'Validation error',
    );
  }
};

const validateTeamPassingSeasonScope = (year?: number, team?: string): void => {
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

const aggregateSelections = () => {
  const eb = expressionBuilder<PassingAggregateTables, 'pp' | 'play'>();
  const cpoeEligible = eb.and([
    eb('pp.parseStatus', '=', 'complete'),
    eb('pp.airYards', 'is not', null),
    eb('pp.isSpike', '=', false),
    eb('pp.isThrowaway', '=', false),
    eb('pp.isIntentionalGrounding', '=', false),
  ]);
  const totalYards = eb
    .case()
    .when(
      eb.and([
        eb('pp.outcome', '=', 'completion'),
        eb('pp.parseStatus', '<>', 'invalid'),
      ]),
    )
    .then(eb.ref('play.yardsGained'))
    .when('pp.outcome', 'in', ['incompletion', 'interception'])
    .then(0)
    .end();
  const yardsAfterCatch = eb
    .case()
    .when(
      eb.and([
        eb('pp.outcome', '=', 'completion'),
        eb('pp.parseStatus', '<>', 'invalid'),
        eb('pp.airYards', 'is not', null),
      ]),
    )
    .then(eb(eb.ref('play.yardsGained'), '-', eb.ref('pp.airYards')))
    .end();

  return [
    eb.fn.countAll<number>().as('attempts'),
    eb.fn
      .countAll<number>()
      .filterWhere('pp.outcome', '=', 'completion')
      .as('completions'),
    eb.fn
      .countAll<number>()
      .filterWhere('pp.outcome', '=', 'incompletion')
      .as('incompletions'),
    eb.fn
      .countAll<number>()
      .filterWhere('pp.outcome', '=', 'interception')
      .as('interceptions'),
    eb.fn
      .countAll<number>()
      .filterWhere(cpoeEligible)
      .as('cpoeEligibleAttempts'),
    eb.fn.count<number>('pp.airYards').as('airYardsAttemptsAvailable'),
    eb.fn.sum<number | string | null>('pp.airYards').as('totalAirYards'),
    eb.fn.avg<number | string | null>('pp.airYards').as('averageDepthOfTarget'),
    eb.fn.count<number>(totalYards).as('totalYardsAttemptsAvailable'),
    eb.fn.sum<number | string | null>(totalYards).as('totalYards'),
    eb.fn.count<number>(yardsAfterCatch).as('yardsAfterCatchAttemptsAvailable'),
    eb.fn
      .sum<number | string | null>(yardsAfterCatch)
      .as('totalYardsAfterCatch'),
    eb.fn
      .avg<number | string | null>(yardsAfterCatch)
      .as('averageYardsAfterCatch'),
  ];
};

const teamAggregateSelections = () => {
  const eb = expressionBuilder<
    PassingAggregateTables,
    'pp' | 'play' | 'representedTeam'
  >();
  const offense = eb('play.offenseId', '=', eb.ref('representedTeam.id'));
  const defense = eb('play.defenseId', '=', eb.ref('representedTeam.id'));
  const cpoeEligible = eb.and([
    eb('pp.parseStatus', '=', 'complete'),
    eb('pp.airYards', 'is not', null),
    eb('pp.isSpike', '=', false),
    eb('pp.isThrowaway', '=', false),
    eb('pp.isIntentionalGrounding', '=', false),
  ]);
  const totalYards = eb
    .case()
    .when(
      eb.and([
        eb('pp.outcome', '=', 'completion'),
        eb('pp.parseStatus', '<>', 'invalid'),
      ]),
    )
    .then(eb.ref('play.yardsGained'))
    .when('pp.outcome', 'in', ['incompletion', 'interception'])
    .then(0)
    .end();
  const yardsAfterCatch = eb
    .case()
    .when(
      eb.and([
        eb('pp.outcome', '=', 'completion'),
        eb('pp.parseStatus', '<>', 'invalid'),
        eb('pp.airYards', 'is not', null),
      ]),
    )
    .then(eb(eb.ref('play.yardsGained'), '-', eb.ref('pp.airYards')))
    .end();

  return [
    eb.fn.countAll<number>().filterWhere(offense).as('offenseAttempts'),
    eb.fn
      .countAll<number>()
      .filterWhere(offense)
      .filterWhere('pp.outcome', '=', 'completion')
      .as('offenseCompletions'),
    eb.fn
      .countAll<number>()
      .filterWhere(offense)
      .filterWhere('pp.outcome', '=', 'incompletion')
      .as('offenseIncompletions'),
    eb.fn
      .countAll<number>()
      .filterWhere(offense)
      .filterWhere('pp.outcome', '=', 'interception')
      .as('offenseInterceptions'),
    eb.fn
      .countAll<number>()
      .filterWhere(offense)
      .filterWhere(cpoeEligible)
      .as('offenseCpoeEligibleAttempts'),
    eb.fn
      .count<number>('pp.airYards')
      .filterWhere(offense)
      .as('offenseAirYardsAttemptsAvailable'),
    eb.fn
      .sum<number | string | null>('pp.airYards')
      .filterWhere(offense)
      .as('offenseTotalAirYards'),
    eb.fn
      .avg<number | string | null>('pp.airYards')
      .filterWhere(offense)
      .as('offenseAverageDepthOfTarget'),
    eb.fn
      .count<number>(totalYards)
      .filterWhere(offense)
      .as('offenseTotalYardsAttemptsAvailable'),
    eb.fn
      .sum<number | string | null>(totalYards)
      .filterWhere(offense)
      .as('offenseTotalYards'),
    eb.fn
      .count<number>(yardsAfterCatch)
      .filterWhere(offense)
      .as('offenseYardsAfterCatchAttemptsAvailable'),
    eb.fn
      .sum<number | string | null>(yardsAfterCatch)
      .filterWhere(offense)
      .as('offenseTotalYardsAfterCatch'),
    eb.fn
      .avg<number | string | null>(yardsAfterCatch)
      .filterWhere(offense)
      .as('offenseAverageYardsAfterCatch'),
    eb.fn.countAll<number>().filterWhere(defense).as('defenseAttempts'),
    eb.fn
      .countAll<number>()
      .filterWhere(defense)
      .filterWhere('pp.outcome', '=', 'completion')
      .as('defenseCompletions'),
    eb.fn
      .countAll<number>()
      .filterWhere(defense)
      .filterWhere('pp.outcome', '=', 'incompletion')
      .as('defenseIncompletions'),
    eb.fn
      .countAll<number>()
      .filterWhere(defense)
      .filterWhere('pp.outcome', '=', 'interception')
      .as('defenseInterceptions'),
    eb.fn
      .countAll<number>()
      .filterWhere(defense)
      .filterWhere(cpoeEligible)
      .as('defenseCpoeEligibleAttempts'),
    eb.fn
      .count<number>('pp.airYards')
      .filterWhere(defense)
      .as('defenseAirYardsAttemptsAvailable'),
    eb.fn
      .sum<number | string | null>('pp.airYards')
      .filterWhere(defense)
      .as('defenseTotalAirYards'),
    eb.fn
      .avg<number | string | null>('pp.airYards')
      .filterWhere(defense)
      .as('defenseAverageDepthOfTarget'),
    eb.fn
      .count<number>(totalYards)
      .filterWhere(defense)
      .as('defenseTotalYardsAttemptsAvailable'),
    eb.fn
      .sum<number | string | null>(totalYards)
      .filterWhere(defense)
      .as('defenseTotalYards'),
    eb.fn
      .count<number>(yardsAfterCatch)
      .filterWhere(defense)
      .as('defenseYardsAfterCatchAttemptsAvailable'),
    eb.fn
      .sum<number | string | null>(yardsAfterCatch)
      .filterWhere(defense)
      .as('defenseTotalYardsAfterCatch'),
    eb.fn
      .avg<number | string | null>(yardsAfterCatch)
      .filterWhere(defense)
      .as('defenseAverageYardsAfterCatch'),
  ];
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

const mapProduction = (row: AggregateRow, prefix = ''): PassingProduction => {
  const field = (name: string): string =>
    prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
  const attempts = numericValue(row, field('attempts'));
  const completions = numericValue(row, field('completions'));
  const airYardsAttemptsAvailable = numericValue(
    row,
    field('airYardsAttemptsAvailable'),
  );
  const totalYardsAttemptsAvailable = numericValue(
    row,
    field('totalYardsAttemptsAvailable'),
  );
  const yardsAfterCatchAttemptsAvailable = numericValue(
    row,
    field('yardsAfterCatchAttemptsAvailable'),
  );

  return {
    attempts,
    completions,
    incompletions: numericValue(row, field('incompletions')),
    interceptions: numericValue(row, field('interceptions')),
    completionRate: attempts === 0 ? null : round(completions / attempts, 3),
    // cpoeEligibleAttempts: numericValue(row, field('cpoeEligibleAttempts')),
    airYardsAttemptsAvailable,
    totalAirYards:
      airYardsAttemptsAvailable === 0
        ? null
        : nullableNumericValue(row, field('totalAirYards')),
    averageDepthOfTarget:
      airYardsAttemptsAvailable === 0
        ? null
        : round(
            nullableNumericValue(row, field('averageDepthOfTarget')) ?? 0,
            1,
          ),
    totalYardsAttemptsAvailable,
    totalYards:
      totalYardsAttemptsAvailable === 0
        ? null
        : nullableNumericValue(row, field('totalYards')),
    yardsAfterCatchAttemptsAvailable,
    totalYardsAfterCatch:
      yardsAfterCatchAttemptsAvailable === 0
        ? null
        : nullableNumericValue(row, field('totalYardsAfterCatch')),
    averageYardsAfterCatch:
      yardsAfterCatchAttemptsAvailable === 0
        ? null
        : round(
            nullableNumericValue(row, field('averageYardsAfterCatch')) ?? 0,
            1,
          ),
  };
};

export const getPassingPlays = async (
  gameId?: number,
  year?: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
  offense?: string,
  defense?: string,
  conference?: string,
  passerId?: string,
  targetId?: string,
  outcome?: PassOutcome,
  // cpoeEligible?: boolean,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<PassingPlay[]> => {
  validatePassingTeamWeekScope(year, week, team);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('passPlay as pp', 'pp.playId', 'play.id')
    .innerJoin('gameTeam as homeTeam', (join) =>
      join
        .onRef('homeTeam.gameId', '=', 'game.id')
        .on('homeTeam.homeAway', '=', 'home'),
    )
    .innerJoin('team as offenseTeam', 'play.offenseId', 'offenseTeam.id')
    .innerJoin('team as defenseTeam', 'play.defenseId', 'defenseTeam.id')
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('playStat as ps')
          .select((roleEb) => {
            const passerStat = roleEb.or([
              roleEb.and([
                roleEb('pp.outcome', '=', 'completion'),
                roleEb('ps.statTypeId', '=', 4),
              ]),
              roleEb.and([
                roleEb('pp.outcome', '=', 'incompletion'),
                roleEb('ps.statTypeId', '=', 1),
              ]),
              roleEb.and([
                roleEb('pp.outcome', '=', 'interception'),
                roleEb('ps.statTypeId', '=', 20),
              ]),
            ]);
            const targetStat = roleEb.or([
              roleEb.and([
                roleEb('pp.outcome', '=', 'completion'),
                roleEb('ps.statTypeId', '=', 5),
              ]),
              roleEb.and([
                roleEb('pp.outcome', '=', 'incompletion'),
                roleEb('ps.statTypeId', '=', 2),
              ]),
            ]);
            const passerCount = roleEb.fn
              .count<number>('ps.athleteId')
              .distinct()
              .filterWhere(passerStat);
            const targetCount = roleEb.fn
              .count<number>('ps.athleteId')
              .distinct()
              .filterWhere(targetStat);

            return [
              roleEb
                .case()
                .when(roleEb(passerCount, '=', 1))
                .then(
                  roleEb.fn.min<string>('ps.athleteId').filterWhere(passerStat),
                )
                .end()
                .as('passerId'),
              roleEb
                .case()
                .when(
                  roleEb.and([
                    roleEb('pp.outcome', '<>', 'interception'),
                    roleEb(targetCount, '=', 1),
                  ]),
                )
                .then(
                  roleEb.fn.min<string>('ps.athleteId').filterWhere(targetStat),
                )
                .end()
                .as('targetId'),
            ];
          })
          .whereRef('ps.playId', '=', 'pp.playId')
          .as('roles'),
      (join) => join.onTrue(),
    )
    .leftJoin('athlete as passer', 'roles.passerId', 'passer.id')
    .leftJoin('athlete as target', 'roles.targetId', 'target.id')
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
      'pp.playId',
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
      'roles.passerId',
      'passer.name as passer',
      'roles.targetId',
      'target.name as target',
      'pp.outcome',
      'pp.airYards',
      'pp.passDepth',
      'pp.passDirection',
      eb
        .case()
        .when(
          eb.and([
            eb('pp.passDepth', 'is not', null),
            eb('pp.passDirection', 'is not', null),
          ]),
        )
        .then(
          eb.fn<string>('concat', [
            'pp.passDepth',
            eb.cast<string>(eb.val(' '), 'text'),
            'pp.passDirection',
          ]),
        )
        .end()
        .as('passLocation'),
      eb
        .case()
        .when(
          eb.and([
            eb('pp.outcome', '=', 'completion'),
            eb('pp.parseStatus', '<>', 'invalid'),
          ]),
        )
        .then(eb.ref('play.yardsGained'))
        .when('pp.outcome', 'in', ['incompletion', 'interception'])
        .then(0)
        .end()
        .as('totalYards'),
      eb
        .case()
        .when(
          eb.and([
            eb('pp.outcome', '=', 'completion'),
            eb('pp.parseStatus', '<>', 'invalid'),
            eb('pp.airYards', 'is not', null),
          ]),
        )
        .then(eb(eb.ref('play.yardsGained'), '-', eb.ref('pp.airYards')))
        .end()
        .as('yardsAfterCatch'),
      'play.yardLine as startYardline',
      eb
        .case()
        .when(eb('homeTeam.teamId', '=', eb.ref('play.offenseId')))
        .then(eb(eb.val(100), '-', eb.ref('play.yardLine')))
        .else(eb.ref('play.yardLine'))
        .end()
        .as('startYardsToGoal'),
      'pp.targetYardsToGoal',
      'pp.isSpike',
      'pp.isThrowaway',
      'pp.isIntentionalGrounding',
      eb
        .cast<boolean>(
          eb.and([
            eb('pp.parseStatus', '=', 'complete'),
            eb('pp.airYards', 'is not', null),
            eb('pp.isSpike', '=', false),
            eb('pp.isThrowaway', '=', false),
            eb('pp.isIntentionalGrounding', '=', false),
          ]),
          'boolean',
        )
        .as('cpoeEligible'),
      'pp.parseStatus',
    ])
    .where('offenseConference.division', '=', classification)
    .orderBy('game.season', 'desc')
    .orderBy('game.week')
    .orderBy('game.id')
    .orderBy('play.period')
    .orderBy('play.playNumber')
    .orderBy('pp.playId');

  if (gameId !== undefined) {
    query = query.where('game.id', '=', gameId);
  }
  if (year !== undefined) {
    query = query.where('game.season', '=', year);
  }
  if (week !== undefined) {
    query = query.where('game.week', '=', week);
  }
  if (seasonType && seasonType !== SeasonType.Both) {
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
  if (passerId !== undefined) {
    query = query.where('roles.passerId', '=', passerId);
  }
  if (targetId !== undefined) {
    query = query.where('roles.targetId', '=', targetId);
  }
  if (outcome !== undefined) {
    query = query.where('pp.outcome', '=', outcome);
  }
  // if (cpoeEligible !== undefined) {
  //   query = query.where((eb) =>
  //     eb(
  //       eb.and([
  //         eb('pp.parseStatus', '=', 'complete'),
  //         eb('pp.airYards', 'is not', null),
  //         eb('pp.isSpike', '=', false),
  //         eb('pp.isThrowaway', '=', false),
  //         eb('pp.isIntentionalGrounding', '=', false),
  //       ]),
  //       '=',
  //       cpoeEligible,
  //     ),
  //   );
  // }

  const rows = await query.execute();

  return rows.map(
    (row): PassingPlay => ({
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
      passerId: row.passerId,
      passer: row.passer,
      targetId: row.targetId,
      target: row.target,
      outcome: row.outcome as PassOutcome,
      airYards: row.airYards,
      passDepth: row.passDepth as PassDepth | null,
      passDirection: row.passDirection as PassDirection | null,
      passLocation: row.passLocation as PassLocation | null,
      totalYards: row.totalYards,
      yardsAfterCatch: row.yardsAfterCatch,
      startYardline: row.startYardline,
      startYardsToGoal: row.startYardsToGoal,
      targetYardsToGoal: row.targetYardsToGoal,
      isSpike: row.isSpike,
      isThrowaway: row.isThrowaway,
      isIntentionalGrounding: row.isIntentionalGrounding,
      // cpoeEligible: row.cpoeEligible,
      parseStatus: row.parseStatus as PassParseStatus,
    }),
  );
};

export const getPlayerPassingBySeason = async (
  year?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
  passerId?: string,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<PlayerPassingSeason[]> => {
  validatePlayerPassingSeasonScope(year, passerId);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('passPlay as pp', 'pp.playId', 'play.id')
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('playStat as ps')
          .select((roleEb) => {
            const passerStat = roleEb.or([
              roleEb.and([
                roleEb('pp.outcome', '=', 'completion'),
                roleEb('ps.statTypeId', '=', 4),
              ]),
              roleEb.and([
                roleEb('pp.outcome', '=', 'incompletion'),
                roleEb('ps.statTypeId', '=', 1),
              ]),
              roleEb.and([
                roleEb('pp.outcome', '=', 'interception'),
                roleEb('ps.statTypeId', '=', 20),
              ]),
            ]);
            const passerCount = roleEb.fn
              .count<number>('ps.athleteId')
              .distinct()
              .filterWhere(passerStat);

            return roleEb
              .case()
              .when(roleEb(passerCount, '=', 1))
              .then(
                roleEb.fn.min<string>('ps.athleteId').filterWhere(passerStat),
              )
              .end()
              .as('passerId');
          })
          .whereRef('ps.playId', '=', 'pp.playId')
          .as('roles'),
      (join) => join.onTrue(),
    )
    .innerJoin('athlete as passer', 'roles.passerId', 'passer.id')
    .innerJoin('team as offenseTeam', 'play.offenseId', 'offenseTeam.id')
    .leftJoin('conferenceTeam as offenseCt', (join) =>
      join
        .onRef('offenseTeam.id', '=', 'offenseCt.teamId')
        .on((eb) =>
          eb('offenseCt.startYear', '<=', year ?? eb.ref('game.season')),
        )
        .on((eb) =>
          eb.or([
            eb('offenseCt.endYear', '>=', year ?? eb.ref('game.season')),
            eb('offenseCt.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as offenseConference', (join) =>
      join.onRef('offenseCt.conferenceId', '=', 'offenseConference.id'),
    )
    .select([
      'game.season',
      'passer.id as playerId',
      'passer.name as player',
      'offenseTeam.school as team',
      'offenseConference.abbreviation as conference',
    ])
    .select(aggregateSelections())
    .where('offenseConference.division', '=', classification)
    .groupBy([
      'game.season',
      'passer.id',
      'passer.name',
      'offenseTeam.school',
      'offenseConference.abbreviation',
    ])
    .orderBy('game.season', 'desc')
    .orderBy('offenseTeam.school')
    .orderBy('passer.name');

  if (year !== undefined) {
    query = query.where('game.season', '=', year);
  }
  if (seasonType && seasonType !== SeasonType.Both) {
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
  if (passerId !== undefined) {
    query = query.where('roles.passerId', '=', passerId);
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

export const getPlayerPassingByGame = async (
  year?: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
  passerId?: string,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<PlayerPassingGame[]> => {
  validatePlayerPassingGameScope(year, week, team, passerId);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('passPlay as pp', 'pp.playId', 'play.id')
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('playStat as ps')
          .select((roleEb) => {
            const passerStat = roleEb.or([
              roleEb.and([
                roleEb('pp.outcome', '=', 'completion'),
                roleEb('ps.statTypeId', '=', 4),
              ]),
              roleEb.and([
                roleEb('pp.outcome', '=', 'incompletion'),
                roleEb('ps.statTypeId', '=', 1),
              ]),
              roleEb.and([
                roleEb('pp.outcome', '=', 'interception'),
                roleEb('ps.statTypeId', '=', 20),
              ]),
            ]);
            const passerCount = roleEb.fn
              .count<number>('ps.athleteId')
              .distinct()
              .filterWhere(passerStat);

            return roleEb
              .case()
              .when(roleEb(passerCount, '=', 1))
              .then(
                roleEb.fn.min<string>('ps.athleteId').filterWhere(passerStat),
              )
              .end()
              .as('passerId');
          })
          .whereRef('ps.playId', '=', 'pp.playId')
          .as('roles'),
      (join) => join.onTrue(),
    )
    .innerJoin('athlete as passer', 'roles.passerId', 'passer.id')
    .innerJoin('team as offenseTeam', 'play.offenseId', 'offenseTeam.id')
    .leftJoin('conferenceTeam as offenseCt', (join) =>
      join
        .onRef('offenseTeam.id', '=', 'offenseCt.teamId')
        .on((eb) =>
          eb('offenseCt.startYear', '<=', year ?? eb.ref('game.season')),
        )
        .on((eb) =>
          eb.or([
            eb('offenseCt.endYear', '>=', year ?? eb.ref('game.season')),
            eb('offenseCt.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as offenseConference', (join) =>
      join.onRef('offenseCt.conferenceId', '=', 'offenseConference.id'),
    )
    .innerJoin('team as defenseTeam', 'play.defenseId', 'defenseTeam.id')
    .select([
      'game.id as gameId',
      'game.season',
      'game.week',
      'game.seasonType',
      'passer.id as playerId',
      'passer.name as player',
      'offenseTeam.school as team',
      'offenseConference.abbreviation as conference',
      'defenseTeam.school as opponent',
    ])
    .select(aggregateSelections())
    .where('offenseConference.division', '=', classification)
    .groupBy([
      'game.id',
      'game.season',
      'game.week',
      'game.seasonType',
      'passer.id',
      'passer.name',
      'offenseTeam.school',
      'offenseConference.abbreviation',
      'defenseTeam.school',
    ])
    .orderBy('game.season', 'desc')
    .orderBy('game.week')
    .orderBy('game.id')
    .orderBy('offenseTeam.school')
    .orderBy('passer.name');

  if (year !== undefined) {
    query = query.where('game.season', '=', year);
  }
  if (week !== undefined) {
    query = query.where('game.week', '=', week);
  }
  if (seasonType && seasonType !== SeasonType.Both) {
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
  if (passerId !== undefined) {
    query = query.where('roles.passerId', '=', passerId);
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

export const getTeamPassingBySeason = async (
  year?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<TeamPassingSeason[]> => {
  validateTeamPassingSeasonScope(year, team);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('passPlay as pp', 'pp.playId', 'play.id')
    .innerJoin('gameTeam as representedGt', 'game.id', 'representedGt.gameId')
    .innerJoin(
      'team as representedTeam',
      'representedGt.teamId',
      'representedTeam.id',
    )
    .leftJoin('conferenceTeam as representedCt', (join) =>
      join
        .onRef('representedTeam.id', '=', 'representedCt.teamId')
        .on((eb) =>
          eb('representedCt.startYear', '<=', year ?? eb.ref('game.season')),
        )
        .on((eb) =>
          eb.or([
            eb('representedCt.endYear', '>=', year ?? eb.ref('game.season')),
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
    .select(teamAggregateSelections())
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
  if (seasonType && seasonType !== SeasonType.Both) {
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
    offense: mapProduction(row, 'offense'),
    defense: mapProduction(row, 'defense'),
  }));
};

export const getTeamPassingByGame = async (
  year?: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
  classification: DivisionClassification = DivisionClassification.FBS,
): Promise<TeamPassingGame[]> => {
  validatePassingTeamWeekScope(year, week, team);

  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'drive.gameId', 'game.id')
    .innerJoin('play', 'play.driveId', 'drive.id')
    .innerJoin('passPlay as pp', 'pp.playId', 'play.id')
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
        .on((eb) =>
          eb('representedCt.startYear', '<=', year ?? eb.ref('game.season')),
        )
        .on((eb) =>
          eb.or([
            eb('representedCt.endYear', '>=', year ?? eb.ref('game.season')),
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
    .select(teamAggregateSelections())
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
  if (seasonType && seasonType !== SeasonType.Both) {
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
    offense: mapProduction(row, 'offense'),
    defense: mapProduction(row, 'defense'),
  }));
};

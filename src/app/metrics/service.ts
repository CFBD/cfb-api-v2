import { ValidateError } from 'tsoa';
import gaussian from 'gaussian';
import { kdb } from '../../config/database';
import {
  PlayerSeasonPredictedPointsAdded,
  PlayerGamePredictedPointsAdded,
  PredictedPointsValue,
  TeamGamePredictedPointsAdded,
  TeamSeasonPredictedPointsAdded,
  PregameWinProbability,
  FieldGoalEP,
  PlayWinProbability,
} from './types';
import { PASS_PLAY_TYPES, RUSH_PLAY_TYPES } from '../../globals';
import { SeasonType } from '../enums';
import { SelectQueryBuilder, sql } from 'kysely';
import { DB, PlayerUsageStats } from 'src/config/types/db';

export const getPredictedPoints = async (
  down: number,
  distance: number,
): Promise<PredictedPointsValue[]> => {
  const results = await kdb
    .selectFrom('ppa')
    .where('down', '=', down)
    .where('distance', '=', distance)
    .orderBy('yardLine')
    .select(['yardLine', 'predictedPoints'])
    .execute();

  return results.map((r) => ({
    yardLine: 100 - r.yardLine,
    predictedPoints: Math.round(Number(r.predictedPoints) * 100) / 100,
  }));
};

export const getPredictedPointsAddedByTeam = async (
  year?: number,
  team?: string,
  conference?: string,
  excludeGarbageTime?: boolean,
): Promise<TeamSeasonPredictedPointsAdded[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  let query = kdb
    .selectFrom('game')
    .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
    .innerJoin('team', 'gameTeam.teamId', 'team.id')
    .innerJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .onRef('conferenceTeam.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', '>=', eb.ref('game.season')),
            eb('conferenceTeam.endYear', 'is', null),
          ]),
        ),
    )
    .innerJoin('conference', (join) =>
      join
        .onRef('conference.id', '=', 'conferenceTeam.conferenceId')
        .on('conference.division', '=', 'fbs'),
    )
    .innerJoin('drive', 'game.id', 'drive.gameId')
    .innerJoin('play', (join) =>
      join
        .onRef('drive.id', '=', 'play.driveId')
        .on('play.ppa', 'is not', null)
        .on((eb) =>
          eb.or([
            eb('play.offenseId', '=', eb.ref('team.id')),
            eb('play.defenseId', '=', eb.ref('team.id')),
          ]),
        ),
    )
    .groupBy(['game.season', 'team.school', 'conference.name'])
    .orderBy('game.season desc')
    .orderBy('team.school')
    .select(['game.season', 'team.school', 'conference.name as conference'])
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .as('offensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', PASS_PLAY_TYPES))
        .as('passingOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', RUSH_PLAY_TYPES))
        .as('rushingOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .sum('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .as('offensePpaCum'),
    )
    .select((eb) =>
      eb.fn
        .sum('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', PASS_PLAY_TYPES))
        .as('passingOffensePpaCum'),
    )
    .select((eb) =>
      eb.fn
        .sum('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', RUSH_PLAY_TYPES))
        .as('rushingOffensePpaCum'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 1)
        .as('firstOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 2)
        .as('secondOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 3)
        .as('thirdOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .as('defensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', PASS_PLAY_TYPES))
        .as('passingDefensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', RUSH_PLAY_TYPES))
        .as('rushingDefensePpa'),
    )
    .select((eb) =>
      eb.fn
        .sum('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .as('defensePpaCum'),
    )
    .select((eb) =>
      eb.fn
        .sum('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', PASS_PLAY_TYPES))
        .as('passingDefensePpaCum'),
    )
    .select((eb) =>
      eb.fn
        .sum('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', RUSH_PLAY_TYPES))
        .as('rushingDefensePpaCum'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 1)
        .as('firstDefensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 2)
        .as('secondDefensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 3)
        .as('thirdDefensePpa'),
    );

  if (year) {
    query = query.where('game.season', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['conference.name']), '=', conference.toLowerCase()),
    );
  }

  if (excludeGarbageTime) {
    query = query.where((eb) =>
      eb.or([
        eb('play.period', '=', 1),
        eb.and([
          eb('play.period', '=', 2),
          eb('play.scoring', '=', false),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            38,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 3),
          eb('play.scoring', '=', false),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            28,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 4),
          eb('play.scoring', '=', false),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            22,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 2),
          eb('play.scoring', '=', true),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            45,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 3),
          eb('play.scoring', '=', true),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            35,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 4),
          eb('play.scoring', '=', true),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            28,
          ),
        ]),
      ]),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): TeamSeasonPredictedPointsAdded => ({
      season: r.season,
      conference: r.conference,
      team: r.school,
      offense: {
        overall: Math.round(Number(r.offensePpa) * 100) / 100,
        passing: Math.round(Number(r.passingOffensePpa) * 100) / 100,
        rushing: Math.round(Number(r.rushingOffensePpa) * 100) / 100,
        firstDown: Math.round(Number(r.firstOffensePpa) * 100) / 100,
        secondDown: Math.round(Number(r.secondOffensePpa) * 100) / 100,
        thirdDown: Math.round(Number(r.thirdOffensePpa) * 100) / 100,
        cumulative: {
          total: Math.round(Number(r.offensePpaCum) * 10) / 10,
          passing: Math.round(Number(r.passingOffensePpaCum) * 100) / 100,
          rushing: Math.round(Number(r.rushingOffensePpaCum) * 10) / 10,
        },
      },
      defense: {
        overall: Math.round(Number(r.defensePpa) * 100) / 100,
        passing: Math.round(Number(r.passingDefensePpa) * 100) / 100,
        rushing: Math.round(Number(r.rushingDefensePpa) * 100) / 100,
        firstDown: Math.round(Number(r.firstDefensePpa) * 100) / 100,
        secondDown: Math.round(Number(r.secondDefensePpa) * 100) / 100,
        thirdDown: Math.round(Number(r.thirdDefensePpa) * 100) / 100,
        cumulative: {
          total: Math.round(Number(r.defensePpaCum) * 10) / 10,
          passing: Math.round(Number(r.passingDefensePpaCum) * 100) / 10,
          rushing: Math.round(Number(r.rushingDefensePpaCum) * 10) / 10,
        },
      },
    }),
  );
};

export const getPredictedPointsAddedByGame = async (
  year: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
  excludeGarbageTime?: boolean,
): Promise<TeamGamePredictedPointsAdded[]> => {
  let query = kdb
    .selectFrom('game')
    .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
    .innerJoin('team', 'gameTeam.teamId', 'team.id')
    .innerJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .onRef('conferenceTeam.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', '>=', eb.ref('game.season')),
            eb('conferenceTeam.endYear', 'is', null),
          ]),
        ),
    )
    .innerJoin('conference', (join) =>
      join
        .onRef('conference.id', '=', 'conferenceTeam.conferenceId')
        .on('conference.division', '=', 'fbs'),
    )
    .innerJoin('drive', 'game.id', 'drive.gameId')
    .innerJoin('play', (join) =>
      join
        .onRef('drive.id', '=', 'play.driveId')
        .on('play.ppa', 'is not', null)
        .on((eb) =>
          eb.or([
            eb('play.offenseId', '=', eb.ref('team.id')),
            eb('play.defenseId', '=', eb.ref('team.id')),
          ]),
        ),
    )
    .innerJoin('team as team2', (join) =>
      join
        .on((eb) =>
          eb.or([
            eb('play.offenseId', '=', eb.ref('team2.id')),
            eb('play.defenseId', '=', eb.ref('team2.id')),
          ]),
        )
        .onRef('team2.id', '<>', 'team.id'),
    )
    .where('game.season', '=', year)
    .groupBy([
      'game.id',
      'game.season',
      'game.seasonType',
      'game.week',
      'team.school',
      'conference.name',
      'team2.school',
    ])
    .orderBy('game.season desc')
    .orderBy('game.seasonType')
    .orderBy('game.week')
    .orderBy('team.school')
    .select([
      'game.id',
      'game.season',
      'game.seasonType',
      'game.week',
      'team.school',
      'conference.name as conference',
      'team2.school as opponent',
    ])
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .as('offensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', PASS_PLAY_TYPES))
        .as('passingOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', RUSH_PLAY_TYPES))
        .as('rushingOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 1)
        .as('firstOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 2)
        .as('secondOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.offenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 3)
        .as('thirdOffensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .as('defensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', PASS_PLAY_TYPES))
        .as('passingDefensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere(eb('play.playTypeId', 'in', RUSH_PLAY_TYPES))
        .as('rushingDefensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 1)
        .as('firstDefensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 2)
        .as('secondDefensePpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('play.ppa')
        .filterWhereRef('play.defenseId', '=', 'team.id')
        .filterWhere('play.down', '=', 3)
        .as('thirdDefensePpa'),
    );

  if (week) {
    query = query.where('game.week', '=', week);
  }

  if (seasonType && seasonType !== SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['conference.name']), '=', conference.toLowerCase()),
    );
  }

  if (excludeGarbageTime) {
    query = query.where((eb) =>
      eb.or([
        eb('play.period', '=', 1),
        eb.and([
          eb('play.period', '=', 2),
          eb('play.scoring', '=', false),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            38,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 3),
          eb('play.scoring', '=', false),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            28,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 4),
          eb('play.scoring', '=', false),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            22,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 2),
          eb('play.scoring', '=', true),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            45,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 3),
          eb('play.scoring', '=', true),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            35,
          ),
        ]),
        eb.and([
          eb('play.period', '=', 4),
          eb('play.scoring', '=', true),
          eb(
            eb.fn('abs', [eb('play.homeScore', '-', eb.ref('play.awayScore'))]),
            '<=',
            28,
          ),
        ]),
      ]),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): TeamGamePredictedPointsAdded => ({
      gameId: r.id,
      season: r.season,
      week: r.week,
      seasonType: r.seasonType as SeasonType,
      team: r.school,
      conference: r.conference,
      opponent: r.opponent,
      offense: {
        overall: Math.round(Number(r.offensePpa) * 100) / 100,
        passing: Math.round(Number(r.passingOffensePpa) * 100) / 100,
        rushing: Math.round(Number(r.rushingOffensePpa) * 100) / 100,
        firstDown: Math.round(Number(r.firstOffensePpa) * 100) / 100,
        secondDown: Math.round(Number(r.secondOffensePpa) * 100) / 100,
        thirdDown: Math.round(Number(r.thirdOffensePpa) * 100) / 100,
      },
      defense: {
        overall: Math.round(Number(r.defensePpa) * 100) / 100,
        passing: Math.round(Number(r.passingDefensePpa) * 100) / 100,
        rushing: Math.round(Number(r.rushingDefensePpa) * 100) / 100,
        firstDown: Math.round(Number(r.firstDefensePpa) * 100) / 100,
        secondDown: Math.round(Number(r.secondDefensePpa) * 100) / 100,
        thirdDown: Math.round(Number(r.thirdDefensePpa) * 100) / 100,
      },
    }),
  );
};

export const getPredictedPointsAddedByPlayerGame = async (
  season: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
  position?: string,
  playerId?: string,
  threshold?: number,
  excludeGarbageTime?: boolean,
): Promise<PlayerGamePredictedPointsAdded[]> => {
  if (!week && !team) {
    throw new ValidateError(
      {
        week: { value: week, message: 'week required when team not specified' },
        team: { value: team, message: 'team required when week not specified' },
      },
      'Validation error',
    );
  }

  let baseQuery: SelectQueryBuilder<
    DB & {
      usage: PlayerUsageStats;
    },
    'usage',
    {}
  >;

  if (excludeGarbageTime) {
    baseQuery = kdb.selectFrom('playerUsageStatsFiltered as usage');
  } else {
    baseQuery = kdb.selectFrom('playerUsageStats as usage');
  }

  let query = baseQuery
    .innerJoin('team', 'usage.school', 'team.school')
    .innerJoin('gameTeam', (join) =>
      join
        .onRef('usage.gameId', '=', 'gameTeam.gameId')
        .onRef('team.id', '<>', 'gameTeam.teamId'),
    )
    .innerJoin('team as opponent', 'gameTeam.teamId', 'opponent.id')
    .select([
      'usage.season',
      'usage.week',
      'usage.seasonType',
      'usage.athleteId',
      'usage.name',
      'usage.position',
      'usage.school',
      'opponent.school as opponent',
      'usage.totalPpa',
      'usage.passPpa as totalPassPpa',
      'usage.rushPpa as totalRushPpa',
      'usage.plays',
      'usage.passPlays',
      'usage.rushPlays',
    ]);

  if (season) {
    query = query.where('usage.season', '=', season);
  }

  if (week) {
    query = query.where('usage.week', '=', week);
  }

  if (seasonType && seasonType !== SeasonType.Both) {
    query = query.where('usage.seasonType', '=', seasonType);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['usage.school']), '=', team.toLowerCase()),
    );
  }

  if (position) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['usage.position']), '=', position.toLowerCase()),
    );
  }

  if (playerId) {
    query = query.where('usage.athleteId', '=', playerId);
  }

  if (threshold) {
    query = query.having((eb) => eb.fn.sum('usage.plays'), '>=', threshold);
  }

  const results = await query.execute();

  return results.map(
    (r): PlayerGamePredictedPointsAdded => ({
      season: r.season,
      week: r.week,
      seasonType: r.seasonType as SeasonType,
      id: r.athleteId,
      name: r.name,
      position: r.position,
      team: r.school,
      opponent: r.opponent,
      averagePPA: {
        all: Math.round((Number(r.totalPpa) * 1000) / Number(r.plays)) / 1000,
        pass:
          Math.round((Number(r.totalPassPpa) * 1000) / Number(r.passPlays)) /
          1000,
        rush:
          Math.round((Number(r.totalRushPpa) * 1000) / Number(r.rushPlays)) /
          1000,
      },
    }),
  );
};

export const getPredictedPointsAddedByPlayerSeason = async (
  season?: number,
  conference?: string,
  team?: string,
  position?: string,
  playerId?: string,
  threshold?: number,
  excludeGarbageTime?: boolean,
): Promise<PlayerSeasonPredictedPointsAdded[]> => {
  if (!season && !playerId) {
    throw new ValidateError(
      {
        year: {
          value: season,
          message: 'year required when playerId not specified',
        },
        playerId: {
          value: team,
          message: 'playerId required when year not specified',
        },
      },
      'Validation error',
    );
  }

  let baseQuery: SelectQueryBuilder<
    DB & {
      usage: PlayerUsageStats;
    },
    'usage',
    {}
  >;

  if (excludeGarbageTime) {
    baseQuery = kdb.selectFrom('playerUsageStatsFiltered as usage');
  } else {
    baseQuery = kdb.selectFrom('playerUsageStats as usage');
  }

  let query = baseQuery
    .innerJoin('team', 'usage.school', 'team.school')
    .leftJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .onRef('conferenceTeam.startYear', '<=', 'usage.season')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', '>=', eb.ref('usage.season')),
            eb('conferenceTeam.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .groupBy([
      'usage.season',
      'usage.athleteId',
      'usage.name',
      'usage.position',
      'usage.school',
      'conference.abbreviation',
    ])
    .select([
      'usage.season',
      'usage.athleteId',
      'usage.name',
      'usage.position',
      'usage.school',
      'conference.abbreviation as conference',
    ])
    .select((eb) => [
      eb.fn.sum('usage.totalPpa').as('totalPpa'),
      eb.fn.sum('usage.passPpa').as('totalPassPpa'),
      eb.fn.sum('usage.rushPpa').as('totalRushPpa'),
      eb.fn.sum('usage.standardDownsPpa').as('standardDownsPpa'),
      eb.fn.sum('usage.passingDownsPpa').as('passingDownsPpa'),
      eb.fn.sum('usage.firstDownsPpa').as('firstDownsPpa'),
      eb.fn.sum('usage.secondDownsPpa').as('secondDownsPpa'),
      eb.fn.sum('usage.thirdDownsPpa').as('thirdDownsPpa'),
      eb.fn.sum('usage.plays').as('plays'),
      eb.fn.sum('usage.passPlays').as('passPlays'),
      eb.fn.sum('usage.rushPlays').as('rushPlays'),
      eb.fn.sum('usage.standardDowns').as('standardDowns'),
      eb.fn.sum('usage.passingDowns').as('passingDowns'),
      eb.fn.sum('usage.firstDowns').as('firstDowns'),
      eb.fn.sum('usage.secondDowns').as('secondDowns'),
      eb.fn.sum('usage.thirdDowns').as('thirdDowns'),
    ]);

  if (season) {
    query = query.where('usage.season', '=', season);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['usage.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  if (position) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['usage.position']), '=', position.toLowerCase()),
    );
  }

  if (playerId) {
    query = query.where('usage.athleteId', '=', playerId);
  }

  if (threshold) {
    query = query.having((eb) => eb.fn.sum('usage.plays'), '>=', threshold);
  }

  const results = await query.execute();

  return results.map(
    (r): PlayerSeasonPredictedPointsAdded => ({
      season: r.season,
      id: r.athleteId,
      name: r.name,
      position: r.position,
      team: r.school,
      conference: r.conference ?? '',
      averagePPA: {
        all: Math.round((Number(r.totalPpa) * 1000) / Number(r.plays)) / 1000,
        pass:
          Math.round((Number(r.totalPassPpa) * 1000) / Number(r.passPlays)) /
          1000,
        rush:
          Math.round((Number(r.totalRushPpa) * 1000) / Number(r.rushPlays)) /
          1000,
        firstDown:
          Math.round((Number(r.firstDownsPpa) * 1000) / Number(r.firstDowns)) /
          1000,
        secondDown:
          Math.round(
            (Number(r.secondDownsPpa) * 1000) / Number(r.secondDowns),
          ) / 1000,
        thirdDown:
          Math.round((Number(r.thirdDownsPpa) * 1000) / Number(r.thirdDowns)) /
          1000,
        standardDowns:
          Math.round(
            (Number(r.standardDownsPpa) * 1000) / Number(r.standardDowns),
          ) / 1000,
        passingDowns:
          Math.round(
            (Number(r.passingDownsPpa) * 1000) / Number(r.passingDowns),
          ) / 1000,
      },
      totalPPA: {
        all: Math.round(Number(r.totalPpa) * 1000) / 1000,
        pass: Math.round(Number(r.totalPassPpa) * 1000) / 1000,
        rush: Math.round(Number(r.totalRushPpa) * 1000) / 1000,
        firstDown: Math.round(Number(r.firstDownsPpa) * 1000) / 1000,
        secondDown: Math.round(Number(r.secondDownsPpa) * 1000) / 1000,
        thirdDown: Math.round(Number(r.thirdDownsPpa) * 1000) / 1000,
        standardDowns: Math.round(Number(r.standardDownsPpa) * 1000) / 1000,
        passingDowns: Math.round(Number(r.passingDownsPpa) * 1000) / 1000,
      },
    }),
  );
};

export const getPregameWinProbabilities = async (
  season?: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
): Promise<PregameWinProbability[]> => {
  const gaussianDistro = gaussian(0, Math.pow(14.5, 2));

  let query = kdb
    .selectFrom('game')
    .innerJoin('gameTeam as gt', (join) =>
      join.onRef('game.id', '=', 'gt.gameId').on('gt.homeAway', '=', 'home'),
    )
    .innerJoin('team as homeTeam', 'gt.teamId', 'homeTeam.id')
    .innerJoin('gameTeam as gt2', (join) =>
      join.onRef('game.id', '=', 'gt2.gameId').on('gt2.homeAway', '=', 'away'),
    )
    .innerJoin('team as awayTeam', 'gt2.teamId', 'awayTeam.id')
    .leftJoin('gameLines as gl', (join) =>
      join
        .onRef('game.id', '=', 'gl.gameId')
        .on('gl.linesProviderId', '=', 1004),
    )
    .leftJoin('gameLines as gl2', (join) =>
      join
        .onRef('game.id', '=', 'gl2.gameId')
        .on('gl2.linesProviderId', '=', 999999),
    )
    .leftJoin('gameLines as gl3', (join) =>
      join
        .onRef('game.id', '=', 'gl3.gameId')
        .on('gl3.linesProviderId', '=', 888888),
    )
    .where((eb) =>
      eb.or([
        eb('gl.spread', 'is not', null),
        eb('gl2.spread', 'is not', null),
        eb('gl3.spread', 'is not', null),
      ]),
    )
    .select([
      'game.id',
      'game.season',
      'game.seasonType',
      'game.week',
      'homeTeam.school as homeTeam',
      'awayTeam.school as awayTeam',
    ])
    .select((eb) =>
      eb.fn.coalesce('gl.spread', 'gl2.spread', 'gl3.spread').as('spread'),
    )
    .orderBy('game.season')
    .orderBy('game.seasonType')
    .orderBy('game.week')
    .orderBy('homeTeam.school')
    .limit(1000);

  if (season) {
    query = query.where('game.season', '=', season);
  }

  if (week) {
    query = query.where('game.week', '=', week);
  }

  if (seasonType && seasonType !== SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
  }

  if (team) {
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['homeTeam.school']), '=', team.toLowerCase()),
        eb(eb.fn('lower', ['awayTeam.school']), '=', team.toLowerCase()),
      ]),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): PregameWinProbability => ({
      season: r.season,
      week: r.week,
      seasonType: r.seasonType as SeasonType,
      gameId: r.id,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      spread: Number(r.spread),
      homeWinProbability:
        Math.round(gaussianDistro.cdf(Number(r.spread) * -1) * 1000) / 1000,
    }),
  );
};

export const getFieldGoalEP = async (): Promise<FieldGoalEP[]> => {
  const results = await kdb
    .selectFrom('fgEp')
    .select(['yardsToGoal', 'expectedPoints'])
    .orderBy('yardsToGoal')
    .execute();

  return results.map(
    (r): FieldGoalEP => ({
      yardsToGoal: r.yardsToGoal,
      distance: r.yardsToGoal + 17,
      expectedPoints: Number(r.expectedPoints),
    }),
  );
};

export const getWinProbabilities = async (
  gameId: number,
): Promise<PlayWinProbability[]> => {
  const results = await kdb
    .selectFrom('game')
    .innerJoin('gameTeam as gt', (join) =>
      join.onRef('game.id', '=', 'gt.gameId').on('gt.homeAway', '=', 'home'),
    )
    .innerJoin('team as homeTeam', 'gt.teamId', 'homeTeam.id')
    .innerJoin('gameTeam as gt2', (join) =>
      join.onRef('game.id', '=', 'gt2.gameId').on('gt2.homeAway', '=', 'away'),
    )
    .innerJoin('team as awayTeam', 'gt2.teamId', 'awayTeam.id')
    .innerJoin('drive', 'game.id', 'drive.gameId')
    .innerJoin('play', (join) =>
      join
        .onRef('drive.id', '=', 'play.driveId')
        .on('play.homeWinProb', 'is not', null)
        .on(
          'play.playTypeId',
          'not in',
          [12, 13, 15, 16, 21, 43, 53, 56, 57, 61, 62, 65, 66, 999, 78],
        )
        .on('play.yardLine', '<=', 99)
        .on('play.yardLine', '>=', 1)
        .on('play.down', '<=', 4)
        .on('play.down', '>=', 1)
        .on('play.distance', '>=', 1)
        .on((eb) =>
          eb(
            'play.distance',
            '<=',
            eb
              .case()
              .when(
                eb.or([
                  eb('homeTeam.id', '=', eb.ref('play.offenseId')),
                  eb('awayTeam.id', '=', eb.ref('play.defenseId')),
                ]),
              )
              .then(sql<number>`100 - play.yard_line`)
              .else(eb.ref('play.yardLine'))
              .end(),
          ),
        ),
    )
    .leftJoin('gameLines', (join) =>
      join
        .onRef('game.id', '=', 'gameLines.gameId')
        .on('gameLines.linesProviderId', '=', 1004),
    )
    .where('game.id', '=', gameId)
    .select([
      'game.id',
      'homeTeam.id as homeTeamId',
      'homeTeam.school as homeTeam',
      'awayTeam.id as awayTeamId',
      'awayTeam.school as awayTeam',
      'play.id as playId',
      'play.playText',
      'play.homeScore',
      'play.awayScore',
      'play.period',
      'play.clock',
      'play.down',
      'play.distance',
      'play.homeWinProb',
      'gt.winner as homeWinner',
    ])
    .select((eb) => eb.fn.coalesce('gameLines.spread', eb.lit(0)).as('spread'))
    .select((eb) =>
      eb
        .case()
        .when(
          eb.and([
            eb('homeTeam.id', '=', eb.ref('play.offenseId')),
            eb('play.scoring', '=', false),
          ]),
        )
        .then(true)
        .when(
          eb.and([
            eb('homeTeam.id', '=', eb.ref('play.defenseId')),
            eb('play.scoring', '=', true),
          ]),
        )
        .then(false)
        .else(false)
        .end()
        .as('homeBall'),
    )
    .select((eb) =>
      eb(
        eb.fn
          .agg<number>('row_number')
          .over((ob) =>
            ob.orderBy('drive.driveNumber').orderBy('play.playNumber'),
          ),
        '-',
        1,
      ).as('playNumber'),
    )
    .select((eb) =>
      eb
        .case()
        .when(
          eb.or([
            eb('homeTeam.id', '=', eb.ref('play.offenseId')),
            eb('awayTeam.id', '=', eb.ref('play.defenseId')),
          ]),
        )
        .then(sql<number>`100 - play.yard_line`)
        .else(eb.ref('play.yardLine'))
        .end()
        .as('yardsToGoal'),
    )
    .orderBy('drive.driveNumber')
    .orderBy('play.playNumber desc')
    .execute();

  const plays = results
    .map(
      (r): PlayWinProbability => ({
        gameId: r.id,
        homeId: r.homeTeamId,
        home: r.homeTeam,
        awayId: r.awayTeamId,
        away: r.awayTeam,
        playId: r.playId,
        playText: r.playText ?? '',
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        down: r.down,
        distance: r.distance,
        homeWinProbability: Number(r.homeWinProb),
        spread: Number(r.spread),
        yardLine: r.yardsToGoal,
        homeBall: r.homeBall,
        playNumber: Number(r.playNumber),
      }),
    )
    .sort((a, b) => (a.playNumber < b.playNumber ? -1 : 1));

  if (plays.length > 0) {
    const last = plays[plays.length - 1];
    plays.push({
      gameId: last.gameId,
      homeId: last.homeId,
      home: last.home,
      awayId: last.awayId,
      away: last.away,
      playId: '0',
      playText: 'Game ended',
      homeScore: last.homeScore,
      awayScore: last.awayScore,
      down: 0,
      distance: 0,
      homeWinProbability: results[0].homeWinner ? 1 : 0,
      spread: last.spread,
      yardLine: 65,
      homeBall: last.homeBall,
      playNumber: last.playNumber + 1,
    });
  }

  return plays;
};

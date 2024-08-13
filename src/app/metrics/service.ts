import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import {
  PlayerSeasonPredictedPointsAdded,
  PlayerGamePredictedPointsAdded,
  PredictedPointsValue,
  TeamGamePredictedPointsAdded,
  TeamSeasonPredictedPointsAdded,
} from './types';
import { PASS_PLAY_TYPES, RUSH_PLAY_TYPES } from '../../globals';
import { SeasonType } from '../enums';

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

  let query = kdb
    .with('plays', (cte) => {
      let playsQuery = cte
        .selectFrom('game')
        .innerJoin('gameTeam as gt', 'game.id', 'gt.gameId')
        .innerJoin('team as t', 'gt.teamId', 't.id')
        .innerJoin('gameTeam as gt2', (join) =>
          join
            .onRef('game.id', '=', 'gt2.gameId')
            .onRef('gt2.teamId', '<>', 'gt.teamId'),
        )
        .innerJoin('team as t2', 'gt2.teamId', 't2.id')
        .innerJoin('drive', 'game.id', 'drive.gameId')
        .innerJoin('play', (join) =>
          join
            .onRef('drive.id', '=', 'play.driveId')
            .onRef('play.offenseId', '=', 't.id')
            .on('play.ppa', 'is not', null),
        )
        .innerJoin('playStat', 'play.id', 'playStat.playId')
        .innerJoin('athlete', 'playStat.athleteId', 'athlete.id')
        .innerJoin('position', 'athlete.positionId', 'position.id')
        .leftJoin('conferenceTeam as ct', (join) =>
          join
            .onRef('t.id', '=', 'ct.teamId')
            .onRef('ct.startYear', '<=', 'game.season')
            .on((eb) =>
              eb.or([
                eb('ct.endYear', '>=', eb.ref('game.season')),
                eb('ct.endYear', 'is', null),
              ]),
            ),
        )
        .leftJoin('conference as c', 'ct.conferenceId', 'c.id')
        .leftJoin('conferenceTeam as ct2', (join) =>
          join
            .onRef('t2.id', '=', 'ct2.teamId')
            .onRef('ct2.startYear', '<=', 'game.season')
            .on((eb) =>
              eb.or([
                eb('ct2.endYear', '>=', eb.ref('game.season')),
                eb('ct2.endYear', 'is', null),
              ]),
            ),
        )
        .leftJoin('conference as c2', 'ct2.conferenceId', 'c2.id')
        .select([
          't.school',
          'game.season',
          'game.seasonType',
          'game.week',
          't2.school as opponent',
          'athlete.id',
          'athlete.name',
          'position.abbreviation as position',
          'play.id as playId',
          'play.down',
          'play.ppa',
        ])
        .select((eb) =>
          eb
            .case()
            .when('play.playTypeId', 'in', PASS_PLAY_TYPES)
            .then('Pass')
            .when('play.playTypeId', 'in', RUSH_PLAY_TYPES)
            .then('Rush')
            .else('Other')
            .end()
            .as('playType'),
        );

      if (season) {
        playsQuery = playsQuery.where('game.season', '=', season);
      }

      if (week) {
        playsQuery = playsQuery.where('game.week', '=', week);
      }

      if (seasonType && seasonType !== SeasonType.Both) {
        playsQuery = playsQuery.where('game.seasonType', '=', seasonType);
      }

      if (team) {
        playsQuery = playsQuery.where((eb) =>
          eb(eb.fn('lower', ['t.school']), '=', team.toLowerCase()),
        );
      }

      if (position) {
        playsQuery = playsQuery.where((eb) =>
          eb(
            eb.fn('lower', ['position.abbreviation']),
            '=',
            position.toLowerCase(),
          ),
        );
      }

      if (playerId) {
        playsQuery = playsQuery.where('athlete.id', '=', playerId);
      }

      if (excludeGarbageTime) {
        playsQuery = playsQuery.where((eb) =>
          eb.or([
            eb('play.period', '=', 1),
            eb.and([
              eb('play.period', '=', 2),
              eb('play.scoring', '=', false),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                38,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 3),
              eb('play.scoring', '=', false),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                28,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 4),
              eb('play.scoring', '=', false),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                22,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 2),
              eb('play.scoring', '=', true),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                45,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 3),
              eb('play.scoring', '=', true),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                35,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 4),
              eb('play.scoring', '=', true),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                28,
              ),
            ]),
          ]),
        );
      }

      return playsQuery;
    })
    .selectFrom('plays')
    .where('position', 'in', ['QB', 'RB', 'WR', 'TE', 'FB'])
    .groupBy([
      'id',
      'name',
      'position',
      'school',
      'season',
      'week',
      'seasonType',
      'seasonType',
      'opponent',
    ])
    .having((eb) => eb(eb.fn.countAll(), '>=', threshold || 0))
    .select([
      'id',
      'name',
      'position',
      'school',
      'season',
      'week',
      'seasonType',
      'opponent',
    ])
    .select((eb) => eb.fn.avg('ppa').as('avgPpa'))
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('playType', '=', 'Pass').as('passPpa'),
    )
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('playType', '=', 'Rush').as('rushPpa'),
    )
    .orderBy('avgPpa');

  const results = await query.execute();

  return results.map(
    (r): PlayerGamePredictedPointsAdded => ({
      season: r.season,
      week: r.week,
      seasonType: r.seasonType as SeasonType,
      id: r.id,
      name: r.name,
      position: r.position,
      team: r.school,
      opponent: r.opponent,
      averagePPA: {
        all: Math.round(Number(r.avgPpa) * 1000) / 1000,
        pass: Math.round(Number(r.passPpa) * 1000) / 1000,
        rush: Math.round(Number(r.rushPpa) * 1000) / 1000,
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

  let query = kdb
    .with('plays', (cte) => {
      let playsQuery = cte
        .selectFrom('game')
        .innerJoin('gameTeam as gt', 'game.id', 'gt.gameId')
        .innerJoin('team as t', 'gt.teamId', 't.id')
        .innerJoin('conferenceTeam as ct', (join) =>
          join
            .onRef('t.id', '=', 'ct.teamId')
            .onRef('ct.startYear', '<=', 'game.season')
            .on((eb) =>
              eb.or([
                eb('ct.endYear', '>=', eb.ref('game.season')),
                eb('ct.endYear', 'is', null),
              ]),
            ),
        )
        .innerJoin('conference as c', (join) =>
          join
            .onRef('ct.conferenceId', '=', 'c.id')
            .on('c.division', '=', 'fbs'),
        )
        .innerJoin('drive', 'game.id', 'drive.gameId')
        .innerJoin('play', (join) =>
          join
            .onRef('drive.id', '=', 'play.driveId')
            .onRef('play.offenseId', '=', 't.id')
            .on('play.ppa', 'is not', null),
        )
        .innerJoin('playStat', 'play.id', 'playStat.playId')
        .innerJoin('athlete', 'playStat.athleteId', 'athlete.id')
        .innerJoin('position', 'athlete.positionId', 'position.id')
        .select([
          't.school',
          'game.season',
          'c.name as conference',
          'athlete.id',
          'athlete.name',
          'position.abbreviation as position',
          'play.id as playId',
          'play.down',
          'play.ppa',
        ])
        .select((eb) =>
          eb
            .case()
            .when('play.playTypeId', 'in', PASS_PLAY_TYPES)
            .then('Pass')
            .when('play.playTypeId', 'in', RUSH_PLAY_TYPES)
            .then('Rush')
            .else('Other')
            .end()
            .as('playType'),
        )
        .select((eb) =>
          eb
            .case()
            .when(
              eb.and([eb('play.down', '=', 2), eb('play.distance', '>=', 8)]),
            )
            .then('passing')
            .when(
              eb.and([eb('play.down', '=', 3), eb('play.distance', '>=', 5)]),
            )
            .then('passing')
            .else('standard')
            .end()
            .as('downType'),
        );

      if (season) {
        playsQuery = playsQuery.where('game.season', '=', season);
      }

      if (conference) {
        playsQuery = playsQuery.where((eb) =>
          eb(eb.fn('lower', ['c.name']), '=', conference.toLowerCase()),
        );
      }

      if (team) {
        playsQuery = playsQuery.where((eb) =>
          eb(eb.fn('lower', ['t.school']), '=', team.toLowerCase()),
        );
      }

      if (position) {
        playsQuery = playsQuery.where((eb) =>
          eb(
            eb.fn('lower', ['position.abbreviation']),
            '=',
            position.toLowerCase(),
          ),
        );
      }

      if (playerId) {
        playsQuery = playsQuery.where('athlete.id', '=', playerId);
      }

      if (excludeGarbageTime) {
        playsQuery = playsQuery.where((eb) =>
          eb.or([
            eb('play.period', '=', 1),
            eb.and([
              eb('play.period', '=', 2),
              eb('play.scoring', '=', false),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                38,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 3),
              eb('play.scoring', '=', false),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                28,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 4),
              eb('play.scoring', '=', false),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                22,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 2),
              eb('play.scoring', '=', true),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                45,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 3),
              eb('play.scoring', '=', true),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                35,
              ),
            ]),
            eb.and([
              eb('play.period', '=', 4),
              eb('play.scoring', '=', true),
              eb(
                eb.fn('abs', [
                  eb('play.homeScore', '-', eb.ref('play.awayScore')),
                ]),
                '<=',
                28,
              ),
            ]),
          ]),
        );
      }

      return playsQuery;
    })
    .selectFrom('plays')
    .where('position', 'in', ['QB', 'RB', 'WR', 'TE', 'FB'])
    .groupBy(['season', 'id', 'name', 'position', 'school', 'conference'])
    .having((eb) => eb(eb.fn.countAll(), '>=', threshold || 0))
    .select(['season', 'id', 'name', 'position', 'school', 'conference'])
    .select((eb) => eb.fn.count('ppa').as('countablePlays'))
    .select((eb) => eb.fn.avg('ppa').as('avgPpa'))
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('playType', '=', 'Pass').as('passPpa'),
    )
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('playType', '=', 'Rush').as('rushPpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('ppa')
        .filterWhere('downType', '=', 'passing')
        .as('passingDownPpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('ppa')
        .filterWhere('downType', '=', 'standard')
        .as('standardDownPpa'),
    )
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('down', '=', 1).as('firstDownPpa'),
    )
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('down', '=', 2).as('secondDownPpa'),
    )
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('down', '=', 3).as('thirdDownPpa'),
    )
    .select((eb) => eb.fn.sum('ppa').as('totalPpa'))
    .select((eb) =>
      eb.fn.sum('ppa').filterWhere('playType', '=', 'Pass').as('totalPassPpa'),
    )
    .select((eb) =>
      eb.fn.sum('ppa').filterWhere('playType', '=', 'Rush').as('totalRushPpa'),
    )
    .select((eb) =>
      eb.fn
        .sum('ppa')
        .filterWhere('downType', '=', 'passing')
        .as('totalPassingDownPpa'),
    )
    .select((eb) =>
      eb.fn
        .sum('ppa')
        .filterWhere('downType', '=', 'standard')
        .as('totalStandardDownPpa'),
    )
    .select((eb) =>
      eb.fn.sum('ppa').filterWhere('down', '=', 1).as('totalFirstDownPpa'),
    )
    .select((eb) =>
      eb.fn.sum('ppa').filterWhere('down', '=', 2).as('totalSecondDownPpa'),
    )
    .select((eb) =>
      eb.fn.sum('ppa').filterWhere('down', '=', 3).as('totalThirdDownPpa'),
    )
    .orderBy('avgPpa');

  const results = await query.execute();

  return results.map(
    (r): PlayerSeasonPredictedPointsAdded => ({
      season: r.season,
      id: r.id,
      name: r.name,
      position: r.position,
      team: r.school,
      conference: r.conference,
      averagePPA: {
        all: Math.round(Number(r.avgPpa) * 1000) / 1000,
        pass: Math.round(Number(r.passPpa) * 1000) / 1000,
        rush: Math.round(Number(r.rushPpa) * 1000) / 1000,
        firstDown: Math.round(Number(r.firstDownPpa) * 1000) / 1000,
        secondDown: Math.round(Number(r.secondDownPpa) * 1000) / 1000,
        thirdDown: Math.round(Number(r.thirdDownPpa) * 1000) / 1000,
        standardDowns: Math.round(Number(r.standardDownPpa) * 1000) / 1000,
        passingDowns: Math.round(Number(r.passingDownPpa) * 1000) / 1000,
      },
      totalPPA: {
        all: Math.round(Number(r.totalPpa) * 1000) / 1000,
        pass: Math.round(Number(r.totalPassPpa) * 1000) / 1000,
        rush: Math.round(Number(r.totalRushPpa) * 1000) / 1000,
        firstDown: Math.round(Number(r.totalFirstDownPpa) * 1000) / 1000,
        secondDown: Math.round(Number(r.totalSecondDownPpa) * 1000) / 1000,
        thirdDown: Math.round(Number(r.totalThirdDownPpa) * 1000) / 1000,
        standardDowns: Math.round(Number(r.totalStandardDownPpa) * 1000) / 1000,
        passingDowns: Math.round(Number(r.totalPassingDownPpa) * 1000) / 1000,
      },
    }),
  );
};

import { sql } from 'kysely';
import { kdb } from '../../config/database';
import { DivisionClassification, SeasonType } from '../enums';
import { Drive } from './types';

export const getDrives = async (
  year: number,
  seasonType?: SeasonType,
  week?: number,
  team?: string,
  offense?: string,
  defense?: string,
  offenseConference?: string,
  defenseConference?: string,
  conference?: string,
  classification?: DivisionClassification,
): Promise<Drive[]> => {
  let query = kdb
    .with('drives', (eb) => {
      let cte = eb
        .selectFrom('game')
        .innerJoin('gameTeam', (join) =>
          join
            .onRef('game.id', '=', 'gameTeam.gameId')
            .on('gameTeam.homeAway', '=', 'home'),
        )
        .innerJoin('drive', 'game.id', 'drive.gameId')
        .innerJoin('team as offense', 'drive.offenseId', 'offense.id')
        .innerJoin('team as defense', 'drive.defenseId', 'defense.id')
        .innerJoin('driveResult', 'drive.resultId', 'driveResult.id')
        .leftJoin('conferenceTeam as oct', (join) =>
          join
            .onRef('offense.id', '=', 'oct.teamId')
            .onRef('oct.startYear', '<=', 'game.season')
            .on((eb) =>
              eb.or([
                eb('oct.endYear', 'is', null),
                eb('oct.endYear', '>=', eb.ref('game.season')),
              ]),
            ),
        )
        .leftJoin('conference as oc', 'oct.conferenceId', 'oc.id')
        .leftJoin('conferenceTeam as dct', (join) =>
          join
            .onRef('defense.id', '=', 'dct.teamId')
            .onRef('dct.startYear', '<=', 'game.season')
            .on((eb) =>
              eb.or([
                eb('dct.endYear', 'is', null),
                eb('dct.endYear', '>=', eb.ref('game.season')),
              ]),
            ),
        )
        .leftJoin('conference as dc', 'dct.conferenceId', 'dc.id')
        .where('game.season', '=', year)
        .orderBy(['game.id'])
        .orderBy(['drive.driveNumber'])
        .select([
          'offense.school as offense',
          'oc.name as offenseConference',
          'defense.school as defense',
          'dc.name as defenseConference',
          'game.id as gameId',
          'drive.id',
          'drive.driveNumber',
          'drive.scoring',
          'drive.startPeriod',
          'drive.startTime',
          'drive.startYardline',
          'drive.endPeriod',
          'drive.endTime',
          'drive.endYardline',
          'drive.elapsed',
          'drive.plays',
          'drive.yards',
          'driveResult.name as driveResult',
        ])
        .select((eb) =>
          eb
            .case()
            .when('offense.id', '=', eb.ref('gameTeam.teamId'))
            .then(sql<number>`100 - drive.start_yardline`)
            .else(sql<number>`drive.start_yardline`)
            .end()
            .as('startYardsToGoal'),
        )
        .select((eb) =>
          eb
            .case()
            .when('offense.id', '=', eb.ref('gameTeam.teamId'))
            .then(sql<number>`100 - drive.end_yardline`)
            .else(sql<number>`drive.end_yardline`)
            .end()
            .as('endYardsToGoal'),
        )
        .select((eb) =>
          eb
            .case()
            .when('offense.id', '=', eb.ref('gameTeam.teamId'))
            .then(true)
            .else(false)
            .end()
            .as('isHomeOffense'),
        );

      if (seasonType && seasonType !== SeasonType.Both) {
        cte = cte.where('game.seasonType', '=', seasonType);
      }

      if (week) {
        cte = cte.where('game.week', '=', week);
      }

      if (team) {
        cte = cte.where((eb) =>
          eb.or([
            eb(eb.fn('lower', ['offense.school']), '=', team.toLowerCase()),
            eb(eb.fn('lower', ['defense.school']), '=', team.toLowerCase()),
          ]),
        );
      }

      if (offense) {
        cte = cte.where((eb) =>
          eb(eb.fn('lower', ['offense.school']), '=', offense.toLowerCase()),
        );
      }

      if (defense) {
        cte = cte.where((eb) =>
          eb(eb.fn('lower', ['defense.school']), '=', defense.toLowerCase()),
        );
      }

      if (offenseConference) {
        cte = cte.where(
          (eb) => eb.fn('lower', ['oc.abbreviation']),
          '=',
          offenseConference.toLowerCase(),
        );
      }

      if (defenseConference) {
        cte = cte.where(
          (eb) => eb.fn('lower', ['dc.abbreviation']),
          '=',
          defenseConference.toLowerCase(),
        );
      }

      if (conference) {
        cte = cte.where((eb) =>
          eb.or([
            eb(
              eb.fn('lower', ['oc.abbreviation']),
              '=',
              conference.toLowerCase(),
            ),
            eb(
              eb.fn('lower', ['dc.abbreviation']),
              '=',
              conference.toLowerCase(),
            ),
          ]),
        );
      }

      if (classification) {
        cte = cte.where((eb) =>
          eb.or([
            eb('oc.division', '=', classification),
            eb('dc.division', '=', classification),
          ]),
        );
      }

      return cte;
    })
    .with('points', (eb) =>
      eb
        .selectFrom('drives')
        .innerJoin('play', 'drives.id', 'play.driveId')
        .groupBy('drives.id')
        .select('drives.id')
        .select((eb) => eb.fn.min('play.homeScore').as('startingHomeScore'))
        .select((eb) => eb.fn.max('play.homeScore').as('endingHomeScore'))
        .select((eb) => eb.fn.min('play.awayScore').as('startingAwayScore'))
        .select((eb) => eb.fn.max('play.awayScore').as('endingAwayScore')),
    )
    .selectFrom('drives')
    .innerJoin('points', 'drives.id', 'points.id')
    .selectAll('drives')
    .select((eb) =>
      eb
        .case()
        .when('drives.isHomeOffense', '=', true)
        .then(eb.ref('points.startingHomeScore'))
        .else(eb.ref('points.startingAwayScore'))
        .end()
        .as('startingOffenseScore'),
    )
    .select((eb) =>
      eb
        .case()
        .when('drives.isHomeOffense', '=', true)
        .then(eb.ref('points.startingAwayScore'))
        .else(eb.ref('points.startingHomeScore'))
        .end()
        .as('startingDefenseScore'),
    )
    .select((eb) =>
      eb
        .case()
        .when('drives.isHomeOffense', '=', true)
        .then(eb.ref('points.endingHomeScore'))
        .else(eb.ref('points.endingAwayScore'))
        .end()
        .as('endingOffenseScore'),
    )
    .select((eb) =>
      eb
        .case()
        .when('drives.isHomeOffense', '=', true)
        .then(eb.ref('points.endingAwayScore'))
        .else(eb.ref('points.endingHomeScore'))
        .end()
        .as('endingDefenseScore'),
    );

  let drives = await query.execute();

  for (let drive of drives) {
    if (!drive.startTime.minutes) {
      drive.startTime.minutes = 0;
    }

    if (!drive.startTime.seconds) {
      drive.startTime.seconds = 0;
    }

    if (!drive.endTime.minutes) {
      drive.endTime.minutes = 0;
    }

    if (!drive.endTime.seconds) {
      drive.endTime.seconds = 0;
    }

    if (!drive.elapsed.minutes) {
      drive.elapsed.minutes = 0;
    }

    if (!drive.elapsed.seconds) {
      drive.elapsed.seconds = 0;
    }
  }

  return drives.map(
    (d): Drive => ({
      id: d.id,
      gameId: d.gameId,
      offense: d.offense,
      offenseConference: d.offenseConference,
      defense: d.defense,
      defenseConference: d.defenseConference,
      driveNumber: d.driveNumber,
      scoring: d.scoring,
      startPeriod: d.startPeriod,
      startYardline: d.startYardline,
      startYardsToGoal: d.startYardsToGoal,
      startTime: {
        minutes: d.startTime?.minutes ?? null,
        seconds: d.startTime?.seconds ?? null,
      },
      endPeriod: d.endPeriod,
      endYardline: d.endYardline,
      endYardsToGoal: d.endYardsToGoal,
      endTime: {
        minutes: d.endTime?.minutes ?? null,
        seconds: d.endTime?.seconds ?? null,
      },
      plays: d.plays,
      yards: d.yards,
      driveResult: d.driveResult,
      isHomeOffense: d.isHomeOffense,
      startOffenseScore: d.startingOffenseScore,
      startDefenseScore: d.startingDefenseScore,
      endOffenseScore: d.endingOffenseScore,
      endDefenseScore: d.endingDefenseScore,
    }),
  );
};

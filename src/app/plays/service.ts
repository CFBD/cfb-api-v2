import { sql } from 'kysely';
import { kdb } from '../../config/database';
import { DivisionClassification, SeasonType } from '../enums';
import { Play, PlayStat, PlayStatType, PlayType } from './types';

export const getPlays = async (
  year: number,
  week: number,
  team?: string,
  offense?: string,
  defense?: string,
  offenseConference?: string,
  defenseConference?: string,
  conference?: string,
  playType?: string,
  seasonType?: SeasonType,
  classification?: DivisionClassification,
): Promise<Play[]> => {
  let query = kdb
    .selectFrom('game')
    .innerJoin('drive', 'game.id', 'drive.gameId')
    .innerJoin('play', 'drive.id', 'play.driveId')
    .innerJoin('team as offense', 'play.offenseId', 'offense.id')
    .leftJoin('conferenceTeam as oct', (join) =>
      join
        .onRef('offense.id', '=', 'oct.teamId')
        .onRef('oct.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('oct.endYear', '>=', eb.ref('game.season')),
            eb('oct.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as oc', 'oct.conferenceId', 'oc.id')
    .innerJoin('team as defense', 'play.defenseId', 'defense.id')
    .leftJoin('conferenceTeam as dct', (join) =>
      join
        .onRef('defense.id', '=', 'dct.teamId')
        .onRef('dct.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('dct.endYear', '>=', eb.ref('game.season')),
            eb('dct.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as dc', 'dct.conferenceId', 'dc.id')
    .innerJoin('gameTeam as ogt', (join) =>
      join
        .onRef('ogt.gameId', '=', 'game.id')
        .onRef('ogt.teamId', '=', 'offense.id'),
    )
    .innerJoin('gameTeam as dgt', (join) =>
      join
        .onRef('dgt.gameId', '=', 'game.id')
        .onRef('dgt.teamId', '=', 'defense.id'),
    )
    .innerJoin('playType', 'play.playTypeId', 'playType.id')
    .where('game.season', '=', year)
    .where('game.week', '=', week)
    .select([
      'play.id',
      'offense.school as offense',
      'oc.name as offenseConference',
      'defense.school as defense',
      'dc.name as defenseConference',
      'game.id as gameId',
      'drive.id as driveId',
      'drive.driveNumber',
      'play.playNumber',
      'play.period',
      'play.clock',
      'play.yardLine',
      'play.down',
      'play.distance',
      'play.scoring',
      'play.yardsGained',
      'playType.text as playType',
      'play.playText',
      'play.ppa',
      'play.wallclock',
    ])
    .select((eb) =>
      eb
        .case()
        .when('ogt.homeAway', '=', 'home')
        .then(eb.ref('offense.school'))
        .else(eb.ref('defense.school'))
        .end()
        .as('home'),
    )
    .select((eb) =>
      eb
        .case()
        .when('ogt.homeAway', '=', 'away')
        .then(eb.ref('offense.school'))
        .else(eb.ref('defense.school'))
        .end()
        .as('away'),
    )
    .select((eb) =>
      eb
        .case()
        .when('ogt.homeAway', '=', 'home')
        .then(eb.ref('play.homeScore'))
        .else(eb.ref('play.awayScore'))
        .end()
        .as('offenseScore'),
    )
    .select((eb) =>
      eb
        .case()
        .when('ogt.homeAway', '=', 'away')
        .then(eb.ref('play.homeScore'))
        .else(eb.ref('play.awayScore'))
        .end()
        .as('defenseScore'),
    )
    .select((eb) =>
      eb
        .case()
        .when('ogt.homeAway', '=', 'home')
        .then(eb.ref('play.homeTimeouts'))
        .else(eb.ref('play.awayTimeouts'))
        .end()
        .as('offenseTimeouts'),
    )
    .select((eb) =>
      eb
        .case()
        .when('ogt.homeAway', '=', 'away')
        .then(eb.ref('play.homeTimeouts'))
        .else(eb.ref('play.awayTimeouts'))
        .end()
        .as('defenseTimeouts'),
    )
    .select((eb) =>
      eb
        .case()
        .when('ogt.homeAway', '=', 'home')
        .then(sql<number>`100 - play.yard_line`)
        .else(eb.ref('play.yardLine'))
        .end()
        .as('yardsToGoal'),
    );

  if (team) {
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['offense.school']), '=', team.toLowerCase()),
        eb(eb.fn('lower', ['defense.school']), '=', team.toLowerCase()),
      ]),
    );
  }

  if (offense) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['offense.school']), '=', offense.toLowerCase()),
    );
  }

  if (defense) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['defense.school']), '=', defense.toLowerCase()),
    );
  }

  if (offenseConference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['oc.abbreviation']),
        '=',
        offenseConference.toLowerCase(),
      ),
    );
  }

  if (defenseConference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['dc.abbreviation']),
        '=',
        defenseConference.toLowerCase(),
      ),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['oc.abbreviation']), '=', conference.toLowerCase()),
        eb(eb.fn('lower', ['dc.abbreviation']), '=', conference.toLowerCase()),
      ]),
    );
  }

  if (playType) {
    query = query.where('playType.abbreviation', '=', playType);
  }

  if (seasonType && seasonType != SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
  }

  if (classification) {
    query = query.where((eb) =>
      eb.or([
        eb('oc.division', '=', classification),
        eb('dc.division', '=', classification),
      ]),
    );
  }

  const plays = await query.execute();

  for (const play of plays) {
    if (!play.clock.minutes) {
      play.clock.minutes = 0;
    }

    if (!play.clock.seconds) {
      play.clock.seconds = 0;
    }
  }

  return plays.map(
    (p): Play => ({
      gameId: p.gameId,
      driveId: p.driveId,
      id: p.id,
      driveNumber: p.driveNumber,
      playNumber: p.playNumber,
      offense: p.offense,
      offenseConference: p.offenseConference,
      offenseScore: p.offenseScore,
      defense: p.defense,
      defenseConference: p.defenseConference,
      defenseScore: p.defenseScore,
      home: p.home,
      away: p.away,
      period: p.period,
      clock: {
        minutes: p.clock?.minutes ?? null,
        seconds: p.clock?.seconds ?? null,
      },
      offenseTimeouts: p.offenseTimeouts,
      defenseTimeouts: p.defenseTimeouts,
      yardline: p.yardLine,
      yardsToGoal: p.yardsToGoal,
      down: p.down,
      distance: p.distance,
      yardsGained: p.yardsGained,
      scoring: p.scoring,
      playType: p.playType,
      playText: p.playText,
      ppa: p.ppa ? parseFloat(p.ppa) : null,
      wallclock: p.wallclock?.toISOString() ?? null,
    }),
  );
};

export const getPlayTypes = async (): Promise<PlayType[]> => {
  const types = await kdb
    .selectFrom('playType')
    .orderBy('sequence')
    .select(['id', 'text', 'abbreviation'])
    .execute();

  return types;
};

export const getPlayStats = async (
  year?: number,
  week?: number,
  team?: string,
  gameId?: number,
  athleteId?: number,
  statTypeId?: number,
  seasonType?: SeasonType,
  conference?: string,
) => {
  let query = kdb
    .selectFrom('team')
    .innerJoin('gameTeam as gt', 'team.id', 'gt.teamId')
    .innerJoin('gameTeam as gt2', (join) =>
      join.onRef('gt2.gameId', '=', 'gt.gameId').onRef('gt2.id', '<>', 'gt.id'),
    )
    .innerJoin('team as opponent', 'gt2.teamId', 'opponent.id')
    .innerJoin('game', 'gt.gameId', 'game.id')
    .innerJoin('drive', 'game.id', 'drive.gameId')
    .innerJoin('play', 'drive.id', 'play.driveId')
    .innerJoin('playStat', 'play.id', 'playStat.playId')
    .innerJoin('athlete', 'playStat.athleteId', 'athlete.id')
    .innerJoin('athleteTeam', (join) =>
      join
        .onRef('athleteTeam.athleteId', '=', 'athlete.id')
        .onRef('athleteTeam.startYear', '<=', 'game.season')
        .onRef('athleteTeam.endYear', '>=', 'game.season')
        .onRef('athleteTeam.teamId', '=', 'team.id'),
    )
    .innerJoin('playStatType', 'playStat.statTypeId', 'playStatType.id')
    .innerJoin('conferenceTeam', (join) =>
      join
        .onRef('conferenceTeam.teamId', '=', 'team.id')
        .onRef('conferenceTeam.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', '>=', eb.ref('game.season')),
            eb('conferenceTeam.endYear', 'is', null),
          ]),
        ),
    )
    .innerJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .select([
      'game.id as gameId',
      'game.season',
      'game.week',
      'team.school as team',
      'conference.name as conference',
      'opponent.school as opponent',
      'drive.id as driveId',
      'play.id as playId',
      'play.period',
      'play.clock',
      'play.down',
      'play.distance',
      'athlete.id as athleteId',
      'athlete.name as athleteName',
      'playStatType.name as statName',
      'playStat.stat',
    ])
    .select((eb) =>
      eb
        .case()
        .when('gt.homeAway', '=', 'home')
        .then(eb.ref('play.homeScore'))
        .else(eb.ref('play.awayScore'))
        .end()
        .as('teamScore'),
    )
    .select((eb) =>
      eb
        .case()
        .when('gt2.homeAway', '=', 'home')
        .then(eb.ref('play.homeScore'))
        .else(eb.ref('play.awayScore'))
        .end()
        .as('opponentScore'),
    )
    .select((eb) =>
      eb
        .case()
        .when(
          eb.or([
            eb.and([
              eb('gt.homeAway', '=', 'home'),
              eb('play.offenseId', '=', eb.ref('team.id')),
            ]),
            eb.and([
              eb('gt.homeAway', '=', 'away'),
              eb('play.defenseId', '=', eb.ref('team.id')),
            ]),
          ]),
        )
        .then(sql<number>`100 - play.yard_line`)
        .else(eb.ref('play.yardLine'))
        .end()
        .as('yardsToGoal'),
    )
    .limit(2000);

  if (year) {
    query = query.where('game.season', '=', year);
  }

  if (week) {
    query = query.where('game.week', '=', week);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (gameId) {
    query = query.where('game.id', '=', gameId);
  }

  if (athleteId) {
    query = query.where('playStat.athleteId', '=', athleteId.toString());
  }

  if (statTypeId) {
    query = query.where('playStat.statTypeId', '=', statTypeId);
  }

  if (seasonType && seasonType !== SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
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

  const results = await query.execute();

  for (const play of results) {
    if (!play.clock.minutes) {
      play.clock.minutes = 0;
    }

    if (!play.clock.seconds) {
      play.clock.seconds = 0;
    }
  }

  return results.map(
    (r): PlayStat => ({
      gameId: r.gameId,
      season: r.season,
      week: r.week,
      team: r.team,
      conference: r.conference,
      opponent: r.opponent,
      teamScore: r.teamScore,
      opponentScore: r.opponentScore,
      driveId: r.driveId,
      playId: r.playId,
      period: r.period,
      clock: {
        minutes: r.clock.minutes ?? null,
        seconds: r.clock.seconds ?? null,
      },
      yardsToGoal: r.yardsToGoal,
      down: r.down,
      distance: r.distance,
      athleteId: r.athleteId,
      athleteName: r.athleteName,
      statType: r.statName,
      stat: r.stat,
    }),
  );
};

export const getPlayStatTypes = async (): Promise<PlayStatType[]> => {
  const types = await kdb
    .selectFrom('playStatType')
    .select(['id', 'name'])
    .execute();

  return types;
};

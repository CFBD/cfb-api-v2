import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import {
  DivisionClassification,
  GameStatus,
  MediaType,
  SeasonType,
} from '../enums';
import {
  CalendarWeek,
  Game,
  GameMedia,
  GamePlayerStatCategories,
  GamePlayerStatPlayer,
  GamePlayerStats,
  GamePlayerStatsTeam,
  GameTeamStats,
  GameTeamStatsTeamStat,
  GameWeather,
  ScoreboardGame,
  TeamRecords,
} from './types';

export const getGames = async (
  year?: number,
  week?: number,
  seasonType?: SeasonType,
  classification?: DivisionClassification,
  team?: string,
  home?: string,
  away?: string,
  conference?: string,
  id?: number,
): Promise<Game[]> => {
  if (!year && !id) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year parameter is required' },
      },
      'Validation error',
    );
  }

  let query = kdb
    .selectFrom('game')
    .innerJoin('gameTeam as hgt', (join) =>
      join.onRef('game.id', '=', 'hgt.gameId').on('hgt.homeAway', '=', 'home'),
    )
    .innerJoin('team as home', 'hgt.teamId', 'home.id')
    .innerJoin('gameTeam as agt', (join) =>
      join.onRef('game.id', '=', 'agt.gameId').on('agt.homeAway', '=', 'away'),
    )
    .innerJoin('team as away', 'agt.teamId', 'away.id')
    .leftJoin('conferenceTeam as hct', (join) =>
      join
        .onRef('home.id', '=', 'hct.teamId')
        .onRef('hct.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('hct.endYear', '>=', eb.ref('game.season')),
            eb('hct.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as hc', 'hct.conferenceId', 'hc.id')
    .leftJoin('conferenceTeam as act', (join) =>
      join
        .onRef('away.id', '=', 'act.teamId')
        .onRef('act.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('act.endYear', '>=', eb.ref('game.season')),
            eb('act.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as ac', 'act.conferenceId', 'ac.id')
    .leftJoin('venue', 'game.venueId', 'venue.id')
    .orderBy('game.season')
    .orderBy('game.seasonType')
    .orderBy('game.week')
    .orderBy('game.startDate')
    .select([
      'game.id',
      'game.season',
      'game.week',
      'game.seasonType',
      'game.startDate',
      'game.startTimeTbd',
      'game.status',
      'game.neutralSite',
      'game.conferenceGame',
      'game.attendance',
      'venue.id as venueId',
      'venue.name as venue',
      'home.id as homeId',
      'home.school as homeTeam',
      'hc.name as homeConference',
      'hc.division as homeClassification',
      'hgt.points as homePoints',
      'hgt.lineScores as homeLineScores',
      'hgt.winProb as homePostWinProb',
      'hgt.startElo as homePregameElo',
      'hgt.endElo as homePostgameElo',
      'away.id as awayId',
      'away.school as awayTeam',
      'ac.name as awayConference',
      'ac.division as awayClassification',
      'agt.points as awayPoints',
      'agt.lineScores as awayLineScores',
      'agt.winProb as awayPostWinProb',
      'agt.startElo as awayPregameElo',
      'agt.endElo as awayPostgameElo',
      'game.excitement',
      'game.highlights',
      'game.notes',
    ]);

  if (id) {
    query = query.where('game.id', '=', id);
  } else if (year) {
    query = query.where('game.season', '=', year);

    if (seasonType && seasonType !== SeasonType.Both) {
      query = query.where('game.seasonType', '=', seasonType);
    }

    if (week) {
      query = query.where('game.week', '=', week);
    }

    if (team) {
      query = query.where((eb) =>
        eb.or([
          eb(eb.fn('lower', ['away.school']), '=', team.toLowerCase()),
          eb(eb.fn('lower', ['home.school']), '=', team.toLowerCase()),
        ]),
      );
    }

    if (home) {
      query = query.where(
        (eb) => eb.fn('lower', ['home.school']),
        '=',
        home.toLowerCase(),
      );
    }

    if (away) {
      query = query.where(
        (eb) => eb.fn('lower', ['away.school']),
        '=',
        away.toLowerCase(),
      );
    }

    if (conference) {
      query = query.where((eb) =>
        eb.or([
          eb(
            eb.fn('lower', ['hc.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
          eb(
            eb.fn('lower', ['ac.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
        ]),
      );
    }

    if (classification) {
      query = query.where((eb) =>
        eb.or([
          eb('hc.division', '=', classification),
          eb('ac.division', '=', classification),
        ]),
      );
    }
  }

  const games = await query.execute();

  return games.map(
    (g): Game => ({
      id: g.id,
      season: g.season,
      week: g.week,
      // @ts-ignore
      seasonType: g.seasonType,
      startDate: g.startDate,
      startTimeTBD: g.startTimeTbd ?? false,
      completed: g.status === 'completed',
      neutralSite: g.neutralSite,
      conferenceGame: g.conferenceGame ?? false,
      attendance: g.attendance,
      venueId: g.venueId,
      venue: g.venue,
      homeId: g.homeId,
      homeTeam: g.homeTeam,
      // @ts-ignore
      homeClassification: g.homeClassification,
      homeConference: g.homeConference,
      homePoints: g.homePoints,
      homeLineScores: g.homeLineScores,
      homePostgameWinProbability: g.homePostWinProb
        ? parseFloat(g.homePostWinProb)
        : null,
      homePregameElo: g.homePregameElo,
      homePostgameElo: g.homePostgameElo,
      awayId: g.awayId,
      awayTeam: g.awayTeam,
      // @ts-ignore
      awayClassification: g.awayClassification,
      awayConference: g.awayConference,
      awayPoints: g.awayPoints,
      awayLineScores: g.awayLineScores,
      awayPostgameWinProbability: g.awayPostWinProb
        ? parseFloat(g.awayPostWinProb)
        : null,
      awayPregameElo: g.awayPregameElo,
      awayPostgameElo: g.awayPostgameElo,
      excitementIndex: g.excitement ? parseFloat(g.excitement) : null,
      highlights: g.highlights
        ? `https://www.youtube.com/watch?v=${g.highlights}`
        : '',
      notes: g.notes,
    }),
  );
};

export const getGameTeamStats = async (
  year?: number,
  week?: number,
  team?: string,
  conference?: string,
  classification?: DivisionClassification,
  seasonType?: SeasonType,
  id?: number,
): Promise<GameTeamStats[]> => {
  if (!year && !id) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year parameter is required' },
      },
      'Validation error',
    );
  } else if (year && !week && !team && !conference) {
    throw new ValidateError(
      {
        week: {
          value: week,
          message: 'either week, team, or conference are required',
        },
        team: {
          value: team,
          message: 'either week, team, or conference are required',
        },
        conference: {
          value: conference,
          message: 'either week, team, or conference are required',
        },
      },
      'Validation error',
    );
  }

  let query = kdb
    .selectFrom('team')
    .innerJoin('gameTeam as gt', 'team.id', 'gt.teamId')
    .innerJoin('game', 'gt.gameId', 'game.id')
    .innerJoin('gameTeam as gt2', (join) =>
      join.onRef('game.id', '=', 'gt2.gameId').onRef('gt2.id', '<>', 'gt.id'),
    )
    .innerJoin('team as t2', 'gt2.teamId', 't2.id')
    .innerJoin('gameTeamStat', 'gt.id', 'gameTeamStat.gameTeamId')
    .innerJoin('teamStatType', 'gameTeamStat.typeId', 'teamStatType.id')
    .leftJoin('conferenceTeam as ct', (join) =>
      join
        .onRef('team.id', '=', 'ct.teamId')
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
      'game.id',
      'gt.homeAway',
      'team.id as teamId',
      'team.school',
      'c.name as conference',
      'gt.points',
      'teamStatType.name',
      'gameTeamStat.stat',
    ]);

  if (id) {
    query = query.where('game.id', '=', id);
  } else if (year) {
    query = query.where('game.season', '=', year);

    if (seasonType && seasonType !== SeasonType.Both) {
      query = query.where('game.seasonType', '=', seasonType);
    }

    if (week) {
      query = query.where('game.week', '=', week);
    }

    if (team) {
      query = query.where((eb) =>
        eb.or([
          eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
          eb(eb.fn('lower', ['t2.school']), '=', team.toLowerCase()),
        ]),
      );
    }

    if (conference) {
      query = query.where((eb) =>
        eb.or([
          eb(eb.fn('lower', ['c.abbreviation']), '=', conference.toLowerCase()),
          eb(
            eb.fn('lower', ['c2.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
        ]),
      );
    }

    if (classification) {
      query = query.where((eb) =>
        eb.or([
          eb('c.division', '=', classification),
          eb('c2.division', '=', classification),
        ]),
      );
    }
  }

  const data = await query.execute();
  let stats = [];

  let ids = Array.from(new Set(data.map((d) => d.id)));
  for (let id of ids) {
    let game: GameTeamStats = {
      id,
      teams: [],
    };

    let gameStats = data.filter((d) => d.id == id);
    let gameTeams = Array.from(new Set(gameStats.map((gs) => gs.school)));

    for (let team of gameTeams) {
      let teamStats = gameStats.filter((gs) => gs.school == team);

      game.teams.push({
        teamId: teamStats[0].teamId,
        team,
        conference: teamStats[0].conference,
        homeAway: teamStats[0].homeAway,
        points: teamStats[0].points,
        stats: teamStats.map((ts): GameTeamStatsTeamStat => {
          return {
            category: ts.name,
            stat: ts.stat,
          };
        }),
      });
    }

    stats.push(game);
  }

  return stats;
};

export const getGamePlayerStats = async (
  year?: number,
  week?: number,
  team?: string,
  conference?: string,
  classification?: DivisionClassification,
  seasonType?: SeasonType,
  category?: string,
  id?: number,
): Promise<GamePlayerStats[]> => {
  if (!year && !id) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year parameter is required' },
      },
      'Validation error',
    );
  } else if (year && !week && !team && !conference) {
    throw new ValidateError(
      {
        week: {
          value: week,
          message: 'either week, team, or conference are required',
        },
        team: {
          value: team,
          message: 'either week, team, or conference are required',
        },
        conference: {
          value: conference,
          message: 'either week, team, or conference are required',
        },
      },
      'Validation error',
    );
  }

  let query = kdb
    .selectFrom('team')
    .innerJoin('gameTeam as gt', 'team.id', 'gt.teamId')
    .innerJoin('game', 'gt.gameId', 'game.id')
    .innerJoin('gameTeam as gt2', (join) =>
      join.onRef('game.id', '=', 'gt2.gameId').onRef('gt2.id', '<>', 'gt.id'),
    )
    .innerJoin('team as t2', 'gt2.teamId', 't2.id')
    .innerJoin('gamePlayerStat', 'gt.id', 'gamePlayerStat.gameTeamId')
    .innerJoin(
      'playerStatCategory',
      'gamePlayerStat.categoryId',
      'playerStatCategory.id',
    )
    .innerJoin('playerStatType', 'gamePlayerStat.typeId', 'playerStatType.id')
    .innerJoin('athlete', 'gamePlayerStat.athleteId', 'athlete.id')
    .leftJoin('conferenceTeam as ct', (join) =>
      join
        .onRef('team.id', '=', 'ct.teamId')
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
      'game.id',
      'gt.homeAway',
      'team.id as teamId',
      'team.school',
      'c.name as conference',
      'gt.points',
      'playerStatCategory.name as cat',
      'playerStatType.name as typ',
      'athlete.id as athleteId',
      'athlete.name as athlete',
      'gamePlayerStat.stat',
    ]);

  if (id) {
    query = query.where('game.id', '=', id);
  } else {
    if (year) {
      query = query.where('game.season', '=', year);
    }

    if (seasonType && seasonType !== SeasonType.Both) {
      query = query.where('game.seasonType', '=', seasonType);
    }

    if (week) {
      query = query.where('game.week', '=', week);
    }

    if (team) {
      query = query.where((eb) =>
        eb.or([
          eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
          eb(eb.fn('lower', ['t2.school']), '=', team.toLowerCase()),
        ]),
      );
    }

    if (conference) {
      query = query.where((eb) =>
        eb.or([
          eb(eb.fn('lower', ['c.abbreviation']), '=', conference.toLowerCase()),
          eb(
            eb.fn('lower', ['c2.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
        ]),
      );
    }

    if (classification) {
      query = query.where((eb) =>
        eb.or([
          eb('c.division', '=', classification),
          eb('c2.division', '=', classification),
        ]),
      );
    }

    if (category) {
      query = query.where(
        (eb) => eb.fn('lower', ['playerStatCategory.name']),
        '=',
        category.toLowerCase(),
      );
    }
  }

  const data = await query.execute();
  const stats = [];

  const ids: number[] = Array.from(new Set(data.map((d) => d.id)));
  for (let id of ids) {
    let game: GamePlayerStats = {
      id,
      teams: [],
    };

    let gameStats = data.filter((d) => d.id == id);
    let gameTeams = Array.from(new Set(gameStats.map((gs) => gs.school)));

    for (let team of gameTeams) {
      let teamStats = gameStats.filter((gs) => gs.school == team);
      let teamRecord: GamePlayerStatsTeam = {
        team,
        conference: teamStats[0].conference,
        homeAway: teamStats[0].homeAway,
        points: teamStats[0].points,
        categories: [],
      };

      let categories = Array.from(new Set(teamStats.map((gs) => gs.cat)));

      for (let category of categories) {
        let categoryStats = teamStats.filter((ts) => ts.cat == category);
        let categoryRecord: GamePlayerStatCategories = {
          name: categoryStats[0].cat,
          types: [],
        };

        let types = Array.from(new Set(categoryStats.map((gs) => gs.typ)));
        for (let statType of types) {
          let typeStats = categoryStats.filter((cs) => cs.typ == statType);
          categoryRecord.types.push({
            name: typeStats[0].typ,
            athletes: typeStats.map((ts): GamePlayerStatPlayer => {
              return {
                id: ts.athleteId,
                name: ts.athlete,
                stat: ts.stat,
              };
            }),
          });
        }

        teamRecord.categories.push(categoryRecord);
      }

      game.teams.push(teamRecord);
    }

    stats.push(game);
  }

  return stats;
};

export const getMedia = async (
  year: number,
  seasonType?: SeasonType,
  week?: number,
  team?: string,
  conference?: string,
  mediaType?: MediaType,
  classification?: DivisionClassification,
): Promise<GameMedia[]> => {
  let query = kdb
    .selectFrom('game')
    .innerJoin('gameMedia', 'game.id', 'gameMedia.gameId')
    .innerJoin('gameTeam as homeTeam', (join) =>
      join
        .onRef('game.id', '=', 'homeTeam.gameId')
        .on('homeTeam.homeAway', '=', 'home'),
    )
    .innerJoin('team as home', 'homeTeam.teamId', 'home.id')
    .leftJoin('conferenceTeam as homeConference', (join) =>
      join
        .onRef('home.id', '=', 'homeConference.teamId')
        .onRef('homeConference.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('homeConference.endYear', '>=', eb.ref('game.season')),
            eb('homeConference.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as hc', 'homeConference.conferenceId', 'hc.id')
    .innerJoin('gameTeam as awayTeam', (join) =>
      join
        .onRef('game.id', '=', 'awayTeam.gameId')
        .on('awayTeam.homeAway', '=', 'away'),
    )
    .innerJoin('team as away', 'awayTeam.teamId', 'away.id')
    .leftJoin('conferenceTeam as awayConference', (join) =>
      join
        .onRef('away.id', '=', 'awayConference.teamId')
        .onRef('awayConference.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('awayConference.endYear', '>=', eb.ref('game.season')),
            eb('awayConference.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as ac', 'awayConference.conferenceId', 'ac.id')
    .select([
      'game.id',
      'game.season',
      'game.week',
      'game.seasonType',
      'game.startDate',
      'game.startTimeTbd',
      'home.school as homeSchool',
      'hc.name as homeConference',
      'away.school as awaySchool',
      'ac.name as awayConference',
      'gameMedia.mediaType',
      'gameMedia.name as outlet',
    ]);

  if (year) {
    query = query.where('game.season', '=', year);
  }

  if (seasonType && seasonType !== SeasonType.Both) {
    query = query.where('game.seasonType', '=', seasonType);
  }

  if (week) {
    query = query.where('game.week', '=', week);
  }

  if (team) {
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['home.school']), '=', team.toLowerCase()),
        eb(eb.fn('lower', ['away.school']), '=', team.toLowerCase()),
      ]),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb.or([
        eb(eb.fn('lower', ['hc.abbreviation']), '=', conference.toLowerCase()),
        eb(eb.fn('lower', ['ac.abbreviation']), '=', conference.toLowerCase()),
      ]),
    );
  }

  if (mediaType) {
    query = query.where('gameMedia.mediaType', '=', mediaType);
  }

  if (classification) {
    query = query.where((eb) =>
      eb.or([
        eb('hc.division', '=', classification),
        eb('ac.division', '=', classification),
      ]),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): GameMedia => ({
      id: r.id,
      season: r.season,
      week: r.week,
      // @ts-ignore
      seasonType: r.seasonType,
      startTime: r.startDate,
      isStartTimeTBD: r.startTimeTbd ?? false,
      homeTeam: r.homeSchool,
      homeConference: r.homeConference,
      awayTeam: r.awaySchool,
      awayConference: r.awayConference,
      // @ts-ignore
      mediaType: r.mediaType,
      outlet: r.outlet,
    }),
  );
};

export const getWeather = async (
  year?: number,
  seasonType?: SeasonType,
  week?: number,
  team?: string,
  conference?: string,
  classification?: DivisionClassification,
  gameId?: number,
): Promise<GameWeather[]> => {
  if (!year && !gameId) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year parameter is required' },
      },
      'Validation error',
    );
  }

  let query = kdb
    .selectFrom('game')
    .innerJoin('venue', 'game.venueId', 'venue.id')
    .innerJoin('gameWeather', 'game.id', 'gameWeather.gameId')
    .innerJoin('gameTeam as homeTeam', (join) =>
      join
        .onRef('game.id', '=', 'homeTeam.gameId')
        .on('homeTeam.homeAway', '=', 'home'),
    )
    .innerJoin('team as home', 'homeTeam.teamId', 'home.id')
    .innerJoin('gameTeam as awayTeam', (join) =>
      join
        .onRef('game.id', '=', 'awayTeam.gameId')
        .on('awayTeam.homeAway', '=', 'away'),
    )
    .innerJoin('team as away', 'awayTeam.teamId', 'away.id')
    .leftJoin('conferenceTeam as homeConference', (join) =>
      join
        .onRef('home.id', '=', 'homeConference.teamId')
        .onRef('homeConference.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('homeConference.endYear', '>=', eb.ref('game.season')),
            eb('homeConference.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as hc', 'homeConference.conferenceId', 'hc.id')
    .leftJoin('conferenceTeam as awayConference', (join) =>
      join
        .onRef('away.id', '=', 'awayConference.teamId')
        .onRef('awayConference.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('awayConference.endYear', '>=', eb.ref('game.season')),
            eb('awayConference.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference as ac', 'awayConference.conferenceId', 'ac.id')
    .leftJoin(
      'weatherCondition',
      'gameWeather.weatherConditionCode',
      'weatherCondition.id',
    )
    .select([
      'game.id',
      'game.season',
      'game.week',
      'game.seasonType',
      'game.startDate',
      'game.startTimeTbd',
      'venue.id as venueId',
      'venue.name as venue',
      'venue.dome',
      'home.school as homeSchool',
      'hc.name as homeConference',
      'away.school as awaySchool',
      'ac.name as awayConference',
      'gameWeather.temperature',
      'gameWeather.dewpoint',
      'gameWeather.humidity',
      'gameWeather.precipitation',
      'gameWeather.snowfall',
      'gameWeather.windSpeed',
      'gameWeather.windDirection',
      'gameWeather.pressure',
      'gameWeather.weatherConditionCode',
      'weatherCondition.description as weatherCondition',
    ]);

  if (gameId) {
    query = query.where('game.id', '=', gameId);
  } else {
    if (year) {
      query = query.where('game.season', '=', year);
    }

    if (seasonType && seasonType !== SeasonType.Both) {
      query = query.where('game.seasonType', '=', seasonType);
    }

    if (week) {
      query = query.where('game.week', '=', week);
    }

    if (team) {
      query = query.where((eb) =>
        eb.or([
          eb(eb.fn('lower', ['home.school']), '=', team.toLowerCase()),
          eb(eb.fn('lower', ['away.school']), '=', team.toLowerCase()),
        ]),
      );
    }

    if (conference) {
      query = query.where((eb) =>
        eb.or([
          eb(
            eb.fn('lower', ['hc.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
          eb(
            eb.fn('lower', ['ac.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
        ]),
      );
    }

    if (classification) {
      query = query.where((eb) =>
        eb.or([
          eb('hc.division', '=', classification),
          eb('ac.division', '=', classification),
        ]),
      );
    }
  }

  const results = await query.execute();

  return results.map(
    (r): GameWeather => ({
      id: r.id,
      season: r.season,
      week: r.week,
      // @ts-ignore
      seasonType: r.seasonType,
      startTime: r.startDate,
      gameIndoors: r.dome ?? false,
      homeTeam: r.homeSchool,
      homeConference: r.homeConference,
      awayTeam: r.awaySchool,
      awayConference: r.awayConference,
      venueId: r.venueId,
      venue: r.venue,
      temperature: r.temperature ? parseFloat(r.temperature) : null,
      dewPoint: r.dewpoint ? parseFloat(r.dewpoint) : null,
      humidity: r.humidity ? parseFloat(r.humidity) : null,
      precipitation: r.precipitation ? parseFloat(r.precipitation) : null,
      snowfall: r.snowfall ? parseFloat(r.snowfall) : null,
      windDirection: r.windDirection ? parseFloat(r.windDirection) : null,
      windSpeed: r.windSpeed ? parseFloat(r.windSpeed) : null,
      pressure: r.pressure ? parseFloat(r.pressure) : null,
      weatherConditionCode: r.weatherConditionCode,
      weatherCondition: r.weatherCondition,
    }),
  );
};

export const getRecords = async (
  year?: number,
  team?: string,
  conference?: string,
): Promise<TeamRecords[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: {
          value: year,
          message: 'year parameter is required when team not specified',
        },
        team: {
          value: team,
          message: 'team parameter is required when year not specified',
        },
      },
      'Validation error',
    );
  }

  let query = kdb
    .selectFrom('game')
    .innerJoin('gameTeam as gt', 'game.id', 'gt.gameId')
    .innerJoin('team as t', 'gt.teamId', 't.id')
    .innerJoin('gameTeam as gt2', (join) =>
      join.onRef('game.id', '=', 'gt2.gameId').onRef('gt2.id', '<>', 'gt.id'),
    )
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
    .innerJoin('conference as c', 'ct.conferenceId', 'c.id')
    .where('game.status', '=', GameStatus.Completed)
    .groupBy([
      'game.season',
      't.id',
      't.school',
      'c.division',
      'c.name',
      'ct.division',
    ])
    .select([
      'game.season',
      't.id as teamId',
      't.school as team',
      'c.division as classification',
      'c.name as conference',
      'ct.division',
    ])
    .select((eb) => eb.fn.countAll().as('games'))
    .select((eb) =>
      eb.fn.countAll().filterWhere('gt.winner', '=', true).as('wins'),
    )
    .select((eb) =>
      eb.fn.countAll().filterWhere('gt2.winner', '=', true).as('losses'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([eb('gt.winner', '<>', true), eb('gt2.winner', '<>', true)]),
        )
        .as('ties'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere('game.conferenceGame', '=', true)
        .as('conferenceGames'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '=', true),
            eb('game.conferenceGame', '=', true),
          ]),
        )
        .as('conferenceWins'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt2.winner', '=', true),
            eb('game.conferenceGame', '=', true),
          ]),
        )
        .as('conferenceLosses'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '<>', true),
            eb('gt2.winner', '<>', true),
            eb('game.conferenceGame', '=', true),
          ]),
        )
        .as('conferenceTies'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.homeAway', '=', 'home'),
            eb('game.neutralSite', '<>', true),
          ]),
        )
        .as('homeGames'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '=', true),
            eb('gt.homeAway', '=', 'home'),
            eb('game.neutralSite', '<>', true),
          ]),
        )
        .as('homeWins'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt2.winner', '=', true),
            eb('gt.homeAway', '=', 'home'),
            eb('game.neutralSite', '<>', true),
          ]),
        )
        .as('homeLosses'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '<>', true),
            eb('gt2.winner', '<>', true),
            eb('gt.homeAway', '=', 'home'),
            eb('game.neutralSite', '<>', true),
          ]),
        )
        .as('homeTies'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.homeAway', '=', 'away'),
            eb('game.neutralSite', '<>', true),
          ]),
        )
        .as('awayGames'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '=', true),
            eb('gt.homeAway', '=', 'away'),
            eb('game.neutralSite', '<>', true),
          ]),
        )
        .as('awayWins'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt2.winner', '=', true),
            eb('gt.homeAway', '=', 'away'),
            eb('game.neutralSite', '<>', true),
          ]),
        )
        .as('awayLosses'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '<>', true),
            eb('gt2.winner', '<>', true),
            eb('gt.homeAway', '=', 'away'),
            eb('game.neutralSite', '<>', true),
          ]),
        )
        .as('awayTies'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere('game.neutralSite', '=', true)
        .as('neutralGames'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '=', true),
            eb('game.neutralSite', '=', true),
          ]),
        )
        .as('neutralWins'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt2.winner', '=', true),
            eb('game.neutralSite', '=', true),
          ]),
        )
        .as('neutralLosses'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '<>', true),
            eb('gt2.winner', '<>', true),
            eb('game.neutralSite', '=', true),
          ]),
        )
        .as('neutralTies'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere('game.seasonType', '=', SeasonType.Regular)
        .as('regularSeasonGames'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '=', true),
            eb('game.seasonType', '=', SeasonType.Regular),
          ]),
        )
        .as('regularSeasonWins'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt2.winner', '=', true),
            eb('game.seasonType', '=', SeasonType.Regular),
          ]),
        )
        .as('regularSeasonLosses'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '<>', true),
            eb('gt2.winner', '<>', true),
            eb('game.seasonType', '=', SeasonType.Regular),
          ]),
        )
        .as('regularSeasonTies'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere('game.seasonType', '=', SeasonType.Postseason)
        .as('postseasonGames'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '=', true),
            eb('game.seasonType', '=', SeasonType.Postseason),
          ]),
        )
        .as('postseasonWins'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt2.winner', '=', true),
            eb('game.seasonType', '=', SeasonType.Postseason),
          ]),
        )
        .as('postseasonLosses'),
    )
    .select((eb) =>
      eb.fn
        .countAll()
        .filterWhere(
          eb.and([
            eb('gt.winner', '<>', true),
            eb('gt2.winner', '<>', true),
            eb('game.seasonType', '=', SeasonType.Postseason),
          ]),
        )
        .as('postseasonTies'),
    )
    .select((eb) => eb.fn.sum('gt.winProb').as('expectedWins'));

  if (year) {
    query = query.where('game.season', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['t.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['c.abbreviation']), '=', conference.toLowerCase()),
    );
  }

  const results = await query.execute();

  const intParseOrConvert = (n: string | number | bigint): number =>
    typeof n === 'number' || typeof n === 'bigint'
      ? (n as number)
      : parseInt(n);

  return results.map(
    (r): TeamRecords => ({
      year: r.season,
      teamId: r.teamId,
      team: r.team,
      // @ts-ignore
      classification: r.classification,
      conference: r.conference,
      division: r.division || '',
      expectedWins:
        typeof r.expectedWins === 'number' || typeof r.expectedWins === 'bigint'
          ? (r.expectedWins as number)
          : parseFloat(r.expectedWins),
      total: {
        games: intParseOrConvert(r.games),
        wins: intParseOrConvert(r.wins),
        losses: intParseOrConvert(r.losses),
        ties: intParseOrConvert(r.ties),
      },
      conferenceGames: {
        games: intParseOrConvert(r.conferenceGames),
        wins: intParseOrConvert(r.conferenceWins),
        losses: intParseOrConvert(r.conferenceLosses),
        ties: intParseOrConvert(r.conferenceTies),
      },
      homeGames: {
        games: intParseOrConvert(r.homeGames),
        wins: intParseOrConvert(r.homeWins),
        losses: intParseOrConvert(r.homeLosses),
        ties: intParseOrConvert(r.homeTies),
      },
      awayGames: {
        games: intParseOrConvert(r.awayGames),
        wins: intParseOrConvert(r.awayWins),
        losses: intParseOrConvert(r.awayLosses),
        ties: intParseOrConvert(r.awayTies),
      },
      neutralSiteGames: {
        games: intParseOrConvert(r.neutralGames),
        wins: intParseOrConvert(r.neutralWins),
        losses: intParseOrConvert(r.neutralLosses),
        ties: intParseOrConvert(r.neutralTies),
      },
      regularSeason: {
        games: intParseOrConvert(r.regularSeasonGames),
        wins: intParseOrConvert(r.regularSeasonWins),
        losses: intParseOrConvert(r.regularSeasonLosses),
        ties: intParseOrConvert(r.regularSeasonTies),
      },
      postseason: {
        games: intParseOrConvert(r.postseasonGames),
        wins: intParseOrConvert(r.postseasonWins),
        losses: intParseOrConvert(r.postseasonLosses),
        ties: intParseOrConvert(r.postseasonTies),
      },
    }),
  );
};

export const getCalendar = async (year: number): Promise<CalendarWeek[]> => {
  const weeks = await kdb
    .selectFrom('calendar')
    .where('year', '=', year)
    .select(['week', 'seasonType', 'startDate', 'endDate'])
    .orderBy(['seasonType', 'week'])
    .execute();

  return weeks.map(
    (w): CalendarWeek => ({
      season: year,
      week: w.week,
      // @ts-ignore
      seasonType: w.seasonType,
      startDate: w.startDate,
      endDate: w.endDate,
      firstGameStart: w.startDate,
      lastGameStart: w.endDate,
    }),
  );
};

export const getScoreboard = async (
  classification: DivisionClassification = DivisionClassification.FBS,
  conference?: string,
): Promise<ScoreboardGame[]> => {
  let query = kdb
    .selectFrom('scoreboard')
    .where((eb) =>
      eb.or([
        eb('homeClassification', '=', classification),
        eb('awayClassification', '=', classification),
      ]),
    )
    .selectAll();

  if (conference) {
    query = query.where((eb) =>
      eb.or([
        eb(
          eb.fn('lower', ['homeConferenceAbbreviation']),
          '=',
          conference.toLowerCase(),
        ),
        eb(
          eb.fn('lower', ['awayConferenceAbbreviation']),
          '=',
          conference.toLowerCase(),
        ),
      ]),
    );
  }

  const scoreboard = await query.execute();

  return scoreboard.map(
    (s): ScoreboardGame => ({
      id: s.id,
      startDate: s.startDate,
      startTimeTBD: s.startTimeTbd ?? false,
      tv: s.tv,
      neutralSite: s.neutralSite,
      conferenceGame: s.conferenceGame ?? false,
      // @ts-ignore
      status: s.status,
      period: s.currentPeriod,
      clock: s.currentClock ? String(s.currentClock).substring(3) : null,
      situation: s.currentSituation,
      possession: s.currentPossession,
      lastPlay: s.lastPlay,
      venue: {
        name: s.venue,
        city: s.city,
        state: s.state,
      },
      homeTeam: {
        id: s.homeId,
        name: s.homeTeam,
        conference: s.homeConference,
        // @ts-ignore
        classification: s.homeClassification,
        points: s.homePoints,
        lineScores: s.homeLineScores,
      },
      awayTeam: {
        id: s.awayId,
        name: s.awayTeam,
        conference: s.awayConference,
        // @ts-ignore
        classification: s.awayClassification,
        points: s.awayPoints,
        lineScores: s.awayLineScores,
      },
      weather: {
        temperature: s.temperature ? parseFloat(s.temperature) : null,
        description: s.weatherDescription,
        windSpeed: s.windSpeed ? parseFloat(s.windSpeed) : null,
        windDirection: s.windDirection ? parseFloat(s.windDirection) : null,
      },
      betting: {
        spread: s.spread ? parseFloat(s.spread) : null,
        overUnder: s.overUnder ? parseFloat(s.overUnder) : null,
        homeMoneyline: s.moneylineHome,
        awayMoneyline: s.moneylineAway,
      },
    }),
  );
};

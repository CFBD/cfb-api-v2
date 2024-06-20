import { ValidateError } from 'tsoa';
import { db } from '../../config/database';
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

  let filter;
  let params: any[];

  if (id) {
    filter = 'WHERE g.id = $1';
    params = [id];
  } else {
    params = [year];
    const filters: string[] = ['g.season = $1'];
    let index = 2;

    if (seasonType && seasonType !== SeasonType.Both) {
      filters.push(`g.season_type = $${index}`);
      params.push(seasonType);
      index++;
    }

    if (week) {
      filters.push(`g.week = $${index}`);
      params.push(week);
      index++;
    }

    if (team) {
      filters.push(
        `(LOWER(away.school) = LOWER($${index}) OR LOWER(home.school) = LOWER($${index}))`,
      );
      params.push(team);
      index++;
    }

    if (home) {
      filters.push(`LOWER(home.school) = LOWER($${index})`);
      params.push(home);
      index++;
    }

    if (away) {
      filters.push(`LOWER(away.school) = LOWER($${index})`);
      params.push(away);
      index++;
    }

    if (conference) {
      filters.push(
        `(LOWER(hc.abbreviation) = LOWER($${index}) OR LOWER(ac.abbreviation) = LOWER($${index}))`,
      );
      params.push(conference);
      index++;
    }

    if (classification) {
      filters.push(`(hc.division = $${index} OR ac.division = $${index})`);
      params.push(classification);
      index++;
    }

    filter = `WHERE ${filters.join(' AND ')}`;
  }

  const games = await db.any(
    `
          SELECT g.id, g.season, g.week, g.season_type, g.start_date, g.start_time_tbd, (g.status = 'completed') AS completed, g.neutral_site, g.conference_game, g.attendance, v.id as venue_id, v.name as venue, home.id as home_id, home.school as home_team, hc.name as home_conference, hc.division as home_division, gt.points as home_points, gt.line_scores as home_line_scores, gt.win_prob AS home_post_win_prob, gt.start_elo AS home_pregame_elo, gt.end_elo AS home_postgame_elo, away.id AS away_id, away.school as away_team, ac.name as away_conference, ac.division as away_division, gt2.points as away_points, gt2.line_scores as away_line_scores, gt2.win_prob AS away_post_win_prob, gt2.start_elo AS away_pregame_elo, gt2.end_elo AS away_postgame_elo, g.excitement as excitement_index, 'https://www.youtube.com/watch?v=' || g.highlights AS highlights, g.notes
          FROM game g
              INNER JOIN game_team gt ON g.id = gt.game_id AND gt.home_away = 'home'
              INNER JOIN team home ON gt.team_id = home.id
              LEFT JOIN conference_team hct ON home.id = hct.team_id AND (hct.start_year IS NULL OR hct.start_year <= g.season) AND (hct.end_year >= g.season OR hct.end_year IS NULL)
              LEFT JOIN conference hc ON hct.conference_id = hc.id
              INNER JOIN game_team gt2 ON g.id = gt2.game_id AND gt2.home_away = 'away'
              INNER JOIN team away ON gt2.team_id = away.id
              LEFT JOIN conference_team act ON away.id = act.team_id AND (act.start_year IS NULL OR act.start_year <= g.season) AND (act.end_year >= g.season OR act.end_year IS NULL)
              LEFT JOIN conference ac ON act.conference_id = ac.id
              LEFT JOIN venue v ON g.venue_id = v.id
          ${filter}
          ORDER BY g.season, g.week, g.start_date
  `,
    params,
  );

  return games.map(
    (g): Game => ({
      id: g.id,
      season: g.season,
      week: g.week,
      seasonType: g.season_type,
      startDate: g.start_date,
      startTimeTBD: g.start_time_tbd,
      completed: g.completed,
      neutralSite: g.neutral_site,
      conferenceGame: g.conference_game,
      attendance: g.attendance,
      venueId: g.venue_id,
      venue: g.venue,
      homeId: g.home_id,
      homeTeam: g.home_team,
      homeConference: g.home_conference,
      homeDivision: g.home_division,
      homePoints: g.home_points,
      homeLineScores: g.home_line_scores,
      homePostgameWinProbability: g.home_post_win_prob,
      homePregameElo: g.home_pregame_elo,
      homePostgameElo: g.home_postgame_elo,
      awayId: g.away_id,
      awayTeam: g.away_team,
      awayConference: g.away_conference,
      awayDivision: g.away_division,
      awayPoints: g.away_points,
      awayLineScores: g.away_line_scores,
      awayPostgameWinProbability: g.away_post_win_prob,
      awayPregameElo: g.away_pregame_elo,
      awayPostgameElo: g.away_postgame_elo,
      excitementIndex: g.excitement_index,
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

  let filter;
  let params: any[];

  if (id) {
    filter = 'WHERE g.id = $1';
    params = [id];
  } else {
    params = [year];
    const filters: string[] = ['g.season = $1'];
    let index = 2;

    if (seasonType && seasonType !== SeasonType.Both) {
      filters.push(`g.season_type = $${index}`);
      params.push(seasonType);
      index++;
    }

    if (week) {
      filters.push(`g.week = $${index}`);
      params.push(week);
      index++;
    }

    if (team) {
      filters.push(
        `(LOWER(t.school) = LOWER($${index}) OR LOWER(t2.school) = LOWER($${index}))`,
      );
      params.push(team);
      index++;
    }

    if (conference) {
      filters.push(
        `(LOWER(c.abbreviation) = LOWER($${index}) OR LOWER(c2.abbreviation) = LOWER($${index}))`,
      );
      params.push(conference);
      index++;
    }

    if (classification) {
      filters.push(`(c.division = $${index} OR c2.division = $${index})`);
      params.push(classification);
      index++;
    }

    filter = `WHERE ${filters.join(' AND ')}`;
  }

  const data = await db.any(
    `
                                SELECT g.id, gt.home_away, t.id AS team_id, t.school, c.name as conference, gt.points, tst.name, gts.stat
                                FROM team t
                                    INNER JOIN game_team gt ON t.id = gt.team_id
                                    INNER JOIN game g ON gt.game_id = g.id
                                    LEFT JOIN conference_team ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
                                    LEFT JOIN conference c ON ct.conference_id = c.id
                                    INNER JOIN game_team gt2 ON g.id = gt2.game_id AND gt2.id <> gt.id
                                    INNER JOIN team t2 ON gt2.team_id = t2.id
                                    LEFT JOIN conference_team ct2 ON t2.id = ct2.team_id AND ct2.start_year <= g.season AND (ct2.end_year >= g.season OR ct2.end_year IS NULL)
                                    LEFT JOIN conference c2 ON ct2.conference_id = c2.id
                                    INNER JOIN game_team_stat gts ON gts.game_team_id = gt.id
                                    INNER JOIN team_stat_type tst ON gts.type_id = tst.id
                                ${filter}
                            `,
    params,
  );

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
        teamId: teamStats[0].team_id,
        team,
        conference: teamStats[0].conference,
        homeAway: teamStats[0].home_away,
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

  let filter;
  let params: any[];

  if (id) {
    filter = 'WHERE g.id = $1';
    params = [id];
  } else {
    params = [year];
    const filters: string[] = ['g.season = $1'];
    let index = 2;

    if (seasonType && seasonType !== SeasonType.Both) {
      filters.push(`g.season_type = $${index}`);
      params.push(seasonType);
      index++;
    }

    if (week) {
      filters.push(`g.week = $${index}`);
      params.push(week);
      index++;
    }

    if (team) {
      filters.push(
        `(LOWER(t.school) = LOWER($${index}) OR LOWER(t2.school) = LOWER($${index}))`,
      );
      params.push(team);
      index++;
    }

    if (conference) {
      filters.push(
        `(LOWER(c.abbreviation) = LOWER($${index}) OR LOWER(c2.abbreviation) = LOWER($${index}))`,
      );
      params.push(conference);
      index++;
    }

    if (classification) {
      filters.push(`(c.division = $${index} OR c2.division = $${index})`);
      params.push(classification);
      index++;
    }

    if (category) {
      filters.push(`LOWER(cat.name) = LOWER($${index})`);
      params.push(category);
      index++;
    }

    filter = `WHERE ${filters.join(' AND ')}`;
  }

  let data = await db.any(
    `
                                SELECT g.id, gt.home_away, t.school, c.name as conference, gt.points, cat.name as cat, typ.name as typ, a.id as athlete_id, a.name as athlete, gps.stat
                                FROM team t
                                    INNER JOIN game_team gt ON t.id = gt.team_id
                                    INNER JOIN game g ON gt.game_id = g.id
                                    LEFT JOIN conference_team ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
                                    LEFT JOIN conference c ON ct.conference_id = c.id
                                    INNER JOIN game_team gt2 ON g.id = gt2.game_id AND gt2.id <> gt.id
                                    INNER JOIN team t2 ON gt2.team_id = t2.id
                                    LEFT JOIN conference_team ct2 ON t2.id = ct2.team_id AND ct2.start_year <= g.season AND (ct2.end_year >= g.season OR ct2.end_year IS NULL)
                                    LEFT JOIN conference c2 ON ct2.conference_id = c2.id
                                    INNER JOIN game_player_stat gps ON gps.game_team_id = gt.id
                                    INNER JOIN player_stat_category cat ON gps.category_id = cat.id
                                    INNER JOIN player_stat_type typ ON gps.type_id = typ.id
                                    INNER JOIN athlete a ON gps.athlete_id = a.id
                                    ${filter}
                            `,
    params,
  );

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
        homeAway: teamStats[0].home_away,
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
                id: ts.athlete_id,
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
  const filters = [];
  const params = [];
  let index = 1;

  if (year) {
    filters.push(`g.season = $${index}`);
    params.push(year);
    index++;
  }

  if (seasonType && seasonType !== SeasonType.Both) {
    filters.push(`g.season_type = $${index}`);
    params.push(seasonType);
    index++;
  }

  if (week) {
    filters.push(`g.week = $${index}`);
    params.push(week);
    index++;
  }

  if (team) {
    filters.push(
      `(LOWER(home.school) = LOWER($${index}) OR LOWER(away.school) = LOWER($${index}))`,
    );
    params.push(team);
    index++;
  }

  if (conference) {
    filters.push(
      `(LOWER(hc.abbreviation) = LOWER($${index}) OR LOWER(ac.abbreviation) = LOWER($${index}))`,
    );
    params.push(conference);
    index++;
  }

  if (mediaType) {
    filters.push(`gm.media_type = $${index}`);
    params.push(mediaType.toLowerCase());
    index++;
  }

  if (classification) {
    filters.push(`(hc.division = $${index} OR ac.division = $${index})`);
    params.push(classification);
    index++;
  }

  const filter = `WHERE ${filters.join(' AND ')}`;

  const results = await db.any(
    `
            SELECT g.id, g.season, g.week, g.season_type, g.start_date, g.start_time_tbd, home.school AS home_school, hc.name AS home_conference, away.school AS away_school, ac.name AS away_conference, gm.media_type, gm.name AS outlet
            FROM game AS g
                INNER JOIN game_media AS gm ON g.id = gm.game_id
                INNER JOIN game_team AS home_team ON g.id = home_team.game_id AND home_team.home_away = 'home'
                INNER JOIN team AS home ON home_team.team_id = home.id
                LEFT JOIN conference_team AS hct ON home.id = hct.team_id AND hct.start_year <= g.season AND (hct.end_year IS NULL OR hct.end_year >= g.season)
                LEFT JOIN conference AS hc ON hct.conference_id = hc.id
                INNER JOIN game_team AS away_team ON g.id = away_team.game_id AND away_team.home_away = 'away'
                INNER JOIN team AS away ON away_team.team_id = away.id
                LEFT JOIN conference_team AS act ON away.id = act.team_id AND act.start_year <= g.season AND (act.end_year IS NULL OR act.end_year >= g.season)
                LEFT JOIN conference AS ac ON act.conference_id = ac.id
            ${filter}
        `,
    params,
  );

  return results.map(
    (r): GameMedia => ({
      id: r.id,
      season: r.season,
      week: r.week,
      seasonType: r.season_type,
      startTime: r.start_date,
      isStartTimeTBD: r.start_time_tbd,
      homeTeam: r.home_school,
      homeConference: r.home_conference,
      awayTeam: r.away_school,
      awayConference: r.away_conference,
      mediaType: r.media_type,
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

  const filters = [];
  const params = [];
  let index = 1;

  if (gameId) {
    filters.push(`g.id = $${index}`);
    params.push(gameId);
  } else {
    if (year) {
      filters.push(`g.season = $${index}`);
      params.push(year);
      index++;
    }

    if (seasonType && seasonType !== SeasonType.Both) {
      filters.push(`g.season_type = $${index}`);
      params.push(seasonType);
      index++;
    }

    if (week) {
      filters.push(`g.week = $${index}`);
      params.push(week);
      index++;
    }

    if (team) {
      filters.push(
        `(LOWER(home.school) = LOWER($${index}) OR LOWER(away.school) = LOWER($${index}))`,
      );
      params.push(team);
      index++;
    }

    if (conference) {
      filters.push(
        `(LOWER(hc.abbreviation) = LOWER($${index}) OR LOWER(ac.abbreviation) = LOWER($${index}))`,
      );
      params.push(conference);
      index++;
    }

    if (classification) {
      filters.push(`(hc.division = $${index} OR ac.division = $${index})`);
      params.push(classification.toLowerCase());
      index++;
    }
  }

  const filter = `WHERE ${filters.join(' AND ')}`;

  const results = await db.any(
    `
            SELECT g.id, g.season, g.week, g.season_type, g.start_date, v.dome, home.school AS home_school, hc.name AS home_conference, away.school AS away_school, ac.name AS away_conference, v.id AS venue_id, v.name AS venue, w.temperature, w.dewpoint, w.humidity, w.precipitation, w.snowfall, w.wind_direction, w.wind_speed, w.pressure, w.weather_condition_code, wc.description AS weather_condition
            FROM game AS g
                INNER JOIN venue AS v ON g.venue_id = v.id
                INNER JOIN game_weather AS w ON g.id = w.game_id
                INNER JOIN game_team AS home_team ON g.id = home_team.game_id AND home_team.home_away = 'home'
                INNER JOIN team AS home ON home_team.team_id = home.id
                LEFT JOIN conference_team AS hct ON home.id = hct.team_id AND hct.start_year <= g.season AND (hct.end_year IS NULL OR hct.end_year >= g.season)
                LEFT JOIN conference AS hc ON hct.conference_id = hc.id
                INNER JOIN game_team AS away_team ON g.id = away_team.game_id AND away_team.home_away = 'away'
                INNER JOIN team AS away ON away_team.team_id = away.id
                LEFT JOIN conference_team AS act ON away.id = act.team_id AND act.start_year <= g.season AND (act.end_year IS NULL OR act.end_year >= g.season)
                LEFT JOIN conference AS ac ON act.conference_id = ac.id
                LEFT JOIN weather_condition AS wc ON w.weather_condition_code = wc.id
            ${filter}
        `,
    params,
  );

  return results.map(
    (r): GameWeather => ({
      id: parseInt(r.id),
      season: parseInt(r.season),
      week: parseInt(r.week),
      seasonType: r.season_type,
      startTime: r.start_date,
      gameIndoors: r.dome,
      homeTeam: r.home_school,
      homeConference: r.home_conference,
      awayTeam: r.away_school,
      awayConference: r.away_conference,
      venueId: parseInt(r.venue_id),
      venue: r.venue,
      temperature: r.temperature ? parseFloat(r.temperature) : null,
      dewPoint: r.dew_point ? parseFloat(r.dew_point) : null,
      humidity: r.humidity ? parseFloat(r.humidity) : null,
      precipitation: parseFloat(r.precipitation),
      snowfall: parseFloat(r.snowfall),
      windDirection: r.wind_direction ? parseFloat(r.wind_direction) : null,
      windSpeed: r.wind_speed ? parseFloat(r.wind_speed) : null,
      pressure: r.pressure ? parseFloat(r.pressure) : null,
      weatherConditionCode: r.weather_condition_code
        ? parseInt(r.weather_condition_code)
        : null,
      weatherCondition: r.weather_condition,
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

  const filters: string[] = ['g.status = $1'];
  const params: any[] = [GameStatus.Completed];
  let index = 2;

  if (year) {
    filters.push(`g.season = $${index}`);
    params.push(year);
    index++;
  }

  if (team) {
    filters.push(`LOWER(t.school) = LOWER($${index})`);
    params.push(team);
    index++;
  }

  if (conference) {
    filters.push(`LOWER(c.abbreviation) = LOWER($${index})`);
    params.push(conference);
    index++;
  }

  const filter = `WHERE ${filters.join(' AND ')}`;

  const results = await db.any(
    `
                SELECT 	g.season,
                        t.id AS team_id,
                        t.school AS team,
                        c.division as classification,
                        c.name AS conference,
                        ct.division,
                        COUNT(*) AS games,
                        COUNT(*) FILTER(WHERE gt.winner = true) AS wins,
                        COUNT(*) FILTER(WHERE gt2.winner = true) AS losses,
                        COUNT(*) FILTER(WHERE gt.winner <> true AND gt2.winner <> true) AS "ties",
                        COUNT(*) FILTER(WHERE g.conference_game = true) AS conference_games,
                        COUNT(*) FILTER(WHERE gt.winner = true AND g.conference_game = true) AS conference_wins,
                        COUNT(*) FILTER(WHERE gt2.winner = true AND g.conference_game = true) AS conference_losses,
                        COUNT(*) FILTER(WHERE gt.winner <> true AND gt2.winner <> true AND g.conference_game = true) AS conference_ties,
                        COUNT(*) FILTER(WHERE gt.home_away = 'home' AND g.neutral_site <> true) AS home_games,
                        COUNT(*) FILTER(WHERE gt.winner = true AND gt.home_away = 'home' AND g.neutral_site <> true) AS home_wins,
                        COUNT(*) FILTER(WHERE gt2.winner = true AND gt.home_away = 'home' AND g.neutral_site <> true) AS home_losses,
                        COUNT(*) FILTER(WHERE gt.winner <> true AND gt2.winner <> true AND gt.home_away = 'home' AND g.neutral_site <> true) AS home_ties,
                        COUNT(*) FILTER(WHERE gt.home_away = 'away' AND g.neutral_site <> true) AS away_games,
                        COUNT(*) FILTER(WHERE gt.winner = true AND gt.home_away = 'away' AND g.neutral_site <> true) AS away_wins,
                        COUNT(*) FILTER(WHERE gt2.winner = true AND gt.home_away = 'away' AND g.neutral_site <> true) AS away_losses,
                        COUNT(*) FILTER(WHERE gt.winner <> true AND gt2.winner <> true AND gt.home_away = 'away' AND g.neutral_site <> true) AS away_ties,
                        COUNT(*) FILTER(WHERE g.neutral_site = true) AS neutral_games,
                        COUNT(*) FILTER(WHERE gt.winner = true AND g.neutral_site = true) AS neutral_wins,
                        COUNT(*) FILTER(WHERE gt2.winner = true AND g.neutral_site = true) AS neutral_losses,
                        COUNT(*) FILTER(WHERE gt.winner <> true AND gt2.winner <> true AND g.neutral_site = true) AS neutral_ties,
                        SUM(gt.win_prob) AS expected_wins
                FROM game AS g
                    INNER JOIN game_team AS gt ON g.id = gt.game_id
                    INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt2.id <> gt.id
                    INNER JOIN team AS t ON gt.team_id = t.id
                    INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
                    INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
                ${filter}
                GROUP BY g.season, t.id, t.school, c.division, c.name, ct.division
                `,
    params,
  );

  return results.map(
    (r): TeamRecords => ({
      year: r.season,
      teamId: r.team_id,
      team: r.team,
      classification: r.classification,
      conference: r.conference,
      division: r.division || '',
      expectedWins: Math.round(parseFloat(r.expected_wins) * 10) / 10,
      total: {
        games: parseInt(r.games),
        wins: parseInt(r.wins),
        losses: parseInt(r.losses),
        ties: parseInt(r.ties),
      },
      conferenceGames: {
        games: parseInt(r.conference_games),
        wins: parseInt(r.conference_wins),
        losses: parseInt(r.conference_losses),
        ties: parseInt(r.conference_ties),
      },
      homeGames: {
        games: parseInt(r.home_games),
        wins: parseInt(r.home_wins),
        losses: parseInt(r.home_losses),
        ties: parseInt(r.home_ties),
      },
      awayGames: {
        games: parseInt(r.away_games),
        wins: parseInt(r.away_wins),
        losses: parseInt(r.away_losses),
        ties: parseInt(r.away_ties),
      },
      neutralSiteGames: {
        games: parseInt(r.neutral_games),
        wins: parseInt(r.neutral_wins),
        losses: parseInt(r.neutral_losses),
        ties: parseInt(r.neutral_ties),
      },
    }),
  );
};

export const getCalendar = async (year: number): Promise<CalendarWeek[]> => {
  const weeks = await db.any(
    `
            SELECT g.week, g.season_type, MIN(g.start_date) AS first_game_start, MAX(g.start_date) AS last_game_start
            FROM game AS g
            WHERE g.season = $1
            GROUP BY g.week, g.season_type
            ORDER BY g.season_type, g.week
        `,
    [year],
  );

  return weeks.map(
    (w): CalendarWeek => ({
      season: year,
      week: w.week,
      seasonType: w.season_type,
      firstGameStart: w.first_game_start,
      lastGameStart: w.last_game_start,
    }),
  );
};

export const getScoreboard = async (
  classification: DivisionClassification = DivisionClassification.FBS,
  conference?: string,
): Promise<ScoreboardGame[]> => {
  let filters = [];
  let filterParams = [];
  let filterIndex = 1;

  filterParams.push(classification.toLowerCase());
  filters.push(
    `(c.division = $${filterIndex} OR c2.division = $${filterIndex})`,
  );
  filterIndex++;

  if (conference) {
    filterParams.push(conference.toLowerCase());
    filters.push(
      `(LOWER(c.abbreviation) = $${filterIndex} OR LOWER(c2.abbreviation) = $${filterIndex})`,
    );
    filterIndex++;
  }

  let filterClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  let scoreboard = await db.any(
    `
        WITH this_week AS (
            SELECT DISTINCT g.id, g.season, g.season_type, g.week
            FROM game AS g
                INNER JOIN game_team AS gt ON g.id = gt.game_id
                INNER JOIN current_conferences AS cc ON gt.team_id = cc.team_id AND cc.classification = $1
            WHERE g.start_date > (now() - interval '2d')
            ORDER BY g.season, g.season_type, g.week
            LIMIT 1

        )
        SELECT g.id,
            g.start_date AT TIME ZONE 'UTC' AS start_date,
            g.start_time_tbd,
            g.status,
            g.neutral_site,
            g.conference_game,
            v.name AS venue,
            v.city,
            v.state,
            t.id AS home_id,
            t.display_name AS home_team,
            c.division AS home_classification,
            c.name AS home_conference,
            CASE WHEN g.status = 'completed' THEN gt.points ELSE g.current_home_score END AS home_points,
            t2.id AS away_id,
            t2.display_name AS away_team,
            c2.name AS away_conference,
            c2.division AS away_classification,
            CASE WHEN g.status = 'completed' THEN gt2.points ELSE g.current_away_score END AS away_points,
            g.current_period,
            CAST(g.current_clock AS CHARACTER VARYING) AS current_clock,
            g.current_situation,
            g.current_possession,
            COALESCE(gm.name, gm2.name) AS tv,
            gw.temperature,
            gw.wind_speed,
            gw.wind_direction,
            wc.description AS weather_description,
            gl.spread,
            gl.over_under,
            gl.moneyline_home,
            gl.moneyline_away
        FROM game AS g
            INNER JOIN this_week AS tw ON g.season = tw.season AND g.week = tw.week AND g.season_type = tw.season_type
            INNER JOIN game_team AS gt ON g.id = gt.game_id AND gt.home_away = 'home'
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
            INNER JOIN team AS t2 ON gt2.team_id = t2.id
            INNER JOIN venue AS v ON g.venue_id = v.id
            LEFT JOIN conference_team AS ct ON t.id = ct.team_id AND ct.end_year IS NULL
            LEFT JOIN conference AS c ON ct.conference_id = c.id
            LEFT JOIN conference_team AS ct2 ON t2.id = ct2.team_id AND ct2.end_year IS NULL
            LEFT JOIN conference AS c2 ON ct2.conference_id = c2.id
            LEFT JOIN game_media AS gm ON g.id = gm.game_id AND gm.media_type = 'tv'
            LEFT JOIN game_media AS gm2 ON g.id = gm2.game_id AND gm.id <> gm2.id AND gm2.media_type = 'web'
            LEFT JOIN game_weather AS gw ON g.id = gw.game_id
            LEFT JOIN weather_condition AS wc ON gw.weather_condition_code = wc.id
            LEFT JOIN game_lines AS gl ON g.id = gl.game_id AND gl.lines_provider_id = 999999
        ${filterClause}
        ORDER BY g.start_date
        `,
    filterParams,
  );

  return scoreboard.map(
    (s): ScoreboardGame => ({
      id: parseInt(s.id),
      startDate: s.start_date,
      startTimeTBD: s.start_time_tbd,
      tv: s.tv,
      neutralSite: s.neutral_site,
      conferenceGame: s.conference_game,
      status: s.status,
      period: parseInt(s.current_period),
      clock: s.current_clock,
      situation: s.current_situation,
      possession: s.current_possession,
      venue: {
        name: s.venue,
        city: s.city,
        state: s.state,
      },
      homeTeam: {
        id: s.home_id,
        name: s.home_team,
        conference: s.home_conference,
        classification: s.home_classification,
        points: s.home_points,
      },
      awayTeam: {
        id: s.away_id,
        name: s.away_team,
        conference: s.away_conference,
        classification: s.away_classification,
        points: s.away_points,
      },
      weather: {
        temperature: s.temperature,
        description: s.weather_description,
        windSpeed: s.wind_speed,
        windDirection: s.wind_direction,
      },
      betting: {
        spread: s.spread,
        overUnder: s.over_under,
        homeMoneyline: s.moneyline_home,
        awayMoneyline: s.moneyline_away,
      },
    }),
  );
};

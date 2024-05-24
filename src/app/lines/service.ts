import { ValidateError } from 'tsoa';
import { db } from '../../config/database';
import { SeasonType } from '../enums';
import { BettingGame, GameLine } from './types';

export const getLines = async (
  gameId?: number,
  year?: number,
  seasonType?: SeasonType,
  week?: number,
  team?: string,
  home?: string,
  away?: string,
  conference?: string,
): Promise<BettingGame[]> => {
  if (!year && !gameId) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required' },
      },
      'Validation error',
    );
  }

  let filter: string;
  let params: any[];

  if (gameId) {
    filter = 'WHERE g.id = $1';
    params = [gameId];
  } else {
    const filters = ['g.season = $1'];
    params = [year];
    let index = 2;

    if (seasonType && seasonType != SeasonType.Both) {
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
        `(LOWER(awt.school) = LOWER($${index}) OR LOWER(ht.school) = LOWER($${index}))`,
      );
      params.push(team);
      index++;
    }

    if (home) {
      filters.push(`LOWER(ht.school) = LOWER($${index})`);
      params.push(home);
      index++;
    }

    if (away) {
      filters.push(`LOWER(awt.school) = LOWER($${index})`);
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

    filter = `WHERE ${filters.join(' AND ')}`;
  }

  const games = await db.any(
    `
                SELECT g.id, g.season, g.week, g.season_type, g.start_date, ht.school AS home_team, hc.name AS home_conference, hgt.points AS home_score, awt.school AS away_team, ac.name AS away_conference, agt.points AS away_score
                FROM game AS g
                    INNER JOIN game_team AS hgt ON hgt.game_id = g.id AND hgt.home_away = 'home'
                    INNER JOIN team AS ht ON hgt.team_id = ht.id
                    LEFT JOIN conference_team hct ON ht.id = hct.team_id AND hct.start_year <= g.season AND (hct.end_year >= g.season OR hct.end_year IS NULL)
                    LEFT JOIN conference hc ON hct.conference_id = hc.id
                    INNER JOIN game_team AS agt ON agt.game_id = g.id AND agt.home_away = 'away'
                    INNER JOIN team AS awt ON agt.team_id = awt.id
                    LEFT JOIN conference_team act ON awt.id = act.team_id AND act.start_year <= g.season AND (act.end_year >= g.season OR act.end_year IS NULL)
                    LEFT JOIN conference ac ON act.conference_id = ac.id
                ${filter}
            `,
    params,
  );

  const gameIds = games.map((g) => g.id);
  if (!gameIds.length) {
    return [];
  }

  const lines = await db.any(
    `
                SELECT g.id, p.name, gl.spread, gl.spread_open, gl.over_under, gl.over_under_open, gl.moneyline_home, gl.moneyline_away
                FROM game AS g
                    INNER JOIN game_lines AS gl ON g.id = gl.game_id
                    INNER JOIN lines_provider AS p ON gl.lines_provider_id = p.id
                WHERE g.id IN ($1:list)
            `,
    [gameIds],
  );

  const results = games.map((g): BettingGame => {
    const gameLines = lines
      .filter((l) => l.id == g.id)
      .map(
        (l): GameLine => ({
          provider: l.name,
          spread: l.spread,
          formattedSpread:
            l.spread < 0
              ? `${g.home_team} ${l.spread}`
              : `${g.away_team} -${l.spread}`,
          spreadOpen: l.spread_open,
          overUnder: l.over_under,
          overUnderOpen: l.over_under_open,
          homeMoneyline: l.moneyline_home,
          awayMoneyline: l.moneyline_away,
        }),
      );

    return {
      id: g.id,
      season: g.season,
      seasonType: g.season_type,
      week: g.week,
      startDate: g.start_date,
      homeTeam: g.home_team,
      homeConference: g.home_conference,
      homeScore: g.home_score,
      awayTeam: g.away_team,
      awayConference: g.away_conference,
      awayScore: g.away_score,
      lines: gameLines,
    };
  });

  return results;
};

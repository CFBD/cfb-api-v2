import { ValidateError } from 'tsoa';
import { db } from '../../config/database';
import {
  PlayerPPAChartItem,
  PlayerSearchResult,
  PlayerTransfer,
  PlayerUsage,
  ReturningProduction,
} from './types';

export const searchPlayers = async (
  searchTerm: string,
  year?: number,
  team?: string,
  position?: string,
): Promise<PlayerSearchResult[]> => {
  let filter;
  let params: any[];
  let index;

  if (year) {
    filter = 'WHERE att.start_year <= $1 AND att.end_year >= $1';
    params = [year];
    index = 2;
  } else {
    filter = '';
    params = [];
    index = 1;
  }

  if (team) {
    filter += ` AND LOWER(t.school) = LOWER($${index})`;
    params.push(team);
    index++;
  }

  if (position) {
    filter += ` AND LOWER(p.abbreviation) = LOWER($${index})`;
    params.push(position);
    index++;
  }

  filter += ` AND LOWER(a.name) LIKE LOWER('%$${index}:value%')`;
  params.push(searchTerm);
  index++;

  const results = await db.any(
    `
    SELECT DISTINCT a.id, t.school, a.name, a.first_name, a.last_name, a.weight, a.height, a.jersey, p.abbreviation AS "position", h.city || ', ' || h.state AS hometown, '#' || t.color AS color, '#' || t.alt_color AS alt_color
    FROM athlete AS a
        INNER JOIN athlete_team AS att ON a.id = att.athlete_id
        INNER JOIN team AS t ON att.team_id = t.id
        INNER JOIN "position" AS p ON a.position_id = p.id
        INNER JOIN hometown AS h ON a.hometown_id = h.id
    ${filter}
    ORDER BY a.name
    LIMIT 100
    `,
    params,
  );

  return results.map(
    (r): PlayerSearchResult => ({
      id: r.id,
      team: r.school,
      name: r.name,
      firstName: r.first_name,
      lastName: r.last_name,
      weight: r.weight,
      height: r.height,
      jersey: r.jersey,
      position: r.position,
      hometown: r.hometown,
      teamColor: r.color,
      teamColorSecondary: r.alt_color,
    }),
  );
};

export const generateMeanPassingChart = async (
  id: number,
  year?: number,
  rollingPlays?: number,
): Promise<PlayerPPAChartItem[]> => {
  let season = year ? year : 2023;
  const condition = rollingPlays
    ? `p2.row_num <= p1.row_num AND (p2.row_num + ${rollingPlays}) > p1.row_num`
    : 'p2.row_num <= p1.row_num';

  const results = await db.any(
    `
            WITH plays AS (
                SELECT a.id, a.name, t.school, p.ppa, ROW_NUMBER() OVER(PARTITION BY a.name, t.school ORDER BY g.season, g.week, p.period, p.clock DESC, d.id, p.id) AS row_num
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL AND p.play_type_id IN (3,4,6,7,24,26,36,51,67)
                    INNER JOIN play_stat AS ps ON p.id = ps.play_id
                    INNER JOIN athlete AS a ON ps.athlete_id = a.id
                    INNER JOIN team AS t ON p.offense_id = t.id
                    INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                    INNER JOIN position AS po ON a.position_id = po.id AND po.abbreviation = 'QB'
                WHERE g.season = $2 AND a.id = $1
            ), grouped AS (
                SELECT p1.row_num, p2.ppa
                FROM plays AS p1
                    INNER JOIN plays AS p2 ON ${condition}
            )
            SELECT row_num, AVG(ppa) AS avg_ppa
            FROM grouped
            GROUP BY row_num
            ORDER BY row_num
        `,
    [id, season],
  );

  return results.map(
    (r): PlayerPPAChartItem => ({
      playNumber: parseInt(r.row_num),
      avgPPA: r.avg_ppa,
    }),
  );
};

export const getPlayerUsage = async (
  year: number,
  conference?: string,
  position?: string,
  team?: string,
  playerId?: number,
  excludeGarbageTime?: boolean,
): Promise<PlayerUsage[]> => {
  const filters = [];
  const params = [];
  let index = 1;

  if (year) {
    filters.push(`g.season = $${index}`);
    params.push(year);
    index++;
  }

  if (conference) {
    filters.push(`LOWER(c.abbreviation) = LOWER($${index})`);
    params.push(conference);
    index++;
  }

  if (position) {
    filters.push(`LOWER(po.abbreviation) = LOWER($${index})`);
    params.push(position);
    index++;
  }

  if (team) {
    filters.push(`LOWER(t.school) = LOWER($${index})`);
    params.push(team);
    index++;
  }

  if (playerId) {
    filters.push(`a.id = $${index}`);
    params.push(playerId);
    index++;
  }

  let filter = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const results = await db.any(
    `
        WITH plays AS (
            SELECT DISTINCT g.season,
                            t.id AS team_id,
                            t.school,
                            c.name AS conference,
                            a.id,
                            a.name,
                            po.abbreviation AS position,
                            COUNT(DISTINCT p.id) AS plays,
                            COUNT(DISTINCT p.id) FILTER(WHERE p.play_type_id IN (3,4,6,7,24,26,36,51,67)) AS pass_plays,
                            COUNT(DISTINCT p.id) FILTER(WHERE p.play_type_id IN (5,9,29,39,68)) AS rush_plays,
                            COUNT(DISTINCT p.id) FILTER(WHERE p.down = 1) AS first_downs,
                            COUNT(DISTINCT p.id) FILTER(WHERE p.down = 2) AS second_downs,
                            COUNT(DISTINCT p.id) FILTER(WHERE p.down = 3) AS third_downs,
                            COUNT(DISTINCT p.id) FILTER(WHERE (p.down = 2 AND p.distance >= 8) OR (p.down IN (3,4) AND p.distance >= 5)) AS passing_downs,
                            COUNT(DISTINCT p.id) FILTER(WHERE p.distance < 5 OR (p.down = 2 AND p.distance < 8)) AS standard_downs
            FROM game AS g
                INNER JOIN game_team AS gt ON g.id = gt.game_id
                INNER JOIN team AS t ON gt.team_id = t.id
                INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
                INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
                INNER JOIN drive AS d ON g.id = d.game_id
                INNER JOIN play AS p ON d.id = p.drive_id AND p.offense_id = t.id AND p.ppa IS NOT NULL
                INNER JOIN play_stat AS ps ON p.id = ps.play_id
                INNER JOIN athlete AS a ON ps.athlete_id = a.id
                INNER JOIN athlete_team AS att ON a.id = att.athlete_id AND att.start_year <= g.season AND att.end_year >= g.season AND att.team_id = t.id
                INNER JOIN position AS po ON a.position_id = po.id
            ${filter} AND po.abbreviation IN ('QB', 'RB', 'FB', 'TE', 'WR') ${excludeGarbageTime ? 'AND p.garbage_time = false' : ''}
            GROUP BY g.season, a.id, a."name", po.abbreviation, t.id, t.school, c.name
        ), team_counts AS (
            SELECT 	g.season,
                    t.id,
                    t.school,
                    COUNT(*) AS plays,
                    COUNT(*) FILTER(WHERE p.play_type_id IN (3,4,6,7,24,26,36,51,67)) AS pass_plays,
                    COUNT(*) FILTER(WHERE p.play_type_id IN (5,9,29,39,68)) AS rush_plays,
                    COUNT(*) FILTER(WHERE p.down = 1) AS first_downs,
                    COUNT(*) FILTER(WHERE p.down = 2) AS second_downs,
                    COUNT(*) FILTER(WHERE p.down = 3) AS third_downs,
                    COUNT(*) FILTER(WHERE (p.down = 2 AND p.distance >= 8) OR (p.down IN (3,4) AND p.distance >= 5)) AS passing_downs,
                    COUNT(*) FILTER(WHERE p.distance < 5 OR (p.down = 2 AND p.distance < 8)) AS standard_downs
            FROM game AS g
                INNER JOIN game_team AS gt ON g.id = gt.game_id
                INNER JOIN team AS t ON gt.team_id = t.id
                INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
                INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
                INNER JOIN drive AS d ON g.id = d.game_id
                INNER JOIN play AS p ON d.id = p.drive_id AND p.offense_id = t.id AND p.ppa IS NOT NULL
            WHERE g.season = $1 ${excludeGarbageTime ? 'AND p.garbage_time = false' : ''}
            GROUP BY g.season, t.id, t.school
        )
        SELECT p.season,
            p.id,
            p."name",
            p.position,
            p.school,
            p.conference,
            ROUND(CAST(CAST(p.plays AS NUMERIC) / t.plays AS NUMERIC), 4) AS overall_usage,
            ROUND(CAST(CAST(p.pass_plays AS NUMERIC) / t.pass_plays AS NUMERIC), 4) AS pass_usage,
            ROUND(CAST(CAST(p.rush_plays AS NUMERIC) / t.rush_plays AS NUMERIC), 4) AS rush_usage,
            ROUND(CAST(CAST(p.first_downs AS NUMERIC) / t.first_downs AS NUMERIC), 4) AS first_down_usage,
            ROUND(CAST(CAST(p.second_downs AS NUMERIC) / t.second_downs AS NUMERIC), 3) AS second_down_usage,
            ROUND(CAST(CAST(p.third_downs AS NUMERIC) / t.third_downs AS NUMERIC), 3) AS third_down_usage,
            ROUND(CAST(CAST(p.standard_downs AS NUMERIC) / t.standard_downs AS NUMERIC), 3) AS standard_down_usage,
            ROUND(CAST(CAST(p.passing_downs AS NUMERIC) / t.passing_downs AS NUMERIC), 3) AS passing_down_usage
        FROM plays AS p
            INNER JOIN team_counts AS t ON p.team_id = t.id
        ORDER BY overall_usage DESC
        `,
    params,
  );

  return results.map(
    (r): PlayerUsage => ({
      season: r.season,
      id: r.id,
      name: r.name,
      position: r.position,
      team: r.school,
      conference: r.conference,
      usage: {
        overall: parseFloat(r.overall_usage),
        pass: parseFloat(r.pass_usage),
        rush: parseFloat(r.rush_usage),
        firstDown: parseFloat(r.first_down_usage),
        secondDown: parseFloat(r.second_down_usage),
        thirdDown: parseFloat(r.third_down_usage),
        standardDowns: parseFloat(r.standard_down_usage),
        passingDowns: parseFloat(r.passing_down_usage),
      },
    }),
  );
};

export const getReturningProduction = async (
  year?: number,
  team?: string,
  conference?: string,
): Promise<ReturningProduction[]> => {
  let filters = [];
  let params = [];
  let index = 1;

  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  if (year) {
    filters.push(`season = $${index}`);
    params.push(year - 1);
    index++;
  }

  if (team) {
    filters.push(`LOWER(school) = LOWER($${index})`);
    params.push(team);
    index++;
  }

  if (conference) {
    filters.push(`LOWER(conference) = LOWER($${index})`);
    params.push(conference);
    index++;
  }

  let filter = `WHERE ${filters.join(' AND ')}`;

  let results = await db.any(
    `
        SELECT *
        FROM returning_production
        ${filter}
        `,
    params,
  );

  return results.map(
    (r): ReturningProduction => ({
      season: parseInt(r.season),
      team: r.school,
      conference: r.conference,
      totalPPA: parseFloat(r.returning_ppa),
      totalPassingPPA: parseFloat(r.returning_pass_ppa),
      totalReceivingPPA: parseFloat(r.returning_receiving_ppa),
      totalRushingPPA: parseFloat(r.returning_rush_ppa),
      percentPPA: Math.round((r.returning_ppa * 1000) / r.ppa) / 1000,
      percentPassingPPA:
        Math.round((r.returning_pass_ppa * 1000) / r.pass_ppa) / 1000,
      percentReceivingPPA:
        Math.round((r.returning_receiving_ppa * 1000) / r.receiving_ppa) / 1000,
      percentRushingPPA:
        Math.round((r.returning_rush_ppa * 1000) / r.rush_ppa) / 1000,
      usage: parseFloat(r.returning_usage),
      passingUsage: parseFloat(r.returning_pass_usage),
      receivingUsage: parseFloat(r.returning_receiving_usage),
      rushingUsage: parseFloat(r.returning_rush_usage),
    }),
  );
};

export const getTransferPortal = async (
  year: number,
): Promise<PlayerTransfer[]> => {
  let transfers = await db.any(
    `
        SELECT t.id, t.season, t.first_name, t.last_name, pos.position AS position, fr.school AS source, tt.school AS destination, t.transfer_date, t.rating, t.stars, t.eligibility
        FROM transfer AS t
            INNER JOIN recruit_position AS pos ON t.position_id = pos.id
            INNER JOIN team AS fr ON t.from_team_id = fr.id
            LEFT JOIN team AS tt ON t.to_team_id = tt.id
        WHERE t.season = $1
        `,
    [year],
  );

  return transfers.map(
    (t): PlayerTransfer => ({
      season: t.season,
      firstName: t.first_name,
      lastName: t.last_name,
      position: t.position,
      origin: t.source,
      destination: t.destination,
      transferDate: t.transfer_date,
      rating: t.rating,
      stars: t.stars,
      eligibility: t.eligibility,
    }),
  );
};

import { ValidateError } from 'tsoa';
import { db } from '../../config/database';
import { SeasonType } from '../enums';
import {
  AdvancedGameStat,
  AdvancedSeasonStat,
  PlayerStat,
  TeamStat,
} from './types';

export const getPlayerSeasonStats = async (
  year: number,
  conference?: string,
  team?: string,
  startWeek?: number,
  endWeek?: number,
  seasonType?: SeasonType,
  category?: string,
): Promise<PlayerStat[]> => {
  let filter = 'g.season = $1';
  let params: any[] = [year];
  let index = 2;

  if (conference) {
    filter += ` AND LOWER(c.abbreviation) = LOWER($${index})`;
    params.push(conference);
    index++;
  }

  if (team) {
    filter += ` AND LOWER(t.school) = LOWER($${index})`;
    params.push(team);
    index++;
  }

  if (startWeek) {
    filter += ` AND g.week >= $${index}`;
    params.push(startWeek);
    index++;
  }

  if (endWeek) {
    filter += ` AND g.week <= $${index}`;
    params.push(endWeek);
    index++;
  }

  if (seasonType && seasonType !== SeasonType.Both) {
    filter += ` AND g.season_type = $${index}`;
    params.push(seasonType);
    index++;
  }

  if (category) {
    filter += ` AND LOWER(cat.name) = LOWER($${index})`;
    params.push(category);
    index++;
  }

  let results = await db.any(
    `
        SELECT 	g.season,
                a.id AS player_id,
                a.name AS player,
                t.school AS team,
                c.name AS conference,
                cat.name AS category,
                typ.name AS stat_type,
                SUM(CAST(gps.stat AS NUMERIC)) as stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN game_player_stat AS gps ON gt.id = gps.game_team_id
            INNER JOIN athlete AS a ON gps.athlete_id = a.id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
            INNER JOIN player_stat_category AS cat ON gps.category_id = cat.id
            INNER JOIN player_stat_type AS typ ON gps.type_id = typ.id
        WHERE ${filter} AND (typ.id IN (8,14,22) OR (cat.id = 1 AND typ.id = 11) OR (cat.id = 2 AND typ.id = 5) OR (cat.id = 3 AND typ.id IN (6,21)) OR (cat.id = 6 AND typ.id = 18) OR (cat.id = 7) OR (cat.id = 8 AND typ.id = 9) OR (cat.id = 9 AND typ.id = 18) OR cat.id = 10) AND gps.stat <> '--' AND gps.stat NOT LIKE '--/--'
        GROUP BY g.season, a.id, a.name, t.school, c.name, cat.name, typ.name
        UNION
        SELECT 	g.season,
                a.id AS player_id,
                a.name AS player,
                t.school AS team,
                c.name AS conference,
                cat.name AS category,
                typ.name AS stat_type,
                MAX(CAST(gps.stat AS INT)) as stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN game_player_stat AS gps ON gt.id = gps.game_team_id
            INNER JOIN athlete AS a ON gps.athlete_id = a.id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
            INNER JOIN player_stat_category AS cat ON gps.category_id = cat.id
            INNER JOIN player_stat_type AS typ ON gps.type_id = typ.id
        WHERE ${filter} AND (typ.id = 15) AND gps.stat <> '--' AND gps.stat NOT LIKE '--/--'
        GROUP BY g.season, a.id, a.name, t.school, c.name, cat.name, typ.name
        UNION
        SELECT 	g.season,
                a.id AS player_id,
                a.name AS player,
                t.school AS team,
                c.name AS conference,
                cat.name AS category,
                CASE
                    WHEN cat.name = 'kicking' AND typ.name = 'FG' THEN 'FGM'
                    WHEN cat.name = 'kicking' AND typ.name = 'XP' THEN 'XPM'
                    WHEN cat.name = 'passing' AND typ.name = 'C/ATT' THEN 'COMPLETIONS'
                END AS stat_type,
                SUM(CAST(split_part(gps.stat, '/', 1) AS INT)) as stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN game_player_stat AS gps ON gt.id = gps.game_team_id
            INNER JOIN athlete AS a ON gps.athlete_id = a.id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
            INNER JOIN player_stat_category AS cat ON gps.category_id = cat.id
            INNER JOIN player_stat_type AS typ ON gps.type_id = typ.id
        WHERE ${filter} AND ((cat.id = 2 AND typ.id IN (2, 10)) OR (cat.id = 9 AND typ.id = 3)) AND gps.stat <> '--' AND gps.stat NOT LIKE '--/--'
        GROUP BY g.season, a.id, a.name, t.school, c.name, cat.name, typ.name
        UNION
        SELECT 	g.season,
                a.id AS player_id,
                a.name AS player,
                t.school AS team,
                c.name AS conference,
                cat.name AS category,
                CASE
                    WHEN cat.name = 'kicking' AND typ.name = 'FG' THEN 'FGA'
                    WHEN cat.name = 'kicking' AND typ.name = 'XP' THEN 'XPA'
                    WHEN cat.name = 'passing' AND typ.name = 'C/ATT' THEN 'ATT'
                END AS stat_type,
                SUM(CAST(split_part(gps.stat, '/', 2) AS INT)) as stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN game_player_stat AS gps ON gt.id = gps.game_team_id
            INNER JOIN athlete AS a ON gps.athlete_id = a.id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
            INNER JOIN player_stat_category AS cat ON gps.category_id = cat.id
            INNER JOIN player_stat_type AS typ ON gps.type_id = typ.id
        WHERE ${filter} AND ((cat.id = 2 AND typ.id IN (2, 10)) OR (cat.id = 9 AND typ.id = 3)) AND gps.stat <> '--' AND gps.stat NOT LIKE '--/--'
        GROUP BY g.season, a.id, a.name, t.school, c.name, cat.name, typ.name
        UNION
        SELECT 	g.season,
                a.id AS player_id,
                a.name AS player,
                t.school AS team,
                c.name AS conference,
                cat.name AS category,
                CASE
                    WHEN cat.name = 'rushing' THEN 'YPC'
                    WHEN cat.name = 'receiving' THEN 'YPR'
                    WHEN cat.name = 'punting' THEN 'YPP'
                    WHEN cat.name = 'passing' THEN 'YPA'
                    WHEN cat.name IN ('kickReturns','puntReturns','interceptions') THEN 'AVG'
                END AS stat_type,
                CASE
                    WHEN cat.name IN ('rushing', 'punting', 'kickReturns', 'puntReturns','interceptions','receiving') AND SUM(CAST(gps.stat AS INT)) FILTER(WHERE typ.name IN ('CAR', 'NO', 'INT', 'REC')) = 0 THEN 0
                    WHEN cat.name IN ('rushing', 'punting', 'kickReturns', 'puntReturns','interceptions','receiving') THEN ROUND(COALESCE(SUM(CAST(gps.stat AS INT)) FILTER(WHERE typ.name = 'YDS'), 0) / SUM(CAST(gps.stat AS NUMERIC)) FILTER(WHERE typ.name IN ('CAR', 'NO', 'INT', 'REC')), 1)
                    WHEN cat.name = 'passing' AND SUM(CAST(split_part(gps.stat, '/', 2) AS INT)) FILTER(WHERE typ.id = 3) = 0 THEN 0
                    WHEN cat.name = 'passing' THEN ROUND(SUM(CAST(gps.stat AS INT)) FILTER(WHERE typ.id = 8) / SUM(CAST(split_part(gps.stat, '/', 2) AS NUMERIC)) FILTER(WHERE typ.id = 3), 1)
                END AS stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN game_player_stat AS gps ON gt.id = gps.game_team_id
            INNER JOIN athlete AS a ON gps.athlete_id = a.id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
            INNER JOIN player_stat_category AS cat ON gps.category_id = cat.id
            INNER JOIN player_stat_type AS typ ON gps.type_id = typ.id
        WHERE ${filter} AND (cat.id IN (1,3,4,5,6,8,9)) AND gps.stat <> '--/--' AND gps.stat <> '--'
        GROUP BY g.season, a.id, a.name, t.school, c.name, cat.name
        UNION
        SELECT 	g.season,
                a.id AS player_id,
                a.name AS player,
                t.school AS team,
                c.name AS conference,
                cat.name AS category,
                CASE
                    WHEN cat.name = 'kicking' THEN 'PCT'
                    WHEN cat.name = 'passing' THEN 'PCT'
                END AS stat_type,
                CASE
                    WHEN cat.name = 'passing' AND SUM(CAST(split_part(gps.stat, '/', 2) AS INT)) FILTER(WHERE typ.id = 3) = 0 THEN 0
                    WHEN cat.name = 'passing' THEN ROUND(SUM(CAST(split_part(gps.stat, '/', 1) AS INT)) FILTER(WHERE typ.id = 3) / SUM(CAST(split_part(gps.stat, '/', 2) AS NUMERIC)) FILTER(WHERE typ.id = 3), 3)
                    WHEN cat.name = 'kicking' AND SUM(CAST(split_part(gps.stat, '/', 2) AS INT)) FILTER(WHERE typ.id = 2) = 0 THEN 0
                    WHEN cat.name = 'kicking' THEN ROUND(SUM(CAST(split_part(gps.stat, '/', 1) AS INT)) FILTER(WHERE typ.id = 2) / SUM(CAST(split_part(gps.stat, '/', 2) AS NUMERIC)) FILTER(WHERE typ.id = 2), 3)
                END AS stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN game_player_stat AS gps ON gt.id = gps.game_team_id
            INNER JOIN athlete AS a ON gps.athlete_id = a.id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year >= g.season OR ct.end_year IS NULL)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
            INNER JOIN player_stat_category AS cat ON gps.category_id = cat.id
            INNER JOIN player_stat_type AS typ ON gps.type_id = typ.id
        WHERE ${filter} AND (cat.id IN (2,9)) AND gps.stat <> '--' AND gps.stat <> '--/--'
        GROUP BY g.season, a.id, a.name, t.school, c.name, cat.name
        `,
    params,
  );

  return results.map(
    (r): PlayerStat => ({
      season: r.year,
      playerId: r.player_id,
      player: r.player,
      team: r.team,
      conference: r.conference,
      category: r.category,
      statType: r.stat_type,
      stat: r.stat,
    }),
  );
};

export const getTeamStats = async (
  year?: number,
  team?: string,
  conference?: string,
  startWeek?: number,
  endWeek?: number,
): Promise<TeamStat[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  let filter = '';
  let params = [];
  let index = 1;

  if (year) {
    filter += ` AND g.season = $${index}`;
    params.push(year);
    index++;
  }

  if (team) {
    filter += ` AND LOWER(t.school) = LOWER($${index})`;
    params.push(team);
    index++;
  }

  if (conference) {
    filter += ` AND LOWER(c.abbreviation) = LOWER($${index})`;
    params.push(conference);
    index++;
  }

  if (startWeek) {
    filter += ` AND (g.week >= $${index} OR g.season_type = 'postseason')`;
    params.push(startWeek);
    index++;
  }

  if (endWeek) {
    filter += ` AND g.week <= $${index} AND g.season_type <> 'postseason'`;
    params.push(endWeek);
    index++;
  }

  filter = filter.substring(4);

  let results = await db.any(
    `
        SELECT 	g.season,
                t.school,
                c.name AS conference,
                typ.name as stat_type,
                FLOOR(SUM(CAST(stat.stat AS NUMERIC))) as stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN game_team_stat AS stat ON gt.id = stat.game_team_id
            INNER JOIN team_stat_type AS typ ON stat.type_id = typ.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year IS NULL OR ct.end_year >= g.season)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
        WHERE typ.id IN (2,3,4,7,10,11,12,13,18,21,23,24,25,26,31,32,33,34,35,36,37,38) AND ${filter}
        GROUP BY g.season, t.school, typ.name, typ.id, c.name
        UNION
        SELECT 	g.season,
                t.school,
                c.name AS conference,
                CASE
                    WHEN typ.id = 5 THEN 'passCompletions'
                    WHEN typ.id = 6 THEN 'penalties'
                    WHEN typ.id = 14 THEN 'thirdDownConversions'
                    WHEN typ.id = 15 THEN 'fourthDownConversions'
                END as stat_type, SUM(CAST(split_part(stat.stat, '-', 1) AS INT)) as stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN game_team_stat AS stat ON gt.id = stat.game_team_id
            INNER JOIN team_stat_type AS typ ON stat.type_id = typ.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year IS NULL OR ct.end_year >= g.season)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
        WHERE typ.id IN (5,6,14,15) AND ${filter}
        GROUP BY g.season, t.school, typ.name, typ.id, c.name
        UNION
        SELECT 	g.season,
                t.school,
                c.name AS conference,
                CASE
                    WHEN typ.id = 5 THEN 'passAttempts'
                    WHEN typ.id = 6 THEN 'penaltyYards'
                    WHEN typ.id = 14 THEN 'thirdDowns'
                    WHEN typ.id = 15 THEN 'fourthDowns'
                END as stat_type, SUM(CAST(CASE WHEN split_part(stat.stat, '-', 2) = '' THEN '0' ELSE split_part(stat.stat, '-', 2) END AS INT)) as stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN game_team_stat AS stat ON gt.id = stat.game_team_id
            INNER JOIN team_stat_type AS typ ON stat.type_id = typ.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year IS NULL OR ct.end_year >= g.season)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
        WHERE typ.id IN (5,6,14,15) AND ${filter}
        GROUP BY g.season, t.school, typ.name, typ.id, c.name
        UNION
        SELECT 	g.season,
                t.school,
                c.name AS conference,
                typ.name AS stat_type,
                SUM(EXTRACT(epoch FROM CAST('00:' || stat.stat AS INTERVAL))) AS stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN game_team_stat AS stat ON gt.id = stat.game_team_id
            INNER JOIN team_stat_type AS typ ON stat.type_id = typ.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year IS NULL OR ct.end_year >= g.season)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
        WHERE typ.id = 8 AND ${filter}
        GROUP BY g.season, t.school, typ.name, typ.id, c.name
        UNION
        SELECT 	g.season,
                t.school,
                c.name AS conference,
                'games' as stat_type,
                COUNT(*) as stat
        FROM game AS g
            INNER JOIN game_team AS gt ON g.id = gt.game_id
            INNER JOIN team AS t ON gt.team_id = t.id
            INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= g.season AND (ct.end_year IS NULL OR ct.end_year >= g.season)
            INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
        WHERE ${filter}
        GROUP BY g.season, t.school, c.name
        `,
    params,
  );

  return results.map(
    (r): TeamStat => ({
      season: r.season,
      team: r.school,
      conference: r.conference,
      statName: r.stat_type,
      statValue: r.stat,
    }),
  );
};

export const getCategories = async (): Promise<string[]> => {
  let results = await db.any(`
            SELECT name
            FROM team_stat_type
            ORDER BY name
        `);

  return results.map((r) => r.name);
};

export const getAdvancedStats = async (
  year?: number,
  team?: string,
  excludeGarbageTime?: boolean,
  startWeek?: number,
  endWeek?: number,
): Promise<AdvancedSeasonStat[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  const filters = [];
  const params = [];
  let index = 1;

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

  if (startWeek) {
    filters.push(`(g.week >= $${index} OR g.season_type = 'postseason')`);
    params.push(startWeek);
    index++;
  }

  if (endWeek) {
    filters.push(`g.week <= $${index} AND g.season_type <> 'postseason'`);
    params.push(endWeek);
    index++;
  }

  const filter = `WHERE ${filters.join(' AND ')}`;

  const mainTask = db.any(
    `
        WITH plays AS (
            SELECT  g.id,
                    g.season,
                    t.school,
                    p.drive_id,
                    p.down,
                    p.distance,
                    p.yards_gained,
                    c.name AS conference,
                    CASE
                        WHEN p.offense_id = t.id THEN 'offense'
                        ELSE 'defense'
                    END AS o_d,
                    CASE
                        WHEN p.down = 2 AND p.distance >= 8 THEN 'passing'
                        WHEN p.down IN (3,4) AND p.distance >= 5 THEN 'passing'
                        ELSE 'standard'
                    END AS down_type,
                    CASE
                        WHEN p.play_type_id IN (20,26,34,36,37,38,39,63) THEN false
                        WHEN p.scoring = true THEN true
                        WHEN p.down = 1 AND (CAST(p.yards_gained AS NUMERIC) / p.distance) >= 0.5 THEN true
                        WHEN p.down = 2 AND (CAST(p.yards_gained AS NUMERIC) / p.distance) >= 0.7 THEN true
                        WHEN p.down IN (3,4) AND (p.yards_gained >= p.distance) THEN true
                        ELSE false
                    END AS success,
                    CASE
                        WHEN p.play_type_id IN (3,4,6,7,24,26,36,51,67) THEN 'Pass'
                        WHEN p.play_type_id IN (5,9,29,39,68) THEN 'Rush'
                        ELSE 'Other'
                    END AS play_type,
                    CASE
                        WHEN p.period = 2 AND p.scoring = false AND ABS(p.home_score - p.away_score) > 38 THEN true
                        WHEN p.period = 3 AND p.scoring = false AND ABS(p.home_score - p.away_score) > 28 THEN true
                        WHEN p.period = 4 AND p.scoring = false AND ABS(p.home_score - p.away_score) > 22 THEN true
                        WHEN p.period = 2 AND p.scoring = true AND ABS(p.home_score - p.away_score) > 45 THEN true
                        WHEN p.period = 3 AND p.scoring = true AND ABS(p.home_score - p.away_score) > 35 THEN true
                        WHEN p.period = 4 AND p.scoring = true AND ABS(p.home_score - p.away_score) > 29 THEN true
                        ELSE false
                    END AS garbage_time,
                    p.ppa AS ppa
            FROM game AS g
                INNER JOIN game_team AS gt ON g.id = gt.game_id
                INNER JOIN team AS t ON gt.team_id = t.id
                INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.end_year IS NULL
                INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
                INNER JOIN drive AS d ON g.id = d.game_id
                INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
            ${filter}
        )
        SELECT 	season,
                school AS team,
                conference,
                o_d AS unit,
                COUNT(ppa) AS plays,
                COUNT(DISTINCT(drive_id)) AS drives,
                AVG(ppa) AS ppa,
                AVG(ppa) FILTER(WHERE down_type = 'standard') AS standard_down_ppa,
                AVG(ppa) FILTER(WHERE down_type = 'passing') AS passing_down_ppa,
                AVG(ppa) FILTER(WHERE play_type = 'Pass') AS passing_ppa,
                AVG(ppa) FILTER(WHERE play_type = 'Rush') AS rushing_ppa,
                SUM(ppa) AS total_ppa,
                SUM(ppa) FILTER(WHERE play_type = 'Pass') AS total_passing_ppa,
                SUM(ppa) FILTER(WHERE play_type = 'Rush') AS total_rushing_ppa,
                CAST(AVG(CASE WHEN down_type = 'standard' THEN 1 ELSE 0 END) AS NUMERIC) AS standard_down_rate,
                CAST(AVG(CASE WHEN down_type = 'passing' THEN 1 ELSE 0 END) AS NUMERIC) AS passing_down_rate,
                CAST(AVG(CASE WHEN play_type = 'Pass' THEN 1 ELSE 0 END) AS NUMERIC) AS passing_rate,
                CAST(AVG(CASE WHEN play_type = 'Rush' THEN 1 ELSE 0 END) AS NUMERIC) AS rush_rate,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END)) AS NUMERIC) AS success_rate,
                AVG(ppa) FILTER(WHERE success = true) AS explosiveness,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE down_type = 'standard')) AS NUMERIC) AS standard_down_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND down_type = 'standard') AS standard_down_explosiveness,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE down_type = 'passing')) AS NUMERIC) AS passing_down_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND down_type = 'passing') AS passing_down_explosiveness,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE play_type = 'Rush')) AS NUMERIC) AS rush_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND play_type = 'Rush') AS rush_explosiveness,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE play_type = 'Pass')) AS NUMERIC) AS pass_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND play_type = 'Pass') AS pass_explosiveness,
                CAST(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE distance <= 2 AND play_type = 'Rush') AS NUMERIC) AS power_success,
                CAST(AVG(CASE WHEN yards_gained <= 0 THEN 1 ELSE 0 END) FILTER(WHERE play_type = 'Rush') AS NUMERIC) AS stuff_rate,
                COALESCE(CAST(AVG(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC)) AS line_yards,
                ROUND(COALESCE(CAST(SUM(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC), 0), 0) AS line_yards_sum,
                CAST(AVG(CASE WHEN yards_gained >= 10 THEN 5 WHEN yards_gained > 5 THEN (yards_gained - 5) ELSE 0 END) FILTER(WHERE play_type = 'Rush') AS NUMERIC) AS second_level_yards,
                CAST(SUM(CASE WHEN yards_gained >= 10 THEN 5 ELSE (yards_gained - 5) END) FILTER(WHERE yards_gained >= 5 AND play_type = 'Rush') AS NUMERIC) AS second_level_yards_sum,
                CAST(AVG(CASE WHEN yards_gained > 10 THEN yards_gained - 10 ELSE 0 END) FILTER(WHERE play_type = 'Rush') AS NUMERIC) AS open_field_yards,
                CAST(SUM(yards_gained - 10) FILTER(WHERE play_type = 'Rush' AND yards_gained >= 10) AS NUMERIC) AS open_field_yards_sum
        FROM plays
        ${excludeGarbageTime === true ? 'WHERE garbage_time = false' : ''}
        GROUP BY season, school, conference, o_d
        `,
    params,
  );

  const havocTask1 = db.any(
    `
            WITH havoc_events AS (
                WITH fumbles AS (
                    SELECT g.season, t.id AS team_id, COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0) AS fumbles
                    FROM game AS g
                        INNER JOIN game_team AS gt ON g.id = gt.game_id
                        INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                        INNER JOIN team AS t ON gt2.team_id = t.id
                        INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                        LEFT JOIN game_player_stat AS s ON s.game_team_id = gt.id AND s.type_id = 4 AND s.category_id = 10
                    ${filter}
                    GROUP BY g.season, t.id
                )
                SELECT 	g.season,
                        t.id AS team_id,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0.0) + f.fumbles AS total_havoc,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id IN (16,24)), 0.0) AS db_havoc,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id = 21), 0.0) + f.fumbles AS front_seven_havoc
                FROM game AS g
                    INNER JOIN game_team AS gt ON g.id = gt.game_id
                    INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                    INNER JOIN team AS t ON gt.team_id = t.id
                    INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                    INNER JOIN game_team_stat AS s ON s.game_team_id = gt.id AND s.type_id IN (16,21,24)
                    LEFT JOIN fumbles AS f ON f.team_id = t.id
                ${filter}
                GROUP BY g.season, t.id, f.fumbles
            ), plays AS (
                SELECT g.season, t.id AS team_id, COUNT(p.id) AS total
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
                    INNER JOIN team AS t ON p.defense_id = t.id
                    INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                ${filter}
                GROUP BY g.season, t.id
            )
            SELECT p.season AS season, t.school AS team, (h.total_havoc / p.total) AS total_havoc, (h.front_seven_havoc / p.total) AS front_seven_havoc, (h.db_havoc / p.total) AS db_havoc
            FROM plays AS p
                INNER JOIN havoc_events AS h ON p.team_id = h.team_id AND h.season = p.season
                INNER JOIN team AS t ON t.id = p.team_id
        `,
    params,
  );

  const havocTask2 = await db.any(
    `
            WITH havoc_events AS (
                WITH fumbles AS (
                    SELECT g.season, t.id AS team_id, COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0) AS fumbles
                    FROM game AS g
                        INNER JOIN game_team AS gt ON g.id = gt.game_id
                        INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                        INNER JOIN team AS t ON gt.team_id = t.id
                        INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                        LEFT JOIN game_player_stat AS s ON s.game_team_id = gt.id AND s.type_id = 4 AND s.category_id = 10
                    ${filter}
                    GROUP BY g.season, t.id
                )
                SELECT 	g.season,
                        t.id AS team_id,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0.0) + f.fumbles AS total_havoc,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id IN (16,24)), 0.0) AS db_havoc,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id = 21), 0.0) + f.fumbles AS front_seven_havoc
                FROM game AS g
                    INNER JOIN game_team AS gt ON g.id = gt.game_id
                    INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                    INNER JOIN team AS t ON gt.team_id = t.id
                    INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                    INNER JOIN game_team_stat AS s ON s.game_team_id = gt2.id AND s.type_id IN (16,21,24)
                    LEFT JOIN fumbles AS f ON f.team_id = t.id
                ${filter}
                GROUP BY g.season, t.id, f.fumbles
            ), plays AS (
                SELECT g.season, t.id AS team_id, COUNT(p.id) AS total
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
                    INNER JOIN team AS t ON p.offense_id = t.id
                    INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                ${filter}
                GROUP BY g.season, t.id
            )
            SELECT p.season AS season, t.school AS team, (h.total_havoc / p.total) AS total_havoc, (h.front_seven_havoc / p.total) AS front_seven_havoc, (h.db_havoc / p.total) AS db_havoc
            FROM plays AS p
                INNER JOIN havoc_events AS h ON p.team_id = h.team_id AND h.season = p.season
                INNER JOIN team AS t ON t.id = p.team_id
        `,
    params,
  );

  const scoringOppTasks = db.any(
    `
            WITH drive_data AS (
                SELECT 	p.drive_id,
                        g.season,
                        CASE
                            WHEN gt.team_id = p.offense_id THEN (100 - p.yard_line)
                            ELSE p.yard_line
                        END AS yardsToGoal
                FROM game AS g
                    INNER JOIN game_team AS gt ON g.id = gt.game_id AND gt.home_away = 'home'
                    INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt2.id <> gt.id
                    INNER JOIN team AS t ON t.id IN (gt.team_id, gt2.team_id)
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN play AS p ON d.id = p.drive_id
                ${filter} AND d.start_period < 5
            ), drives AS (
                SELECT season, drive_id, MIN(yardsToGoal) AS min_yards
                FROM drive_data
                GROUP BY season, drive_id
            ), drive_points AS (
                SELECT  t.school,
                        season,
                        CASE
                            WHEN d.offense_id = t.id THEN 'offense'
                            ELSE 'defense'
                        END AS unit,
                        CASE
                            WHEN d.scoring AND d.result_id IN (12,20,24,26) THEN 7
                            WHEN d.scoring AND d.result_id IN (30) THEN 3
                            WHEN d.result_id IN (4,10,15,42,46) THEN -7
                            WHEN d.result_id IN (6) THEN -2
                            ELSE 0
                        END AS points
                FROM team AS t
                    INNER JOIN drive AS d ON t.id IN (d.offense_id, d.defense_id)
                    INNER JOIN drives AS dr ON d.id = dr.drive_id
                WHERE dr.min_yards <= 40
            )
            SELECT season, school, unit, COUNT(*) AS opportunities, AVG(points) AS points
            FROM drive_points
            GROUP BY season, school, unit
        `,
    params,
  );

  const fieldPositionTask = db.any(
    `
            WITH offensive_drives AS (
                SELECT 	g.season,
                        t.id AS team_id,
                        AVG(CASE
                            WHEN gt.home_away = 'home' THEN (100 - d.start_yardline)
                            ELSE d.start_yardline
                        END) as drive_start,
                        AVG(ppa.predicted_points) AS ppa
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN game_team AS gt ON g.id = gt.game_id AND gt.team_id = d.offense_id
                    INNER JOIN team AS t ON d.offense_id = t.id
                    INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                    INNER JOIN ppa ON ppa.down = 1 AND ppa.distance = 10 AND ((gt.home_away = 'home' AND (100 - d.start_yardline) = ppa.yard_line) OR (gt.home_away = 'away' AND d.start_yardline = ppa.yard_line))
                ${filter} AND d.start_period < 5 AND d.result_id NOT IN (28, 41, 43, 44, 57)
                GROUP BY g.season, t.id
            ), defensive_drives AS (
                SELECT 	g.season,
                        t.id AS team_id,
                        AVG(CASE
                            WHEN gt.home_away = 'away' THEN (100 - d.start_yardline)
                            ELSE d.start_yardline
                        END) as drive_start,
                        AVG(ppa.predicted_points) AS ppa
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN game_team AS gt ON g.id = gt.game_id AND gt.team_id = d.defense_id
                    INNER JOIN team AS t ON d.defense_id = t.id
                    INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                    INNER JOIN ppa ON ppa.down = 1 AND ppa.distance = 10 AND ((gt.home_away = 'away' AND (100 - d.start_yardline) = ppa.yard_line) OR (gt.home_away = 'home' AND d.start_yardline = ppa.yard_line))
                ${filter} AND d.start_period < 5 AND d.result_id NOT IN (28, 41, 43, 44, 57)
                GROUP BY g.season, t.id
            )
            SELECT 	o.season,
                    t.school,
                    ROUND(o.drive_start, 1) AS avg_start_off,
                    ROUND((o.ppa), 3) AS avg_predicted_points_off,
                    ROUND((d.drive_start), 1) AS avg_start_def,
                    ROUND((-d.ppa), 3) AS avg_predicted_points_def
            FROM team AS t
                INNER JOIN offensive_drives AS o ON o.team_id = t.id
                INNER JOIN defensive_drives AS d ON t.id = d.team_id AND o.season = d.season
        `,
    params,
  );

  const fullResults = await db.task(async (t) => {
    return await t.batch([
      mainTask,
      havocTask1,
      havocTask2,
      scoringOppTasks,
      fieldPositionTask,
    ]);
  });

  const results = fullResults[0];
  const havocResultsD = fullResults[1];
  const havocResultsO = fullResults[2];
  const scoringOppResults = fullResults[3];
  const fieldPositionResults = fullResults[4];

  let stats: AdvancedSeasonStat[] = [];
  let years = Array.from(new Set(results.map((r) => r.season)));

  for (let year of years) {
    let teams = Array.from(
      new Set(results.filter((r) => r.season == year).map((r) => r.team)),
    );

    let yearStats = teams.map((t): AdvancedSeasonStat => {
      let offense = results.find(
        (r) => r.season == year && r.team == t && r.unit == 'offense',
      );
      let defense = results.find(
        (r) => r.season == year && r.team == t && r.unit == 'defense',
      );
      let havocD = havocResultsD.find((r) => r.season == year && r.team == t);
      let havocO = havocResultsO.find((r) => r.season == year && r.team == t);
      let scoringOppO = scoringOppResults.find(
        (r) => r.season == year && r.school == t && r.unit == 'offense',
      );
      let scoringOppD = scoringOppResults.find(
        (r) => r.season == year && r.school == t && r.unit == 'defense',
      );
      let fieldPosition = fieldPositionResults.find(
        (r) => r.season == year && r.school == t,
      );

      return {
        season: year,
        team: t,
        conference: offense.conference,
        offense: {
          plays: parseInt(offense.plays),
          drives: parseInt(offense.drives),
          ppa: parseFloat(offense.ppa),
          totalPPA: parseFloat(offense.total_ppa),
          successRate: parseFloat(offense.success_rate),
          explosiveness: parseFloat(offense.explosiveness),
          powerSuccess: parseFloat(offense.power_success),
          stuffRate: parseFloat(offense.stuff_rate),
          lineYards: parseFloat(offense.line_yards),
          lineYardsTotal: parseInt(offense.line_yards_sum),
          secondLevelYards: parseFloat(offense.second_level_yards),
          secondLevelYardsTotal: parseInt(offense.second_level_yards_sum),
          openFieldYards: parseFloat(offense.open_field_yards),
          openFieldYardsTotal: parseInt(offense.open_field_yards_sum),
          totalOpportunies: parseInt(
            scoringOppO ? scoringOppO.opportunities : 0,
          ),
          pointsPerOpportunity: parseFloat(
            scoringOppO ? scoringOppO.points : 0,
          ),
          fieldPosition: {
            averageStart: fieldPosition
              ? parseFloat(fieldPosition.avg_start_off)
              : null,
            averagePredictedPoints: fieldPosition
              ? parseFloat(fieldPosition.avg_predicted_points_off)
              : null,
          },
          havoc: {
            total: havocO ? parseFloat(havocO.total_havoc) : null,
            frontSeven: havocO ? parseFloat(havocO.front_seven_havoc) : null,
            db: havocO ? parseFloat(havocO.db_havoc) : null,
          },
          standardDowns: {
            rate: parseFloat(offense.standard_down_rate),
            ppa: parseFloat(offense.standard_down_ppa),
            successRate: parseFloat(offense.standard_down_success_rate),
            explosiveness: parseFloat(offense.standard_down_explosiveness),
          },
          passingDowns: {
            rate: parseFloat(offense.passing_down_rate),
            ppa: parseFloat(offense.passing_down_ppa),
            successRate: parseFloat(offense.passing_down_success_rate),
            explosiveness: parseFloat(offense.passing_down_explosiveness),
          },
          rushingPlays: {
            rate: parseFloat(offense.rush_rate),
            ppa: parseFloat(offense.rushing_ppa),
            totalPPA: parseFloat(offense.total_rushing_ppa),
            successRate: parseFloat(offense.rush_success_rate),
            explosiveness: parseFloat(offense.rush_explosiveness),
          },
          passingPlays: {
            rate: parseFloat(offense.passing_rate),
            ppa: parseFloat(offense.passing_ppa),
            totalPPA: parseFloat(offense.total_passing_ppa),
            successRate: parseFloat(offense.pass_success_rate),
            explosiveness: parseFloat(offense.pass_explosiveness),
          },
        },
        defense: {
          plays: parseInt(defense.plays),
          drives: parseInt(defense.drives),
          ppa: parseFloat(defense.ppa),
          totalPPA: parseFloat(defense.total_ppa),
          successRate: parseFloat(defense.success_rate),
          explosiveness: parseFloat(defense.explosiveness),
          powerSuccess: parseFloat(defense.power_success),
          stuffRate: parseFloat(defense.stuff_rate),
          lineYards: parseFloat(defense.line_yards),
          lineYardsTotal: parseInt(defense.line_yards_sum),
          secondLevelYards: parseFloat(defense.second_level_yards),
          secondLevelYardsTotal: parseInt(defense.second_level_yards_sum),
          openFieldYards: parseFloat(defense.open_field_yards),
          openFieldYardsTotal: parseInt(defense.open_field_yards_sum),
          totalOpportunies: parseInt(
            scoringOppD ? scoringOppD.opportunities : 0,
          ),
          pointsPerOpportunity: parseFloat(
            scoringOppD ? scoringOppD.points : 0,
          ),
          fieldPosition: {
            averageStart: fieldPosition
              ? parseFloat(fieldPosition.avg_start_def)
              : null,
            averagePredictedPoints: fieldPosition
              ? parseFloat(fieldPosition.avg_predicted_points_def)
              : null,
          },
          havoc: {
            total: havocD ? parseFloat(havocD.total_havoc) : null,
            frontSeven: havocD ? parseFloat(havocD.front_seven_havoc) : null,
            db: havocD ? parseFloat(havocD.db_havoc) : null,
          },
          standardDowns: {
            rate: parseFloat(defense.standard_down_rate),
            ppa: parseFloat(defense.standard_down_ppa),
            successRate: parseFloat(defense.standard_down_success_rate),
            explosiveness: parseFloat(defense.standard_down_explosiveness),
          },
          passingDowns: {
            rate: parseFloat(defense.passing_down_rate),
            ppa: parseFloat(defense.passing_down_ppa),
            totalPPA: parseFloat(defense.total_passing_ppa),
            successRate: parseFloat(defense.passing_down_success_rate),
            explosiveness: parseFloat(defense.passing_down_explosiveness),
          },
          rushingPlays: {
            rate: parseFloat(defense.rush_rate),
            ppa: parseFloat(defense.rushing_ppa),
            totalPPA: parseFloat(defense.total_rushing_ppa),
            successRate: parseFloat(defense.rush_success_rate),
            explosiveness: parseFloat(defense.rush_explosiveness),
          },
          passingPlays: {
            rate: parseFloat(defense.passing_rate),
            ppa: parseFloat(defense.passing_ppa),
            totalPPA: parseFloat(defense.total_passing_ppa),
            successRate: parseFloat(defense.pass_success_rate),
            explosiveness: parseFloat(defense.pass_explosiveness),
          },
        },
      };
    });

    stats = [...stats, ...yearStats];
  }

  return stats;
};

export const getAdvancedGameStats = async (
  year?: number,
  team?: string,
  week?: number,
  opponent?: string,
  excludeGarbageTime?: boolean,
  seasonType?: SeasonType,
): Promise<AdvancedGameStat[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  let filters: string[] = [];
  let params: any[] = [];
  let index = 1;

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

  if (opponent) {
    filters.push(`LOWER(t2.school) = LOWER($${index})`);
    params.push(opponent);
    index++;
  }

  if (week) {
    filters.push(`g.week = $${index}`);
    params.push(week);
    index++;
  }

  if (seasonType && seasonType !== SeasonType.Both) {
    filters.push(`g.season_type = $${index}`);
    params.push(seasonType);
    index++;
  }

  const filter = `WHERE ${filters.join(' AND ')}`;

  const results = await db.any(
    `
        WITH plays AS (
            SELECT  g.id,
                    g.season,
                    g.week,
                    t.school,
                    t2.school AS opponent,
                    p.drive_id,
                    p.down,
                    p.distance,
                    p.yards_gained,
                    CASE
                        WHEN p.offense_id = t.id THEN 'offense'
                        ELSE 'defense'
                    END AS o_d,
                    CASE
                        WHEN p.down = 2 AND p.distance >= 8 THEN 'passing'
                        WHEN p.down IN (3,4) AND p.distance >= 5 THEN 'passing'
                        ELSE 'standard'
                    END AS down_type,
                    CASE
                        WHEN p.play_type_id IN (20,26,34,36,37,38,39,63) THEN false
                        WHEN p.scoring = true THEN true
                        WHEN p.down = 1 AND (CAST(p.yards_gained AS NUMERIC) / p.distance) >= 0.5 THEN true
                        WHEN p.down = 2 AND (CAST(p.yards_gained AS NUMERIC) / p.distance) >= 0.7 THEN true
                        WHEN p.down IN (3,4) AND (p.yards_gained >= p.distance) THEN true
                        ELSE false
                    END AS success,
                    CASE
                        WHEN p.play_type_id IN (3,4,6,7,24,26,36,51,67) THEN 'Pass'
                        WHEN p.play_type_id IN (5,9,29,39,68) THEN 'Rush'
                        ELSE 'Other'
                    END AS play_type,
                    CASE
                        WHEN p.period = 2 AND p.scoring = false AND ABS(p.home_score - p.away_score) > 38 THEN true
                        WHEN p.period = 3 AND p.scoring = false AND ABS(p.home_score - p.away_score) > 28 THEN true
                        WHEN p.period = 4 AND p.scoring = false AND ABS(p.home_score - p.away_score) > 22 THEN true
                        WHEN p.period = 2 AND p.scoring = true AND ABS(p.home_score - p.away_score) > 45 THEN true
                        WHEN p.period = 3 AND p.scoring = true AND ABS(p.home_score - p.away_score) > 35 THEN true
                        WHEN p.period = 4 AND p.scoring = true AND ABS(p.home_score - p.away_score) > 29 THEN true
                        ELSE false
                    END AS garbage_time,
                    p.ppa AS ppa
            FROM game AS g
                INNER JOIN game_team AS gt ON g.id = gt.game_id
                INNER JOIN team AS t ON gt.team_id = t.id
                INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                INNER JOIN team AS t2 ON gt2.team_id = t2.id
                INNER JOIN drive AS d ON g.id = d.game_id
                INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
            ${filter}
        )
        SELECT 	id,
                season,
                week,
                school AS team,
                opponent,
                o_d AS unit,
                COUNT(ppa) AS plays,
                COUNT(DISTINCT(drive_id)) AS drives,
                AVG(ppa) AS ppa,
                SUM(ppa) AS total_ppa,
                AVG(ppa) FILTER(WHERE down_type = 'standard') AS standard_down_ppa,
                AVG(ppa) FILTER(WHERE down_type = 'passing') AS passing_down_ppa,
                AVG(ppa) FILTER(WHERE play_type = 'Pass') AS passing_ppa,
                AVG(ppa) FILTER(WHERE play_type = 'Rush') AS rushing_ppa,
                SUM(ppa) FILTER(WHERE play_type = 'Pass') AS total_passing_ppa,
                SUM(ppa) FILTER(WHERE play_type = 'Rush') AS total_rushing_ppa,
                CAST((COUNT(*) FILTER(WHERE success = true)) AS NUMERIC) / COUNT(*) AS success_rate,
                AVG(ppa) FILTER(WHERE success = true) AS explosiveness,
                CAST((COUNT(*) FILTER(WHERE success = true AND down_type = 'standard')) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE down_type = 'standard'), 0), 1) AS standard_down_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND down_type = 'standard') AS standard_down_explosiveness,
                CAST((COUNT(*) FILTER(WHERE success = true AND down_type = 'passing')) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE down_type = 'passing'), 0), 1) AS passing_down_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND down_type = 'passing') AS passing_down_explosiveness,
                CAST((COUNT(*) FILTER(WHERE success = true AND play_type = 'Rush')) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1) AS rush_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND play_type = 'Rush') AS rush_explosiveness,
                CAST((COUNT(*) FILTER(WHERE success = true AND play_type = 'Pass')) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Pass'), 0), 1) AS pass_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND play_type = 'Pass') AS pass_explosiveness,
                CAST(COUNT(*) FILTER(WHERE distance <= 2 AND play_type = 'Rush' AND success = true) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE distance <= 2 AND play_type = 'Rush'), 0), 1) AS power_success,
                CAST(COUNT(*) FILTER(WHERE play_type = 'Rush' AND yards_gained <= 0) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1) AS stuff_rate,
                COALESCE(CAST(SUM(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1), 0) AS line_yards,
                ROUND(COALESCE(CAST(SUM(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC), 0), 0) AS line_yards_sum,
                CAST(SUM(CASE WHEN yards_gained >= 10 THEN 5 ELSE (yards_gained - 5) END) FILTER(WHERE yards_gained >= 5 AND play_type = 'Rush') AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1) AS second_level_yards,
                CAST(SUM(CASE WHEN yards_gained >= 10 THEN 5 ELSE (yards_gained - 5) END) FILTER(WHERE yards_gained >= 5 AND play_type = 'Rush') AS NUMERIC) AS second_level_yards_sum,
                CAST(SUM(yards_gained - 10) FILTER(WHERE play_type = 'Rush' AND yards_gained >= 10) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1) AS open_field_yards,
                CAST(SUM(yards_gained - 10) FILTER(WHERE play_type = 'Rush' AND yards_gained >= 10) AS NUMERIC) AS open_field_yards_sum
        FROM plays
        ${excludeGarbageTime ? 'WHERE garbage_time = false' : ''}
        GROUP BY id, season, week, school, opponent, o_d
        `,
    params,
  );

  let stats: AdvancedGameStat[] = [];
  let ids = Array.from(new Set(results.map((r) => r.id)));

  for (let id of ids) {
    let teams = Array.from(
      new Set(results.filter((r) => r.id == id).map((r) => r.team)),
    );

    // @ts-ignore
    let gameStats: AdvancedGameStat[] = teams
      .map((t): AdvancedGameStat | null => {
        let offense = results.find(
          (r) => r.id == id && r.team == t && r.unit == 'offense',
        );
        let defense = results.find(
          (r) => r.id == id && r.team == t && r.unit == 'defense',
        );

        if (!offense || !defense) {
          return null;
        }

        return {
          gameId: id,
          season: offense.year,
          week: offense.week,
          team: t,
          opponent: offense.opponent,
          offense: {
            plays: parseInt(offense.plays),
            drives: parseInt(offense.drives),
            ppa: parseFloat(offense.ppa),
            totalPPA: parseFloat(offense.total_ppa),
            successRate: parseFloat(offense.success_rate),
            explosiveness: parseFloat(offense.explosiveness),
            powerSuccess: parseFloat(offense.power_success),
            stuffRate: parseFloat(offense.stuff_rate),
            lineYards: parseFloat(offense.line_yards),
            lineYardsTotal: parseInt(offense.line_yards_sum),
            secondLevelYards: parseFloat(offense.second_level_yards),
            secondLevelYardsTotal: parseInt(offense.second_level_yards_sum),
            openFieldYards: parseFloat(offense.open_field_yards),
            openFieldYardsTotal: parseInt(offense.open_field_yards_sum),
            standardDowns: {
              ppa: parseFloat(offense.standard_down_ppa),
              successRate: parseFloat(offense.standard_down_success_rate),
              explosiveness: parseFloat(offense.standard_down_explosiveness),
            },
            passingDowns: {
              ppa: parseFloat(offense.passing_down_ppa),
              successRate: parseFloat(offense.passing_down_success_rate),
              explosiveness: parseFloat(offense.passing_down_explosiveness),
            },
            rushingPlays: {
              ppa: parseFloat(offense.rushing_ppa),
              totalPPA: parseFloat(offense.total_rushing_ppa),
              successRate: parseFloat(offense.rush_success_rate),
              explosiveness: parseFloat(offense.rush_explosiveness),
            },
            passingPlays: {
              ppa: parseFloat(offense.passing_ppa),
              totalPPA: parseFloat(offense.total_passing_ppa),
              successRate: parseFloat(offense.pass_success_rate),
              explosiveness: parseFloat(offense.pass_explosiveness),
            },
          },
          defense: {
            plays: parseInt(defense.plays),
            drives: parseInt(defense.drives),
            ppa: parseFloat(defense.ppa),
            totalPPA: parseFloat(defense.total_ppa),
            successRate: parseFloat(defense.success_rate),
            explosiveness: parseFloat(defense.explosiveness),
            powerSuccess: parseFloat(defense.power_success),
            stuffRate: parseFloat(defense.stuff_rate),
            lineYards: parseFloat(defense.line_yards),
            lineYardsTotal: parseInt(defense.line_yards_sum),
            secondLevelYards: parseFloat(defense.second_level_yards),
            secondLevelYardsTotal: parseInt(defense.second_level_yards_sum),
            openFieldYards: parseFloat(defense.open_field_yards),
            openFieldYardsTotal: parseInt(defense.open_field_yards_sum),
            standardDowns: {
              ppa: parseFloat(defense.standard_down_ppa),
              successRate: parseFloat(defense.standard_down_success_rate),
              explosiveness: parseFloat(defense.standard_down_explosiveness),
            },
            passingDowns: {
              ppa: parseFloat(defense.passing_down_ppa),
              successRate: parseFloat(defense.passing_down_success_rate),
              explosiveness: parseFloat(defense.passing_down_explosiveness),
            },
            rushingPlays: {
              ppa: parseFloat(defense.rushing_ppa),
              totalPPA: parseFloat(defense.total_rushing_ppa),
              successRate: parseFloat(defense.rush_success_rate),
              explosiveness: parseFloat(defense.rush_explosiveness),
            },
            passingPlays: {
              ppa: parseFloat(defense.passing_ppa),
              totalPPA: parseFloat(defense.total_passing_ppa),
              successRate: parseFloat(defense.pass_success_rate),
              explosiveness: parseFloat(defense.pass_explosiveness),
            },
          },
        };
      })
      .filter((r) => r != null);

    stats = [...stats, ...gameStats];
  }

  return stats;
};

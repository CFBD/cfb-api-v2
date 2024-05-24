import { db } from '../../config/database';
import {
  AdvancedBoxScore,
  PlayerPPA,
  PlayerGameUsage,
  TeamExplosiveness,
  TeamFieldPosition,
  TeamHavoc,
  TeamPPA,
  TeamRushingStats,
  TeamScoringOpportunities,
  TeamSuccessRates,
} from './types';

export const getAdvancedBoxScore = async (
  id: number,
): Promise<AdvancedBoxScore> => {
  const teamTask = db.any(
    `
            WITH havoc AS (
                WITH fumbles AS (
                    SELECT t.school, COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0.0) AS fumbles
                    FROM game AS g
                        INNER JOIN game_team AS gt ON g.id = gt.game_id
                        INNER JOIN team AS t ON gt.team_id = t.id
                        LEFT JOIN game_player_stat AS s ON s.game_team_id = gt.id AND s.type_id = 4 AND s.category_id = 10
                    WHERE g.id = $1
                    GROUP BY t.school
                )
                SELECT 	t.school,
                        (COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0.0) + fumbles) AS total_havoc,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id IN (16,24)), 0.0) AS db_havoc,
                        (COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id = 21), 0.0) + f.fumbles) AS front_seven_havoc
                FROM game AS g
                    INNER JOIN game_team AS gt ON g.id = gt.game_id
                    INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                    INNER JOIN team AS t ON gt.team_id = t.id
                    INNER JOIN game_team_stat AS s ON s.game_team_id = gt.id AND s.type_id IN (16,21,24)
                    LEFT JOIN fumbles AS f ON t.school <> f.school
                WHERE g.id = $1
                GROUP BY t.school, f.fumbles
            ), plays AS (
                SELECT  g.id,
                        g.season,
                        g.week,
                        t.school,
                        g.excitement,
                        gt.win_prob,
                        gt.home_away AS home_away,
                        gt.points AS points,
                        gt.winner AS winner,
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
                        p.period,
                        p.down,
                        p.distance,
                        p.yards_gained,
                        p.ppa AS ppa,
                        COALESCE(h.total_havoc, 0.0) AS total_havoc,
                        COALESCE(h.db_havoc, 0.0) AS db_havoc,
                        COALESCE(h.front_seven_havoc, 0.0) AS front_seven_havoc
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
                    INNER JOIN team AS t ON p.offense_id = t.id
                    INNER JOIN game_team AS gt ON g.id = gt.game_id AND gt.team_id = t.id
                    LEFT JOIN havoc AS h ON t.school <> h.school
                WHERE g.id = $1
            )
            SELECT 	school AS team,
                    home_away,
                    points,
                    winner,
                    excitement,
                    win_prob,
                    COUNT(*) AS plays,
                    ROUND(CAST(AVG(ppa) AS NUMERIC), 4) AS ppa,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE period = 1) AS NUMERIC), 3) AS ppa_1,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE period = 2) AS NUMERIC), 3) AS ppa_2,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE period = 3) AS NUMERIC), 3) AS ppa_3,
                    COALESCE(ROUND(CAST(AVG(ppa) FILTER(WHERE period = 4) AS NUMERIC), 3), 0) AS ppa_4,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Pass') AS NUMERIC), 3) AS passing_ppa,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Pass' AND period = 1) AS NUMERIC), 3) AS passing_ppa_1,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Pass' AND period = 2) AS NUMERIC), 3) AS passing_ppa_2,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Pass' AND period = 3) AS NUMERIC), 3) AS passing_ppa_3,
                    COALESCE(ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Pass' AND period = 4) AS NUMERIC), 3), 0) AS passing_ppa_4,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Rush') AS NUMERIC), 3) AS rushing_ppa,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Rush' AND period = 1) AS NUMERIC), 3) AS rushing_ppa_1,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Rush' AND period = 2) AS NUMERIC), 3) AS rushing_ppa_2,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Rush' AND period = 3) AS NUMERIC), 3) AS rushing_ppa_3,
                    COALESCE(ROUND(CAST(AVG(ppa) FILTER(WHERE play_type = 'Rush' AND period = 4) AS NUMERIC), 3), 0) AS rushing_ppa_4,
                    ROUND(CAST(SUM(ppa) AS NUMERIC), 1) AS cum_ppa,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE period = 1) AS NUMERIC), 1) AS cum_ppa_1,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE period = 2) AS NUMERIC), 1) AS cum_ppa_2,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE period = 3) AS NUMERIC), 1) AS cum_ppa_3,
                    COALESCE(ROUND(CAST(SUM(ppa) FILTER(WHERE period = 4) AS NUMERIC), 1), 0) AS cum_ppa_4,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Pass') AS NUMERIC), 1) AS cum_passing_ppa,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Pass' AND period = 1) AS NUMERIC), 1) AS cum_passing_ppa_1,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Pass' AND period = 2) AS NUMERIC), 1) AS cum_passing_ppa_2,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Pass' AND period = 3) AS NUMERIC), 1) AS cum_passing_ppa_3,
                    COALESCE(ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Pass' AND period = 4) AS NUMERIC), 1), 0) AS cum_passing_ppa_4,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Rush') AS NUMERIC), 1) AS cum_rushing_ppa,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Rush' AND period = 1) AS NUMERIC), 1) AS cum_rushing_ppa_1,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Rush' AND period = 2) AS NUMERIC), 1) AS cum_rushing_ppa_2,
                    ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Rush' AND period = 3) AS NUMERIC), 1) AS cum_rushing_ppa_3,
                    COALESCE(ROUND(CAST(SUM(ppa) FILTER(WHERE play_type = 'Rush' AND period = 4) AS NUMERIC), 1), 0) AS cum_rushing_ppa_4,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END), 3) AS success_rate,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 1), 3) AS success_rate_1,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 2), 3) AS success_rate_2,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 3), 3) AS success_rate_3,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 4), 3) AS success_rate_4,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE down_type = 'standard'), 3) AS standard_success_rate,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 1 AND down_type = 'standard'), 3) AS standard_success_rate_1,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 2 AND down_type = 'standard'), 3) AS standard_success_rate_2,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 3 AND down_type = 'standard'), 3) AS standard_success_rate_3,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 4 AND down_type = 'standard'), 3) AS standard_success_rate_4,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE down_type = 'passing'), 3) AS passing_success_rate,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 1 AND down_type = 'passing'), 3) AS passing_success_rate_1,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 2 AND down_type = 'passing'), 3) AS passing_success_rate_2,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 3 AND down_type = 'passing'), 3) AS passing_success_rate_3,
                    ROUND(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE period = 4 AND down_type = 'passing'), 3) AS passing_success_rate_4,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE success = true) AS NUMERIC), 2) AS explosiveness,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE success = true AND period = 1) AS NUMERIC), 2) AS explosiveness_1,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE success = true AND period = 2) AS NUMERIC), 2) AS explosiveness_2,
                    ROUND(CAST(AVG(ppa) FILTER(WHERE success = true AND period = 3) AS NUMERIC), 2) AS explosiveness_3,
                    COALESCE(ROUND(CAST(AVG(ppa) FILTER(WHERE success = true AND period = 4) AS NUMERIC), 2), 0) AS explosiveness_4,
                    ROUND(CAST(COUNT(*) FILTER(WHERE distance <= 2 AND play_type = 'Rush' AND success = true) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE distance <= 2 AND play_type = 'Rush'), 0), 1), 3) AS power_success,
                    ROUND(CAST(COUNT(*) FILTER(WHERE play_type = 'Rush' AND yards_gained <= 0) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1), 3) AS stuff_rate,
                    ROUND(COALESCE(CAST(SUM(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC), 0), 0) AS line_yards,
                    COALESCE(CAST(SUM(CASE WHEN yards_gained >= 10 THEN 5 ELSE (yards_gained - 5) END) FILTER(WHERE yards_gained >= 5 AND play_type = 'Rush') AS NUMERIC), 0) AS second_level_yards,
                    COALESCE(CAST(SUM(yards_gained - 10) FILTER(WHERE play_type = 'Rush' AND yards_gained >= 10) AS NUMERIC), 0) AS open_field_yards,
                    COALESCE(ROUND(CAST(SUM(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1), 1), 0) AS line_yards_avg,
                    COALESCE(ROUND(CAST(SUM(CASE WHEN yards_gained >= 10 THEN 5 ELSE (yards_gained - 5) END) FILTER(WHERE yards_gained >= 5 AND play_type = 'Rush') AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1), 1), 0) AS second_level_yards_avg,
                    COALESCE(ROUND(CAST(SUM(yards_gained - 10) FILTER(WHERE play_type = 'Rush' AND yards_gained >= 10) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1), 1), 0) AS open_field_yards_avg,
                    ROUND(total_havoc / COUNT(*), 3) AS total_havoc,
                    ROUND(db_havoc / COUNT(*), 3) AS db_havoc,
                    ROUND(front_seven_havoc / COUNT(*), 3) AS front_seven_havoc,
                    COUNT(*) AS plays,
                    COUNT(*) FILTER(WHERE period = 1) AS plays_1,
                    COUNT(*) FILTER(WHERE period = 2) AS plays_2,
                    COUNT(*) FILTER(WHERE period = 3) AS plays_3,
                    COUNT(*) FILTER(WHERE period = 4) AS plays_4
            FROM plays
            WHERE garbage_time = false
            GROUP BY school, home_away, points, winner, excitement, win_prob, total_havoc, db_havoc, front_seven_havoc
        `,
    [id],
  );

  const playerTask = db.any(
    `
            WITH plays AS (
                SELECT DISTINCT t.id AS team_id,
                                t.school,
                                a.id,
                                a.name,
                                po.abbreviation AS position,
                                p.id AS play_id,
                                p.period,
                                p.down,
                                CASE
                                    WHEN p.play_type_id IN (3,4,6,7,24,26,36,51,67) THEN 'Pass'
                                    WHEN p.play_type_id IN (5,9,29,39,68) THEN 'Rush'
                                    ELSE 'Other'
                                END AS play_type,
                                CASE
                                    WHEN p.down = 2 AND p.distance >= 8 THEN 'passing'
                                    WHEN p.down IN (3,4) AND p.distance >= 5 THEN 'passing'
                                    ELSE 'standard'
                                END AS down_type,
                                CASE
                                    WHEN p.period = 2 AND p.scoring = false AND ABS(p.home_score - p.away_score) > 38 THEN true
                                    WHEN p.period = 3 AND p.scoring = false AND ABS(p.home_score - p.away_score) > 28 THEN true
                                    WHEN p.period = 4 AND p.scoring = false AND ABS(p.home_score - p.away_score) > 22 THEN true
                                    WHEN p.period = 2 AND p.scoring = true AND ABS(p.home_score - p.away_score) > 45 THEN true
                                    WHEN p.period = 3 AND p.scoring = true AND ABS(p.home_score - p.away_score) > 35 THEN true
                                    WHEN p.period = 4 AND p.scoring = true AND ABS(p.home_score - p.away_score) > 29 THEN true
                                    ELSE false
                                END AS garbage_time,
                                p.ppa
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
                    INNER JOIN team AS t ON p.offense_id = t.id
                    INNER JOIN play_stat AS ps ON p.id = ps.play_id
                    INNER JOIN athlete AS a ON ps.athlete_id = a.id
                    INNER JOIN athlete_team AS att ON a.id = att.athlete_id AND att.start_year <= g.season AND att.end_year >= g.season AND att.team_id = t.id
                    INNER JOIN position AS po ON a.position_id = po.id
                WHERE g.id = $1
            ), teams AS (
                SELECT 	t.id,
                        t.school,
                        p.period,
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
                        p.ppa
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
                    INNER JOIN team AS t ON p.offense_id = t.id
                WHERE g.id = $1
            ), team_counts AS (
                SELECT 	id,
                        school,
                        COALESCE(NULLIF(COUNT(*), 0), 1) AS plays,
                        COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1) AS rush,
                        COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Pass'), 0), 1) AS pass,
                        COALESCE(NULLIF(COUNT(*) FILTER(WHERE period = 1), 0), 1) AS plays_1,
                        COALESCE(NULLIF(COUNT(*) FILTER(WHERE period = 2), 0), 1) AS plays_2,
                        COALESCE(NULLIF(COUNT(*) FILTER(WHERE period = 3), 0), 1) AS plays_3,
                        COALESCE(NULLIF(COUNT(*) FILTER(WHERE period = 4), 0), 1) AS plays_4
                FROM teams
                WHERE garbage_time = false
                GROUP BY id, school
            )
            SELECT p.id,
                p."name",
                p.position,
                p.school,
                COUNT(p.ppa) AS plays,
                ROUND(CAST(CAST(COUNT(p.ppa) AS NUMERIC) / t.plays AS NUMERIC), 3) AS overall_usage,
                ROUND(CAST(CAST(COUNT(p.ppa) FILTER(WHERE p.period = 1) AS NUMERIC) / t.plays_1 AS NUMERIC), 3) AS overall_usage_1,
                ROUND(CAST(CAST(COUNT(p.ppa) FILTER(WHERE p.period = 2) AS NUMERIC) / t.plays_2 AS NUMERIC), 3) AS overall_usage_2,
                ROUND(CAST(CAST(COUNT(p.ppa) FILTER(WHERE p.period = 3) AS NUMERIC) / t.plays_3 AS NUMERIC), 3) AS overall_usage_3,
                ROUND(CAST(CAST(COUNT(p.ppa) FILTER(WHERE p.period = 4) AS NUMERIC) / t.plays_4 AS NUMERIC), 3) AS overall_usage_4,
                ROUND(CAST(CAST(COUNT(p.ppa) FILTER(WHERE p.play_type = 'Pass') AS NUMERIC) / t.pass AS NUMERIC), 3) AS pass_usage,
                ROUND(CAST(CAST(COUNT(p.ppa) FILTER(WHERE p.play_type = 'Rush') AS NUMERIC) / t.rush AS NUMERIC), 3) AS rush_usage,
                ROUND(CAST(AVG(p.ppa) AS NUMERIC), 3) AS ppa,
                COALESCE(ROUND(CAST(AVG(p.ppa) FILTER(WHERE p.period = 1) AS NUMERIC), 3), 0) AS ppa_1,
                COALESCE(ROUND(CAST(AVG(p.ppa) FILTER(WHERE p.period = 2) AS NUMERIC), 3), 0) AS ppa_2,
                COALESCE(ROUND(CAST(AVG(p.ppa) FILTER(WHERE p.period = 3) AS NUMERIC), 3), 0) AS ppa_3,
                COALESCE(ROUND(CAST(AVG(p.ppa) FILTER(WHERE p.period = 4) AS NUMERIC), 3), 0) AS ppa_4,
                COALESCE(ROUND(CAST(AVG(p.ppa) FILTER(WHERE p.play_type = 'Pass') AS NUMERIC), 3), 0) AS ppa_pass,
                COALESCE(ROUND(CAST(AVG(p.ppa) FILTER(WHERE p.play_type = 'Rush') AS NUMERIC), 3), 0) AS ppa_rush,
                ROUND(CAST(SUM(p.ppa) AS NUMERIC), 1) AS cum_ppa,
                COALESCE(ROUND(CAST(SUM(p.ppa) FILTER(WHERE p.period = 1) AS NUMERIC), 1), 0) AS cum_ppa_1,
                COALESCE(ROUND(CAST(SUM(p.ppa) FILTER(WHERE p.period = 2) AS NUMERIC), 1), 0) AS cum_ppa_2,
                COALESCE(ROUND(CAST(SUM(p.ppa) FILTER(WHERE p.period = 3) AS NUMERIC), 1), 0) AS cum_ppa_3,
                COALESCE(ROUND(CAST(SUM(p.ppa) FILTER(WHERE p.period = 4) AS NUMERIC), 1), 0) AS cum_ppa_4,
                COALESCE(ROUND(CAST(SUM(p.ppa) FILTER(WHERE p.play_type = 'Pass') AS NUMERIC), 1), 0) AS cum_ppa_pass,
                COALESCE(ROUND(CAST(SUM(p.ppa) FILTER(WHERE p.play_type = 'Rush') AS NUMERIC), 1), 0) AS cum_ppa_rush
            FROM plays AS p
                INNER JOIN team_counts AS t ON p.team_id = t.id
            WHERE position IN ('QB', 'RB', 'FB', 'TE', 'WR') AND p.garbage_time = false
            GROUP BY p.id, p."name", p.position, p.school, t.plays, t.pass, t.rush, t.plays_1, t.plays_2, t.plays_3, t.plays_4
            ORDER BY overall_usage DESC
        `,
    [id],
  );

  const scoringOppTask = db.any(
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
                WHERE g.id = $1 AND d.start_period < 5
            ), drives AS (
                SELECT season, drive_id, MIN(yardsToGoal) AS min_yards
                FROM drive_data
                GROUP BY season, drive_id
            ), drive_points AS (
                SELECT  t.school AS team,
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
            SELECT team, unit, COUNT(*) AS opportunities, ROUND(AVG(points), 2) AS avg_points, SUM(points) AS points
            FROM drive_points
            GROUP BY season, team, unit
        `,
    [id],
  );

  const fieldPositionTask = db.any(
    `
WITH offensive_drives AS (
	SELECT 	t.id AS team_id,
			AVG(CASE
				WHEN gt.home_away = 'home' THEN (100 - d.start_yardline)
				ELSE d.start_yardline
			END) as drive_start,
			AVG(ppa.predicted_points) AS ppa
	FROM game AS g
		LEFT JOIN drive AS d ON g.id = d.game_id AND d.start_period < 5 AND d.result_id NOT IN (28, 41, 43, 44, 57)
		LEFT JOIN game_team AS gt ON g.id = gt.game_id AND gt.team_id = d.offense_id
		LEFT JOIN team AS t ON d.offense_id = t.id
		LEFT JOIN conference_team AS ct ON t.id = ct.team_id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
		LEFT JOIN ppa ON ppa.down = 1 AND ppa.distance = 10 AND ((gt.home_away = 'home' AND (100 - d.start_yardline) = ppa.yard_line) OR (gt.home_away = 'away' AND d.start_yardline = ppa.yard_line))
	WHERE g.id = $1
	GROUP BY t.id
), defensive_drives AS (
	SELECT 	t.id AS team_id,
			AVG(CASE
				WHEN gt.home_away = 'away' THEN (100 - d.start_yardline)
				ELSE d.start_yardline
			END) as drive_start,
			AVG(ppa.predicted_points) AS ppa
	FROM game AS g
		LEFT JOIN drive AS d ON g.id = d.game_id AND d.start_period < 5 AND d.result_id NOT IN (28, 41, 43, 44, 57)
		LEFT JOIN game_team AS gt ON g.id = gt.game_id AND gt.team_id = d.defense_id
		LEFT JOIN team AS t ON d.defense_id = t.id
		LEFT JOIN conference_team AS ct ON t.id = ct.team_id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
		LEFT JOIN ppa ON ppa.down = 1 AND ppa.distance = 10 AND ((gt.home_away = 'away' AND (100 - d.start_yardline) = ppa.yard_line) OR (gt.home_away = 'home' AND d.start_yardline = ppa.yard_line))
	WHERE g.id = $1
	GROUP BY t.id
)
SELECT 	t.school,
		ROUND(o.drive_start, 1) AS avg_start_off,
		ROUND((o.ppa), 2) AS avg_predicted_points_off,
		ROUND((d.drive_start), 1) AS avg_start_def,
		ROUND((-d.ppa), 2) AS avg_predicted_points_def
FROM team AS t
	INNER JOIN offensive_drives AS o ON o.team_id = t.id
	INNER JOIN defensive_drives AS d ON t.id = d.team_id
        `,
    [id],
  );

  const results = await db.task(async (t) => {
    return await t.batch([
      teamTask,
      playerTask,
      scoringOppTask,
      fieldPositionTask,
    ]);
  });

  const teamResults = results[0];
  const playerResults = results[1];
  const scoringOppResults = results[2];
  const fieldPositionResults = results[3];

  let teams = Array.from(new Set(teamResults.map((t) => t.team)));

  const homeTeam = teamResults.find((t) => t.home_away == 'home');
  const awayTeam = teamResults.find((t) => t.team != homeTeam.team);

  return {
    gameInfo: {
      homeTeam: homeTeam.team,
      homePoints: homeTeam.points,
      homeWinProb: homeTeam.win_prob,
      awayTeam: awayTeam.team,
      awayPoints: awayTeam.points,
      awayWinProb: awayTeam.win_prob,
      homeWinner: homeTeam.winner,
      excitement: homeTeam.excitement,
    },
    teams: {
      ppa: teamResults.map(
        (t): TeamPPA => ({
          team: t.team,
          plays: parseInt(t.plays),
          overall: {
            total: parseFloat(t.ppa),
            quarter1: parseFloat(t.ppa_1),
            quarter2: parseFloat(t.ppa_2),
            quarter3: parseFloat(t.ppa_3),
            quarter4: parseFloat(t.ppa_4),
          },
          passing: {
            total: parseFloat(t.passing_ppa),
            quarter1: parseFloat(t.passing_ppa_1),
            quarter2: parseFloat(t.passing_ppa_2),
            quarter3: parseFloat(t.passing_ppa_3),
            quarter4: parseFloat(t.passing_ppa_4),
          },
          rushing: {
            total: parseFloat(t.rushing_ppa),
            quarter1: parseFloat(t.rushing_ppa_1),
            quarter2: parseFloat(t.rushing_ppa_2),
            quarter3: parseFloat(t.rushing_ppa_3),
            quarter4: parseFloat(t.rushing_ppa_4),
          },
        }),
      ),
      cumulativePpa: teamResults.map(
        (t): TeamPPA => ({
          team: t.team,
          plays: parseInt(t.plays),
          overall: {
            total: parseFloat(t.cum_ppa),
            quarter1: parseFloat(t.cum_ppa_1),
            quarter2: parseFloat(t.cum_ppa_2),
            quarter3: parseFloat(t.cum_ppa_3),
            quarter4: parseFloat(t.cum_ppa_4),
          },
          passing: {
            total: parseFloat(t.cum_passing_ppa),
            quarter1: parseFloat(t.cum_passing_ppa_1),
            quarter2: parseFloat(t.cum_passing_ppa_2),
            quarter3: parseFloat(t.cum_passing_ppa_3),
            quarter4: parseFloat(t.cum_passing_ppa_4),
          },
          rushing: {
            total: parseFloat(t.cum_rushing_ppa),
            quarter1: parseFloat(t.cum_rushing_ppa_1),
            quarter2: parseFloat(t.cum_rushing_ppa_2),
            quarter3: parseFloat(t.cum_rushing_ppa_3),
            quarter4: parseFloat(t.cum_rushing_ppa_4),
          },
        }),
      ),
      successRates: teamResults.map(
        (t): TeamSuccessRates => ({
          team: t.team,
          overall: {
            total: parseFloat(t.success_rate),
            quarter1: parseFloat(t.success_rate_1),
            quarter2: parseFloat(t.success_rate_2),
            quarter3: parseFloat(t.success_rate_3),
            quarter4: parseFloat(t.success_rate_4),
          },
          standardDowns: {
            total: parseFloat(t.standard_success_rate),
            quarter1: parseFloat(t.standard_success_rate_1),
            quarter2: parseFloat(t.standard_success_rate_2),
            quarter3: parseFloat(t.standard_success_rate_3),
            quarter4: parseFloat(t.standard_success_rate_4),
          },
          passingDowns: {
            total: parseFloat(t.passing_success_rate),
            quarter1: parseFloat(t.passing_success_rate_1),
            quarter2: parseFloat(t.passing_success_rate_2),
            quarter3: parseFloat(t.passing_success_rate_3),
            quarter4: parseFloat(t.passing_success_rate_4),
          },
        }),
      ),
      explosiveness: teamResults.map(
        (t): TeamExplosiveness => ({
          team: t.team,
          overall: {
            total: parseFloat(t.explosiveness),
            quarter1: parseFloat(t.explosiveness_1),
            quarter2: parseFloat(t.explosiveness_2),
            quarter3: parseFloat(t.explosiveness_3),
            quarter4: parseFloat(t.explosiveness_4),
          },
        }),
      ),
      rushing: teamResults.map(
        (t): TeamRushingStats => ({
          team: t.team,
          powerSuccess: t.power_success,
          stuffRate: t.stuff_rate,
          lineYards: t.line_yards,
          lineYardsAverage: t.line_yards_avg,
          secondLevelYards: t.second_level_yards,
          secondLevelYardsAverage: t.second_level_yards_avg,
          openFieldYards: t.open_field_yards,
          openFieldYardsAverage: t.open_field_yards_avg,
        }),
      ),
      havoc: teamResults.map(
        (t): TeamHavoc => ({
          team: teams.find((te) => te != t.team),
          total: t.total_havoc,
          frontSeven: t.front_seven_havoc,
          db: t.db_havoc,
        }),
      ),
      scoringOpportunities: teamResults.map((t): TeamScoringOpportunities => {
        let scoring = scoringOppResults.find(
          (o) => t.team == o.team && o.unit == 'offense',
        );

        return {
          team: t.team,
          opportunities: scoring ? parseInt(scoring.opportunities) : 0,
          points: scoring ? parseInt(scoring.points) : 0,
          pointsPerOpportunity: scoring ? parseFloat(scoring.avg_points) : 0,
        };
      }),
      fieldPosition: teamResults.map((t): TeamFieldPosition => {
        let fieldPosition = fieldPositionResults.find(
          (o) => t.team == o.school,
        );

        return {
          team: t.team,
          averageStart: fieldPosition.avg_start_off,
          averageStartingPredictedPoints:
            fieldPosition.avg_predicted_points_off,
        };
      }),
    },
    players: {
      usage: playerResults.map(
        (p): PlayerGameUsage => ({
          player: p.name,
          team: p.school,
          position: p.position,
          total: parseFloat(p.overall_usage),
          quarter1: parseFloat(p.overall_usage_1),
          quarter2: parseFloat(p.overall_usage_2),
          quarter3: parseFloat(p.overall_usage_3),
          quarter4: parseFloat(p.overall_usage_4),
          rushing: parseFloat(p.rush_usage),
          passing: parseFloat(p.pass_usage),
        }),
      ),
      ppa: playerResults.map(
        (p): PlayerPPA => ({
          player: p.name,
          team: p.school,
          position: p.position,
          average: {
            total: parseFloat(p.ppa),
            quarter1: parseFloat(p.ppa_1),
            quarter2: parseFloat(p.ppa_2),
            quarter3: parseFloat(p.ppa_3),
            quarter4: parseFloat(p.ppa_4),
            rushing: parseFloat(p.ppa_rush),
            passing: parseFloat(p.ppa_pass),
          },
          cumulative: {
            total: parseFloat(p.cum_ppa),
            quarter1: parseFloat(p.cum_ppa_1),
            quarter2: parseFloat(p.cum_ppa_2),
            quarter3: parseFloat(p.cum_ppa_3),
            quarter4: parseFloat(p.cum_ppa_4),
            rushing: parseFloat(p.cum_ppa_rush),
            passing: parseFloat(p.cum_ppa_pass),
          },
        }),
      ),
    },
  };
};

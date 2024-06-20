import { db } from '../../config/database';
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
  let filters = ['g.season = $1'];
  let params: any[] = [year];
  let index = 2;

  if (seasonType !== SeasonType.Both) {
    filters.push(`g.season_type = $${index}`);
    params.push(seasonType || SeasonType.Regular);
    index++;
  }

  if (week) {
    filters.push(`g.week = $${index}`);
    params.push(week);
    index++;
  }

  if (team) {
    filters.push(
      `(LOWER(offense.school) = LOWER($${index}) OR LOWER(defense.school) = LOWER($${index}))`,
    );
    params.push(team);
    index++;
  }

  if (offense) {
    filters.push(`LOWER(offense.school) = LOWER($${index})`);
    params.push(offense);
    index++;
  }

  if (defense) {
    filters.push(`LOWER(defense.school) = LOWER($${index})`);
    params.push(defense);
    index++;
  }

  if (offenseConference) {
    filters.push(`LOWER(oc.abbreviation) = LOWER($${index})`);
    params.push(offenseConference);
    index++;
  }

  if (defenseConference) {
    filters.push(`LOWER(dc.abbreviation) = LOWER($${index})`);
    params.push(defenseConference);
    index++;
  }

  if (conference) {
    filters.push(
      `(LOWER(oc.abbreviation) = LOWER($${index}) OR LOWER(dc.abbreviation) = LOWER($${index}))`,
    );
    params.push(conference);
    index++;
  }

  if (classification) {
    filters.push(`(oc.division = $${index} OR dc.division = $${index})`);
    params.push(classification.toLowerCase());
    index++;
  }

  const filter = `WHERE ${filters.join(' AND ')}`;

  const drives = await db.any(
    `
        WITH drives AS (
            SELECT  offense.school as offense,
                    oc.name as offense_conference,
                    defense.school as defense,
                    dc.name as defense_conference,
                    g.id as game_id,
                    d.id,
                    d.drive_number,
                    d.scoring,
                    d.start_period,
                    d.start_yardline,
                    CASE WHEN offense.id = hgt.team_id THEN (100 - d.start_yardline) ELSE d.start_yardline END AS start_yards_to_goal,
                    d.start_time,
                    d.end_period,
                    d.end_yardline,
                    CASE WHEN offense.id = hgt.team_id THEN (100 - d.end_yardline) ELSE d.end_yardline END AS end_yards_to_goal,
                    d.end_time,
                    d.elapsed,
                    d.plays,
                    d.yards,
                    dr.name as drive_result,
                    CASE WHEN offense.id = hgt.team_id THEN true ELSE false END AS is_home_offense
            FROM game g
                INNER JOIN game_team AS hgt ON g.id = hgt.game_id AND hgt.home_away = 'home'
                INNER JOIN drive d ON g.id = d.game_id
                INNER JOIN team offense ON d.offense_id = offense.id
                LEFT JOIN conference_team oct ON offense.id = oct.team_id AND oct.start_year <= g.season AND (oct.end_year >= g.season OR oct.end_year IS NULL)
                LEFT JOIN conference oc ON oct.conference_id = oc.id
                INNER JOIN team defense ON d.defense_id = defense.id
                LEFT JOIN conference_team dct ON defense.id = dct.team_id AND dct.start_year <= g.season AND (dct.end_year >= g.season OR dct.end_year IS NULL)
                LEFT JOIN conference dc ON dct.conference_id = dc.id
                INNER JOIN drive_result dr ON d.result_id = dr.id
            ${filter}
            ORDER BY g.id, d.drive_number
        ), points AS (
            SELECT d.id, MIN(p.home_score) AS starting_home_score, MIN(p.away_score) AS starting_away_score, MAX(p.home_score) AS ending_home_score, MAX(p.away_score) AS ending_away_score
            FROM drives AS d
                INNER JOIN play AS p ON d.id = p.drive_id
            GROUP BY d.id
        )
        SELECT d.*,
                CASE WHEN d.is_home_offense THEN p.starting_home_score ELSE p.starting_away_score END AS start_offense_score,
                CASE WHEN d.is_home_offense THEN p.starting_away_score ELSE p.starting_home_score END AS start_defense_score,
                CASE WHEN d.is_home_offense THEN p.ending_home_score ELSE p.ending_away_score END AS end_offense_score,
                CASE WHEN d.is_home_offense THEN p.ending_away_score ELSE p.ending_home_score END AS end_defense_score
        FROM drives AS d
            INNER JOIN points AS p ON d.id = p.id
                        `,
    params,
  );

  for (let drive of drives) {
    if (!drive.start_time.minutes) {
      drive.start_time.minutes = 0;
    }

    if (!drive.start_time.seconds) {
      drive.start_time.seconds = 0;
    }

    if (!drive.end_time.minutes) {
      drive.end_time.minutes = 0;
    }

    if (!drive.end_time.seconds) {
      drive.end_time.seconds = 0;
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
      gameId: d.game_id,
      offense: d.offense,
      offenseConference: d.offense_conference,
      defense: d.defense,
      defenseConference: d.defense_conference,
      driveNumber: d.drive_number,
      scoring: d.scoring,
      startPeriod: d.start_period,
      startYardline: d.start_yardline,
      startYardsToGoal: d.start_yards_to_goal,
      startTime: {
        minutes: d.start_time.minutes,
        seconds: d.start_time.seconds,
      },
      endPeriod: d.end_period,
      endYardline: d.end_yardline,
      endYardsToGoal: d.end_yards_to_goal,
      endTime: {
        minutes: d.end_time.minutes,
        seconds: d.end_time.seconds,
      },
      plays: d.plays,
      yards: d.yards,
      driveResult: d.drive_result,
      isHomeOffense: d.is_home_offense,
      startOffenseScore: d.start_offense_score,
      startDefenseScore: d.start_defense_score,
      endOffenseScore: d.end_offense_score,
      endDefenseScore: d.end_defense_score,
    }),
  );
};

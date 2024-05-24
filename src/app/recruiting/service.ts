import { ValidateError } from 'tsoa';
import { db } from '../../config/database';
import { RecruitClassification } from '../enums';
import {
  AggregatedTeamRecruiting,
  Recruit,
  TeamRecruitingRanking,
} from './types';

export const getPlayerRankings = async (
  year?: number,
  team?: string,
  position?: string,
  state?: string,
  classification?: RecruitClassification,
): Promise<Recruit[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  let filters = ['r.recruit_type = $1'];
  let params: any[] = [classification ?? RecruitClassification.HighSchool];

  let index = 2;

  if (year) {
    filters.push(`r.year = $${index}`);
    params.push(year);
    index++;
  }

  if (position) {
    filters.push(`LOWER(pos.position) = LOWER($${index})`);
    params.push(position);
    index++;
  }

  if (state) {
    filters.push(`LOWER(h.state) = LOWER($${index})`);
    params.push(state);
    index++;
  }

  if (team) {
    filters.push(`LOWER(t.school) = LOWER($${index})`);
    params.push(team);
    index++;
  }

  const filter = 'WHERE ' + filters.join(' AND ');

  let recruits = await db.any(
    `
                SELECT r.id, r.recruit_type, r.year, r.ranking, r.name, rs.name AS school, pos.position, r.height, r.weight, r.stars, r.rating, t.school AS committed_to, h.city AS city, h.state AS state_province, h.country AS country, h.latitude, h.longitude, h.county_fips, a.id AS athlete_id
                FROM recruit AS r
                    LEFT JOIN recruit_school AS rs ON r.recruit_school_id = rs.id
                    LEFT JOIN recruit_position AS pos ON r.recruit_position_id = pos.id
                    LEFT JOIN team AS t ON r.college_id = t.id
                    LEFT JOIN hometown AS h ON r.hometown_id = h.id
                    LEFT JOIN athlete AS a ON r.athlete_id = a.id
                ${filter}
                ORDER BY r.ranking
            `,
    params,
  );

  return recruits.map(
    (r): Recruit => ({
      id: r.id,
      athleteId: r.athlete_id,
      recruitType: r.recruit_type,
      year: r.year,
      ranking: r.ranking,
      name: r.name,
      school: r.school,
      committedTo: r.committed_to,
      position: r.position,
      height: r.height,
      weight: r.weight,
      stars: r.stars,
      rating: r.rating,
      city: r.city,
      stateProvince: r.state_province,
      country: r.country,
      hometownInfo: {
        latitude: r.latitude,
        longitude: r.longitude,
        fipsCode: r.county_fips,
      },
    }),
  );
};

export const getTeamRankings = async (
  year?: number,
  team?: string,
): Promise<TeamRecruitingRanking[]> => {
  let filters = [];
  let params: any[] = [];
  let index = 1;

  if (year) {
    filters.push(`rt.year = $${index}`);
    params.push(year);
    index++;
  }

  if (team) {
    filters.push(`LOWER(t.school) = LOWER($${index})`);
    params.push(team);
  }

  let filter = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  let ranks = await db.any(
    `
                SELECT rt.year, rt.rank, t.school AS team, rt.points
                FROM recruiting_team AS rt
                    INNER JOIN team AS t ON rt.team_id = t.id
                ${filter}
                ORDER BY year, rank
            `,
    params,
  );

  return ranks;
};

export const getAggregatedPlayerRatings = async (
  team?: string,
  conference?: string,
  recruitType?: RecruitClassification,
  startYear?: number,
  endYear?: number,
): Promise<AggregatedTeamRecruiting[]> => {
  let filters: string[] = [
    'r.recruit_type = $1',
    'r.year <= $2',
    'r.year >= $3',
  ];

  let params: (string | number)[] = [
    recruitType ?? RecruitClassification.HighSchool,
    endYear ?? new Date().getFullYear(),
    startYear ?? 2000,
  ];
  let index = 4;

  if (conference) {
    filters.push(`LOWER(c.abbreviation) = LOWER($${index})`);
    params.push(conference);
    index++;
  }

  if (team) {
    filters.push(`LOWER(t.school) = LOWER($${index})`);
    params.push(team);
    index++;
  }

  const filter = `WHERE ${filters.join(' AND ')}`;

  let results = await db.any(
    `
                    SELECT t.school, p.position_group, c.name as conference, AVG(r.rating) AS avg_rating, SUM(r.rating) AS total_rating, COUNT(r.id) AS total_commits, AVG(stars) AS avg_stars
                    FROM recruit_position AS p
                        INNER JOIN recruit AS r ON p.id = r.recruit_position_id
                        INNER JOIN team AS t ON r.college_id = t.id
                        INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= $2 AND (ct.end_year IS NULL OR ct.end_year >= $2)
                        INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
                    ${filter}
                    GROUP BY t.school, p.position_group, c.name
                    ORDER BY t.school, p.position_group
                `,
    params,
  );

  const totalResults = await db.any(
    `
                    SELECT t.school, 'All Positions' AS position_group, c.name as conference, AVG(r.rating) AS avg_rating, SUM(r.rating) AS total_rating, COUNT(r.id) AS total_commits, AVG(stars) AS avg_stars
                    FROM recruit_position AS p
                        INNER JOIN recruit AS r ON p.id = r.recruit_position_id
                        INNER JOIN team AS t ON r.college_id = t.id
                        INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.start_year <= $2 AND (ct.end_year IS NULL OR ct.end_year >= $2)
                        INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
                    ${filter}
                    GROUP BY t.school, c.name
                    ORDER BY t.school
                `,
    params,
  );

  results = [...results, ...totalResults];

  return results.map(
    (r): AggregatedTeamRecruiting => ({
      team: r.school,
      conference: r.conference,
      positionGroup: r.position_group,
      averageRating: parseFloat(r.avg_rating),
      totalRating: parseFloat(r.total_rating),
      commits: parseInt(r.total_commits),
      averageStars: parseFloat(r.avg_stars),
    }),
  );
};

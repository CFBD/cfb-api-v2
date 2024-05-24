import { ValidateError } from 'tsoa';
import { db } from '../../config/database';
import {
  Conference,
  Matchup,
  MatchupGame,
  RosterPlayer,
  Team,
  TeamTalent,
  Venue,
} from './types';

export const getTeams = async (conference?: string): Promise<Team[]> => {
  let filter = conference ? 'WHERE LOWER(c.abbreviation) = LOWER($1)' : '';
  let params = [conference];

  let teams = await db.any(
    `
        SELECT t.id, t.school, t.mascot, t.abbreviation, t.alt_name as alt_name1, t.abbreviation as alt_name2, t.nickname as alt_name3, t.twitter, c.division AS classification, c.name as conference, ct.division as division, ('#' || t.color) as color, ('#' || t.alt_color) as alt_color, t.images as logos, v.id AS venue_id, v.name AS venue_name, v.capacity, v.grass, v.city, v.state, v.zip, v.country_code, v.location, v.elevation, v.year_constructed, v.dome, v.timezone
        FROM team t
            LEFT JOIN venue AS v ON t.venue_id = v.id
            LEFT JOIN conference_team ct ON t.id = ct.team_id AND ct.end_year IS NULL
            LEFT JOIN  conference c ON c.id = ct.conference_id
        ${filter}
        ORDER BY t.active DESC, t.school
    `,
    params,
  );

  return teams.map(
    (t): Team => ({
      id: t.id,
      school: t.school,
      mascot: t.mascot,
      abbreviation: t.abbreviation,
      alternateNames: [t.alt_name1, t.alt_name2, t.alt_name3].filter((n) => n),
      conference: t.conference,
      division: t.division,
      classification: t.classification,
      color: t.color,
      alternateColor: t.alt_color,
      logos: t.logos,
      twitter: t.twitter,
      location: {
        id: t.venue_id,
        name: t.venue_name,
        city: t.city,
        state: t.state,
        zip: t.zip,
        countryCode: t.country_code,
        timezone: t.timezone,
        latitude: t.location ? t.location.x : null,
        longitude: t.location ? t.location.y : null,
        elevation: t.elevation,
        capacity: t.capacity,
        constructionYear: t.year_constructed,
        grass: t.grass,
        dome: t.dome,
      },
    }),
  );
};

export const getFBSTeams = async (year?: number): Promise<Team[]> => {
  let filter = year
    ? 'WHERE ct.start_year <= $1 AND (ct.end_year >= $1 OR ct.end_year IS NULL)'
    : 'WHERE ct.end_year IS NULL';
  let params = year ? [year] : [];

  let teams = await db.any(
    `
        SELECT t.id, t.school, t.mascot, t.abbreviation, t.alt_name as alt_name1, t.abbreviation as alt_name2, t.nickname as alt_name3, t.twitter, c.name as conference, ct.division as division, ('#' || t.color) as color, ('#' || t.alt_color) as alt_color, t.images as logos, v.id AS venue_id, v.name AS venue_name, v.capacity, v.grass, v.city, v.state, v.zip, v.country_code, v.location, v.elevation, v.year_constructed, v.dome, v.timezone
        FROM team t
            INNER JOIN conference_team ct ON t.id = ct.team_id
            INNER JOIN  conference c ON c.id = ct.conference_id AND c.division = 'fbs'
            LEFT JOIN venue AS v ON t.venue_id = v.id
        ${filter}
        ORDER BY t.active DESC, t.school
    `,
    params,
  );

  return teams.map(
    (t): Team => ({
      id: t.id,
      school: t.school,
      mascot: t.mascot,
      abbreviation: t.abbreviation,
      alternateNames: [t.alt_name1, t.alt_name2, t.alt_name3].filter((n) => n),
      conference: t.conference,
      division: t.division,
      classification: t.classification,
      color: t.color,
      alternateColor: t.alt_color,
      logos: t.logos,
      twitter: t.twitter,
      location: {
        id: t.venue_id,
        name: t.venue_name,
        city: t.city,
        state: t.state,
        zip: t.zip,
        countryCode: t.country_code,
        timezone: t.timezone,
        latitude: t.location ? t.location.x : null,
        longitude: t.location ? t.location.y : null,
        elevation: t.elevation,
        capacity: t.capacity,
        constructionYear: t.year_constructed,
        grass: t.grass,
        dome: t.dome,
      },
    }),
  );
};

export const getMatchup = async (
  team1: string,
  team2: string,
  minYear?: number,
  maxYear?: number,
): Promise<Matchup> => {
  let filter = `WHERE g.start_date < now() AND ((LOWER(home_team.school) = LOWER($1) AND LOWER(away_team.school) = LOWER($2)) OR (LOWER(away_team.school) = LOWER($1) AND LOWER(home_team.school) = LOWER($2)))`;
  let params: any[] = [team1, team2];

  let index = 3;

  if (minYear) {
    filter += ` AND g.season >= $${index}`;
    params.push(minYear);
    index++;
  }

  if (maxYear) {
    filter += ` AND g.season <= $${index}`;
    params.push(maxYear);
    index++;
  }

  let results = await db.any(
    `
        SELECT g.season, g.week, g.season_type, g.start_date, g.neutral_site, v.name as venue, home_team.school as home, home.points as home_points, away_team.school as away, away.points as away_points
        FROM game g
            INNER JOIN game_team home ON g.id = home.game_id AND home.home_away = 'home'
            INNER JOIN team home_team ON home.team_id = home_team.id
            INNER JOIN game_team away ON g.id = away.game_id AND away.home_away = 'away'
            INNER JOIN team away_team ON away.team_id = away_team.id
            LEFT JOIN venue v ON g.venue_id = v.id
        ${filter}
        ORDER BY g.season
    `,
    params,
  );

  let games = results.map((r): MatchupGame => {
    let homePoints = r.home_points * 1.0;
    let awayPoints = r.away_points * 1.0;

    return {
      season: r.season as number,
      week: r.week as number,
      seasonType: r.season_type as string,
      date: r.start_date as string,
      neutralSite: r.neutral_site as boolean,
      venue: r.venue as string,
      homeTeam: r.home as string,
      homeScore: homePoints as number,
      awayTeam: r.away as string,
      awayScore: awayPoints as number,
      winner:
        homePoints == awayPoints
          ? null
          : homePoints > awayPoints
            ? (r.home as string)
            : (r.away as string),
    };
  });

  let teams = Array.from(
    new Set([...games.map((g) => g.homeTeam), ...games.map((g) => g.awayTeam)]),
  );
  let team1Team = teams.find((t) => t.toLowerCase() == team1.toLowerCase());
  let team2team = teams.find((t) => t.toLowerCase() == team2.toLowerCase());

  let data: Matchup = {
    team1: team1Team as string,
    team2: team2team as string,
    startYear: minYear,
    endYear: maxYear,
    team1Wins: games.filter((g) => g.winner == team1).length,
    team2Wins: games.filter((g) => g.winner == team2).length,
    ties: games.filter((g) => !g.winner).length,
    games: games,
  };

  return data;
};

export const getRoster = async (
  team?: string,
  year?: number,
): Promise<RosterPlayer[]> => {
  let filters = [];
  let params = [];
  let index = 1;

  if (team) {
    filters.push(`LOWER(t.school) = LOWER($${index})`);
    params.push(team);
    index++;
  }

  if (year) {
    if (!Number.isInteger(year)) {
      throw new ValidateError(
        { year: { value: year, message: 'integer type expected' } },
        'Validation error',
      );
    }

    params.push(year);
  } else {
    params.push(2023);
  }

  filters.push(`att.start_year <= $${index} AND att.end_year >= $${index}`);
  index++;

  const filter = `WHERE a.id > 0 AND ${filters.join(' AND ')}`;
  const roster = await db.any(
    `
        SELECT a.id, a.first_name, a.last_name, t.school AS team, a.weight, a.height, a.jersey, a.year, p.abbreviation as position, h.city as home_city, h.state as home_state, h.country as home_country, h.latitude as home_latitude, h.longitude as home_longitude, h.county_fips as home_county_fips, array_agg(DISTINCT r.id) AS recruit_ids
        FROM team t
            INNER JOIN athlete_team AS att ON t.id = att.team_id
            INNER JOIN athlete a ON att.athlete_id = a.id
            LEFT JOIN hometown h ON a.hometown_id = h.id
            LEFT JOIN position p ON a.position_id = p.id
            LEFT JOIN recruit AS r ON r.athlete_id = a.id
        ${filter}
        GROUP BY a.id, a.first_name, a.last_name, t.school, a.weight, a.height, a.jersey, a.year, p.abbreviation, h.city, h.state, h.country, h.latitude, h.longitude, h.county_fips
    `,
    params,
  );

  return roster.map(
    (r): RosterPlayer => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      team: r.school,
      weight: r.weight,
      height: r.height,
      jersey: r.jersey,
      year: r.year,
      position: r.position,
      homeCity: r.home_city,
      homeState: r.home_state,
      homeCountry: r.home_country,
      homeLatitude: r.home_latitude,
      homeLongitude: r.home_longitude,
      homeCountyFIPS: r.home_county_fips,
      recruitIds: r.recruit_ids?.length
        ? r.recruit_ids.filter((r: number | undefined) => r)
        : [],
    }),
  );
};

export const getConferences = async (): Promise<Conference[]> => {
  let conferences = await db.any(`
        SELECT id, name, short_name, abbreviation, division as classification
        FROM conference
        ORDER BY id
    `);

  return conferences.map(
    (c): Conference => ({
      id: c.id,
      name: c.name,
      shortName: c.short_name,
      abbreviation: c.abbreviation,
      classification: c.classification,
    }),
  );
};

export const getTalent = async (year: number): Promise<TeamTalent[]> => {
  if (!Number.isInteger(year)) {
    throw new ValidateError(
      { year: { value: year, message: 'integer type expected' } },
      'Validation error',
    );
  }

  return await await db.any(
    `
        SELECT tt.year, t.school, tt.talent
        FROM team_talent tt
            INNER JOIN team t ON tt.team_id = t.id
        WHERE tt.year = $1
        ORDER BY tt.year DESC, tt.talent DESC
    `,
    [year],
  );
};

export const getVenues = async (): Promise<Venue[]> => {
  const venues = await db.any(`
                SELECT id, name, capacity, grass, city, state, zip, country_code, location, elevation, year_constructed, dome, timezone
                FROM venue
                ORDER BY name
            `);

  return venues.map(
    (v): Venue => ({
      id: v.id,
      name: v.name,
      capacity: v.capacity,
      grass: v.grass,
      dome: v.dome,
      city: v.city,
      state: v.state,
      zip: v.zip,
      countryCode: v.country_code,
      timezone: v.timezone,
      latitude: v.location ? v.location.x : null,
      longitude: v.location ? v.location.y : null,
      elevation: v.elevation,
      constructionYear: v.constructionYear,
    }),
  );
};

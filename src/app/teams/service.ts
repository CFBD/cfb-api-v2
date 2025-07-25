import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import {
  Conference,
  Matchup,
  MatchupGame,
  RosterPlayer,
  Team,
  TeamTalent,
  Venue,
} from './types';

export const getTeams = async (
  conference?: string,
  year?: number,
): Promise<Team[]> => {
  let query = kdb
    .selectFrom('team')
    .leftJoin('venue', 'team.venueId', 'venue.id')
    .leftJoin('conferenceTeam', (join) => {
      if (year) {
        return join
          .onRef('team.id', '=', 'conferenceTeam.teamId')
          .on('conferenceTeam.startYear', '<=', year)
          .on((eb) =>
            eb.or([
              eb('conferenceTeam.endYear', 'is', null),
              eb('conferenceTeam.endYear', '>=', year),
            ]),
          );
      } else {
        return join
          .onRef('team.id', '=', 'conferenceTeam.teamId')
          .on('conferenceTeam.endYear', 'is', null);
      }
    })
    .leftJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .select([
      'team.id',
      'team.school',
      'team.mascot',
      'team.abbreviation',
      'team.altName as altName1',
      'team.abbreviation as altName2',
      'team.nickname as altName3',
      'team.twitter',
      'conference.division as classification',
      'conference.name as conference',
      'conferenceTeam.division',
      'team.color',
      'team.altColor',
      'team.images as logos',
      'venue.id as venueId',
      'venue.name as venueName',
      'venue.capacity',
      'venue.grass',
      'venue.city',
      'venue.state',
      'venue.zip',
      'venue.countryCode',
      'venue.location',
      'venue.elevation',
      'venue.yearConstructed',
      'venue.dome',
      'venue.timezone',
    ])
    .orderBy('team.active desc')
    .orderBy('team.school');

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  if (year) {
    query = query.where('conferenceTeam.id', 'is not', null);
  }

  const teams = await query.execute();
  return teams.map(
    (t): Team => ({
      id: t.id,
      school: t.school,
      mascot: t.mascot,
      abbreviation: t.abbreviation,
      // @ts-ignore
      alternateNames: [t.altName1, t.altName2, t.altName3].filter((n) => n),
      conference: t.conference,
      division: t.division,
      classification: t.classification,
      color: `#${t.color}`,
      alternateColor: `#${t.altColor}`,
      logos: t.logos,
      twitter: t.twitter,
      location: {
        id: t.venueId,
        name: t.venueName,
        city: t.city,
        state: t.state,
        zip: t.zip,
        countryCode: t.countryCode,
        timezone: t.timezone,
        latitude: t.location ? t.location.x : null,
        longitude: t.location ? t.location.y : null,
        elevation: t.elevation,
        capacity: t.capacity,
        constructionYear: t.yearConstructed,
        grass: t.grass,
        dome: t.dome,
      },
    }),
  );
};

export const getFBSTeams = async (year?: number): Promise<Team[]> => {
  let query = kdb
    .selectFrom('team')
    .innerJoin('conferenceTeam', 'team.id', 'conferenceTeam.teamId')
    .innerJoin('conference', (join) =>
      join
        .onRef('conferenceTeam.conferenceId', '=', 'conference.id')
        .on('conference.division', '=', 'fbs'),
    )
    .leftJoin('venue', 'team.venueId', 'venue.id')
    .select([
      'team.id',
      'team.school',
      'team.abbreviation',
      'team.mascot',
      'team.altName as altName1',
      'team.abbreviation as altName2',
      'team.nickname as altName3',
      'team.twitter',
      'conference.name as conference',
      'conference.division as classification',
      'conferenceTeam.division as division',
      'team.color',
      'team.altColor',
      'team.images as logos',
      'venue.id as venueId',
      'venue.name as venueName',
      'venue.capacity',
      'venue.grass',
      'venue.city',
      'venue.state',
      'venue.zip',
      'venue.countryCode',
      'venue.location',
      'venue.elevation',
      'venue.dome',
      'venue.timezone',
      'venue.yearConstructed',
    ])
    .orderBy('team.active desc')
    .orderBy('team.school');

  if (year) {
    query = query
      .where('conferenceTeam.startYear', '<=', year)
      .where((eb) =>
        eb.or([
          eb('conferenceTeam.endYear', 'is', null),
          eb('conferenceTeam.endYear', '>=', year),
        ]),
      );
  } else {
    query = query.where('conferenceTeam.endYear', 'is', null);
  }

  const teams = await query.execute();

  return teams.map(
    (t): Team => ({
      id: t.id,
      school: t.school,
      mascot: t.mascot,
      abbreviation: t.abbreviation,
      // @ts-ignore
      alternateNames: [t.altName1, t.altName2, t.altName3].filter((n) => n),
      conference: t.conference,
      division: t.division,
      classification: t.classification,
      color: `#${t.color}`,
      alternateColor: `#${t.altColor}`,
      logos: t.logos,
      twitter: t.twitter,
      location: {
        id: t.venueId,
        name: t.venueName,
        city: t.city,
        state: t.state,
        zip: t.zip,
        countryCode: t.countryCode,
        timezone: t.timezone,
        latitude: t.location ? t.location.x : null,
        longitude: t.location ? t.location.y : null,
        elevation: t.elevation,
        capacity: t.capacity,
        constructionYear: t.yearConstructed,
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
  let query = kdb
    .selectFrom('game')
    .innerJoin('gameTeam as home', (join) =>
      join
        .onRef('game.id', '=', 'home.gameId')
        .on('home.homeAway', '=', 'home'),
    )
    .innerJoin('team as homeTeam', 'home.teamId', 'homeTeam.id')
    .innerJoin('gameTeam as away', (join) =>
      join
        .onRef('game.id', '=', 'away.gameId')
        .on('away.homeAway', '=', 'away'),
    )
    .innerJoin('team as awayTeam', 'away.teamId', 'awayTeam.id')
    .leftJoin('venue', 'game.venueId', 'venue.id')
    // @ts-ignore
    .where((eb) => eb('game.startDate', '<', eb.fn('now')))
    .where((eb) =>
      eb.or([
        eb.and([
          eb(eb.fn('lower', ['homeTeam.school']), '=', team1.toLowerCase()),
          eb(eb.fn('lower', ['awayTeam.school']), '=', team2.toLowerCase()),
        ]),
        eb.and([
          eb(eb.fn('lower', ['homeTeam.school']), '=', team2.toLowerCase()),
          eb(eb.fn('lower', ['awayTeam.school']), '=', team1.toLowerCase()),
        ]),
      ]),
    )
    .orderBy('game.season')
    .select([
      'game.season',
      'game.seasonType',
      'game.week',
      'game.startDate',
      'game.neutralSite',
      'venue.name as venue',
      'homeTeam.school as home',
      'home.points as homePoints',
      'awayTeam.school as away',
      'away.points as awayPoints',
    ]);

  if (minYear) {
    query = query.where('game.season', '>=', minYear);
  }

  if (maxYear) {
    query = query.where('game.season', '<=', maxYear);
  }

  const results = await query.execute();

  const games = results.map((r): MatchupGame => {
    const homePoints = (r.homePoints ?? 0) * 1.0;
    const awayPoints = (r.awayPoints ?? 0) * 1.0;

    return {
      season: r.season as number,
      week: r.week as number,
      seasonType: r.seasonType as string,
      date: r.startDate.toISOString(),
      neutralSite: r.neutralSite as boolean,
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

  const teams = Array.from(
    new Set([...games.map((g) => g.homeTeam), ...games.map((g) => g.awayTeam)]),
  );
  const team1Team = teams.find((t) => t.toLowerCase() == team1.toLowerCase());
  const team2Team = teams.find((t) => t.toLowerCase() == team2.toLowerCase());

  const data: Matchup = {
    team1: team1Team as string,
    team2: team2Team as string,
    startYear: minYear,
    endYear: maxYear,
    team1Wins: games.filter((g) => g.winner == team1Team).length,
    team2Wins: games.filter((g) => g.winner == team2Team).length,
    ties: games.filter((g) => !g.winner).length,
    games: games,
  };

  return data;
};

export const getRoster = async (
  team?: string,
  year: number = 2023,
): Promise<RosterPlayer[]> => {
  let query = kdb
    .selectFrom('team')
    .innerJoin('athleteTeam', 'team.id', 'athleteTeam.teamId')
    .innerJoin('athlete', 'athleteTeam.athleteId', 'athlete.id')
    .leftJoin('hometown', 'athlete.hometownId', 'hometown.id')
    .leftJoin('position', 'athlete.positionId', 'position.id')
    .leftJoin('recruit', 'athlete.id', 'recruit.athleteId')
    .where('athleteTeam.startYear', '<=', year)
    .where('athleteTeam.endYear', '>=', year)
    .where((eb) => eb.fn('lower', ['athlete.name']), '<>', 'team')
    .where((eb) => eb.fn('lower', ['athlete.firstName']), '<>', 'team')
    .where((eb) => eb.fn('lower', ['athlete.lastName']), '<>', 'team')
    .where('athlete.name', '<>', ' ')
    .groupBy([
      'athlete.id',
      'athlete.firstName',
      'athlete.lastName',
      'team.school',
      'athlete.weight',
      'athlete.height',
      'athlete.jersey',
      'athlete.year',
      'position.abbreviation',
      'hometown.city',
      'hometown.state',
      'hometown.country',
      'hometown.latitude',
      'hometown.longitude',
      'hometown.countyFips',
    ])
    .select([
      'athlete.id',
      'athlete.firstName',
      'athlete.lastName',
      'team.school as team',
      'athlete.weight',
      'athlete.height',
      'athlete.jersey',
      'athlete.year',
      'position.abbreviation as position',
      'hometown.city as homeCity',
      'hometown.state as homeState',
      'hometown.country as homeCountry',
      'hometown.latitude as homeLatitude',
      'hometown.longitude as homeLongitude',
      'hometown.countyFips as homeCountyFips',
    ])
    .select((eb) =>
      eb.fn
        .agg<string[]>('array_agg', ['recruit.id'])
        .distinct()
        .as('recruitIds'),
    );

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  const roster = await query.execute();

  return roster.map(
    (r): RosterPlayer => ({
      id: r.id,
      firstName: r.firstName ?? '',
      lastName: r.lastName ?? '',
      team: r.team,
      weight: r.weight,
      height: r.height,
      jersey: r.jersey,
      year: r.year ?? year,
      position: r.position,
      homeCity: r.homeCity,
      homeState: r.homeState,
      homeCountry: r.homeCountry,
      homeLatitude: r.homeLatitude ? parseFloat(r.homeLatitude) : null,
      homeLongitude: r.homeLongitude ? parseFloat(r.homeLongitude) : null,
      homeCountyFIPS: r.homeCountyFips,
      recruitIds: r.recruitIds?.length
        ? r.recruitIds.filter((r: string | null) => r)
        : [],
    }),
  );
};

export const getConferences = async (): Promise<Conference[]> => {
  const query = kdb
    .selectFrom('conference')
    .select([
      'id',
      'name',
      'shortName',
      'abbreviation',
      'division as classification',
    ]);

  const conferences = await query.execute();

  return conferences.map(
    (c): Conference => ({
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      abbreviation: c.abbreviation,
      // @ts-ignore
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

  const talent = await kdb
    .selectFrom('teamTalent')
    .innerJoin('team', 'teamTalent.teamId', 'team.id')
    .where('teamTalent.year', '=', year)
    .orderBy('teamTalent.year desc')
    .orderBy('teamTalent.talent desc')
    .select(['teamTalent.year', 'team.school as team', 'teamTalent.talent'])
    .execute();

  return talent.map((t) => ({
    year: t.year,
    team: t.team,
    talent: parseFloat(t.talent),
  }));
};

export const getVenues = async (): Promise<Venue[]> => {
  const venues = await kdb.selectFrom('venue').selectAll().execute();

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
      countryCode: v.countryCode,
      timezone: v.timezone,
      latitude: v.location ? v.location.x : null,
      longitude: v.location ? v.location.y : null,
      elevation: v.elevation,
      constructionYear: v.yearConstructed,
    }),
  );
};

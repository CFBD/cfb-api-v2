import { sql } from 'kysely';
import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import {
  Coach,
  CoachProfile,
  CoachRecord,
  CoachSeasonTeamReference,
  CoachTenure,
} from './types';

interface CoachRow {
  id: number;
  firstName: string;
  lastName: string;
  teamId: number;
  school: string;
  conference: string | null;
  year: number;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  preseasonRank: number | null;
  postseasonRank: number | null;
  srs: string | null;
  sp: string | null;
  spOffense: string | null;
  spDefense: string | null;
  hireDate: Date | null;
}

export const calculateWinPercentage = (
  wins: number,
  ties: number,
  games: number,
): number | null => {
  if (games === 0) {
    return null;
  }

  return Math.round(((wins + 0.5 * ties) / games) * 1000) / 1000;
};

const roundRating = (value: string | null): number | null =>
  value === null ? null : Math.round(parseFloat(value) * 10) / 10;

const numeric = (value: number | string): number => Number(value);

const dateOnly = (value: Date | string | null): string | null => {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
};

const validationError = (
  field: string,
  value: unknown,
  message: string,
): ValidateError =>
  new ValidateError(
    {
      [field]: {
        value,
        message,
      },
    },
    'Validation error',
  );

const validatePositiveInteger = (
  field: string,
  value: number | undefined,
): void => {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    throw validationError(field, value, `${field} must be a positive integer`);
  }
};

export const validateCoachProfileSelector = (coachId: number): void =>
  validatePositiveInteger('coachId', coachId);

export const validateCoachTenureSelectors = (
  coachId?: number,
  teamId?: number,
  year?: number,
): void => {
  if (coachId === undefined && teamId === undefined) {
    throw validationError('coachId', coachId, 'coachId or teamId is required');
  }
  if (coachId !== undefined) {
    validatePositiveInteger('coachId', coachId);
  }
  if (teamId !== undefined) {
    validatePositiveInteger('teamId', teamId);
  }
  if (year !== undefined) {
    validatePositiveInteger('year', year);
  }
};

export interface CoachProfileIdentityRow {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  birthDate: Date | string | null;
  almaMaterTeamId: number | null;
  almaMaterSchool: string | null;
  graduationYear: number | null;
  wikidataId: string | null;
  hallOfFameYear: number | null;
}

export interface CoachCareerRow {
  seasons: number | string;
  teams: number | string;
  firstYear: number | null;
  lastYear: number | null;
  games: number | string;
  wins: number | string;
  losses: number | string;
  ties: number | string;
}

export interface CoachCurrentTeamRow {
  id: number;
  school: string;
  conference: string | null;
}

export const mapCoachProfile = (
  identity: CoachProfileIdentityRow,
  career: CoachCareerRow,
  currentTeams: CoachCurrentTeamRow[],
): CoachProfile => {
  if (career.firstYear === null || career.lastYear === null) {
    throw new Error(`Coach ${identity.id} has no coach-season rows`);
  }

  const games = numeric(career.games);
  const wins = numeric(career.wins);
  const ties = numeric(career.ties);
  const currentTeam: CoachSeasonTeamReference | null =
    currentTeams.length === 1
      ? {
          id: currentTeams[0].id,
          school: currentTeams[0].school,
          conference: currentTeams[0].conference,
        }
      : null;

  return {
    id: identity.id,
    firstName: identity.firstName,
    lastName: identity.lastName,
    displayName: identity.displayName,
    currentTeam,
    career: {
      seasons: numeric(career.seasons),
      teams: numeric(career.teams),
      firstYear: career.firstYear,
      lastYear: career.lastYear,
      games,
      wins,
      losses: numeric(career.losses),
      ties,
      winPercentage: calculateWinPercentage(wins, ties, games),
    },
    birthDate: dateOnly(identity.birthDate),
    almaMater:
      identity.almaMaterTeamId !== null && identity.almaMaterSchool !== null
        ? {
            id: identity.almaMaterTeamId,
            school: identity.almaMaterSchool,
          }
        : null,
    graduationYear: identity.graduationYear,
    wikidataId: identity.wikidataId,
    hallOfFameYear: identity.hallOfFameYear,
  };
};

export const getCoachProfile = async (
  coachId: number,
): Promise<CoachProfile | null> => {
  validateCoachProfileSelector(coachId);

  const identity = await kdb
    .selectFrom('coach')
    .leftJoin('team as almaMater', 'coach.almaMaterTeamId', 'almaMater.id')
    .where('coach.id', '=', coachId)
    .select([
      'coach.id',
      'coach.firstName',
      'coach.lastName',
      'coach.displayName',
      'coach.birthDate',
      'coach.almaMaterTeamId',
      'almaMater.school as almaMaterSchool',
      'coach.graduationYear',
      'coach.wikidataId',
      'coach.hallOfFameYear',
    ])
    .executeTakeFirst();

  if (!identity) {
    return null;
  }

  const currentYear = new Date().getUTCFullYear();
  const [career, currentTeams] = await Promise.all([
    kdb
      .selectFrom('coachSeason')
      .where('coachSeason.coachId', '=', coachId)
      .select([
        sql<number>`count(distinct coach_season.year)`.as('seasons'),
        sql<number>`count(distinct coach_season.team_id)`.as('teams'),
        sql<number | null>`min(coach_season.year)`.as('firstYear'),
        sql<number | null>`max(coach_season.year)`.as('lastYear'),
        sql<number>`coalesce(sum(coach_season.games), 0)`.as('games'),
        sql<number>`coalesce(sum(coach_season.wins), 0)`.as('wins'),
        sql<number>`coalesce(sum(coach_season.losses), 0)`.as('losses'),
        sql<number>`coalesce(sum(coach_season.ties), 0)`.as('ties'),
      ])
      .executeTakeFirstOrThrow(),
    kdb
      .selectFrom('coachTeam')
      .innerJoin('team', 'coachTeam.teamId', 'team.id')
      .where('coachTeam.coachId', '=', coachId)
      .where('coachTeam.startYear', '<=', currentYear)
      .where('coachTeam.endYear', 'is', null)
      .where('coachTeam.endDate', 'is', null)
      .select(['team.id', 'team.school'])
      .select(
        sql<string | null>`(
          select case
            when count(distinct c.id) = 1 then min(c.name)
            else null
          end
          from conference_team ct
          inner join conference c on c.id = ct.conference_id
          where ct.team_id = coach_team.team_id
            and ct.start_year <= ${currentYear}
            and (ct.end_year is null or ct.end_year >= ${currentYear})
        )`.as('conference'),
      )
      .orderBy('coachTeam.id')
      .execute(),
  ]);

  return mapCoachProfile(identity, career, currentTeams);
};

export interface CoachTenureRow {
  id: number;
  coachId: number;
  firstName: string;
  lastName: string;
  teamId: number;
  school: string;
  hireDate: Date | string | null;
  startYear: number;
  endYear: number | null;
  startDate: Date | null;
  endDate: Date | null;
  isInterim: boolean;
}

export interface CoachTenureSeasonRow {
  coachId: number;
  teamId: number;
  year: number;
  games: number;
  wins: number;
  losses: number;
  ties: number;
}

export interface CoachTenureIntervalRow {
  id: number;
  coachId: number;
  teamId: number;
  startYear: number;
  endYear: number | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface CoachTenureGameRow {
  id: number;
  season: number;
  startDate: Date;
  teamId: number;
  points: number | null;
  opponentPoints: number | null;
}

interface MutableRecord {
  games: number;
  wins: number;
  losses: number;
  ties: number;
}

interface TeamYearAttribution {
  requiresExact: boolean;
  complete: boolean;
  recordsByTenure: Map<number, MutableRecord>;
}

const emptyRecord = (): MutableRecord => ({
  games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
});

const addRecord = (target: MutableRecord, source: MutableRecord): void => {
  target.games += source.games;
  target.wins += source.wins;
  target.losses += source.losses;
  target.ties += source.ties;
};

const sameRecord = (first: MutableRecord, second: MutableRecord): boolean =>
  first.games === second.games &&
  first.wins === second.wins &&
  first.losses === second.losses &&
  first.ties === second.ties;

const coversYear = (
  row: Pick<CoachTenureIntervalRow, 'startYear' | 'endYear'>,
  year: number,
): boolean =>
  row.startYear <= year && (row.endYear === null || row.endYear >= year);

const intervalBounds = (
  row: CoachTenureIntervalRow,
  year: number,
): { start: number; end: number } => ({
  start:
    row.startYear === year && row.startDate !== null
      ? row.startDate.getTime()
      : Number.NEGATIVE_INFINITY,
  end:
    row.endYear === year && row.endDate !== null
      ? row.endDate.getTime()
      : Number.POSITIVE_INFINITY,
});

const calculateTeamYearAttribution = (
  teamId: number,
  year: number,
  seasons: CoachTenureSeasonRow[],
  intervals: CoachTenureIntervalRow[],
  games: CoachTenureGameRow[],
): TeamYearAttribution => {
  const teamSeasons = seasons.filter(
    (season) => season.teamId === teamId && season.year === year,
  );
  const teamIntervals = intervals.filter(
    (interval) => interval.teamId === teamId && coversYear(interval, year),
  );
  const requiresExact = teamSeasons.length !== 1 || teamIntervals.length !== 1;
  if (!requiresExact) {
    return {
      requiresExact: false,
      complete: true,
      recordsByTenure: new Map(),
    };
  }

  const ranges = teamIntervals
    .map((interval) => ({
      interval,
      ...intervalBounds(interval, year),
    }))
    .sort(
      (first, second) =>
        first.start - second.start || first.interval.id - second.interval.id,
    );
  const expectedCoachIds = new Set(teamSeasons.map((season) => season.coachId));
  const intervalCoachIds = new Set(
    teamIntervals.map((interval) => interval.coachId),
  );
  const invalidCoaches =
    expectedCoachIds.size !== intervalCoachIds.size ||
    [...expectedCoachIds].some((coachId) => !intervalCoachIds.has(coachId));
  const invalidRanges =
    ranges.length === 0 ||
    ranges.some(
      (range, index) =>
        range.end <= range.start ||
        (ranges[index + 1] !== undefined &&
          range.end > ranges[index + 1].start),
    );
  if (invalidCoaches || invalidRanges) {
    return {
      requiresExact: true,
      complete: false,
      recordsByTenure: new Map(),
    };
  }

  const recordsByTenure = new Map<number, MutableRecord>(
    ranges.map(({ interval }) => [interval.id, emptyRecord()]),
  );
  const teamGames = games.filter(
    (game) => game.teamId === teamId && game.season === year,
  );
  for (const game of teamGames) {
    if (
      !Number.isInteger(game.points) ||
      !Number.isInteger(game.opponentPoints)
    ) {
      return {
        requiresExact: true,
        complete: false,
        recordsByTenure: new Map(),
      };
    }
    const time = game.startDate.getTime();
    const matches = ranges.filter(
      (range) => range.start <= time && time < range.end,
    );
    if (matches.length !== 1) {
      return {
        requiresExact: true,
        complete: false,
        recordsByTenure: new Map(),
      };
    }
    const record = recordsByTenure.get(matches[0].interval.id);
    if (!record) {
      throw new Error('Missing initialized tenure record');
    }
    record.games++;
    if (game.points! > game.opponentPoints!) {
      record.wins++;
    } else if (game.points! < game.opponentPoints!) {
      record.losses++;
    } else {
      record.ties++;
    }
  }

  const recordsByCoach = new Map<number, MutableRecord>();
  for (const range of ranges) {
    const coachRecord =
      recordsByCoach.get(range.interval.coachId) ?? emptyRecord();
    addRecord(coachRecord, recordsByTenure.get(range.interval.id)!);
    recordsByCoach.set(range.interval.coachId, coachRecord);
  }
  const reconciles = teamSeasons.every((season) =>
    sameRecord(recordsByCoach.get(season.coachId) ?? emptyRecord(), season),
  );

  return {
    requiresExact: true,
    complete: reconciles,
    recordsByTenure: reconciles ? recordsByTenure : new Map(),
  };
};

const publicRecord = (record: MutableRecord): CoachRecord => ({
  ...record,
  winPercentage: calculateWinPercentage(record.wins, record.ties, record.games),
});

export const mapCoachTenures = (
  tenures: CoachTenureRow[],
  seasons: CoachTenureSeasonRow[],
  intervals: CoachTenureIntervalRow[],
  games: CoachTenureGameRow[],
): CoachTenure[] => {
  const attributionByTeamYear = new Map<string, TeamYearAttribution>();
  for (const season of seasons) {
    const key = `${season.teamId}:${season.year}`;
    if (!attributionByTeamYear.has(key)) {
      attributionByTeamYear.set(
        key,
        calculateTeamYearAttribution(
          season.teamId,
          season.year,
          seasons,
          intervals,
          games,
        ),
      );
    }
  }

  return [...tenures]
    .sort(
      (first, second) =>
        first.startYear - second.startYear ||
        (first.startDate?.getTime() ?? Number.NEGATIVE_INFINITY) -
          (second.startDate?.getTime() ?? Number.NEGATIVE_INFINITY) ||
        first.teamId - second.teamId ||
        first.coachId - second.coachId ||
        first.id - second.id,
    )
    .map((tenure) => {
      const tenureSeasons = seasons.filter(
        (season) =>
          season.coachId === tenure.coachId &&
          season.teamId === tenure.teamId &&
          coversYear(tenure, season.year),
      );
      const years = new Set(tenureSeasons.map((season) => season.year));
      const record = emptyRecord();
      let attributionComplete = true;

      for (const season of tenureSeasons) {
        const attribution = attributionByTeamYear.get(
          `${season.teamId}:${season.year}`,
        );
        if (!attribution?.requiresExact) {
          addRecord(record, season);
          continue;
        }
        if (attribution.complete) {
          addRecord(
            record,
            attribution.recordsByTenure.get(tenure.id) ?? emptyRecord(),
          );
          continue;
        }

        attributionComplete = false;
        const coachIntervals = intervals.filter(
          (interval) =>
            interval.coachId === tenure.coachId &&
            interval.teamId === tenure.teamId &&
            coversYear(interval, season.year),
        );
        if (coachIntervals.length === 1) {
          addRecord(record, season);
        }
      }

      return {
        id: tenure.id,
        coach: {
          id: tenure.coachId,
          firstName: tenure.firstName,
          lastName: tenure.lastName,
        },
        team: {
          id: tenure.teamId,
          school: tenure.school,
        },
        hireDate: dateOnly(tenure.hireDate),
        startYear: tenure.startYear,
        endYear: tenure.endYear,
        effectiveStart: tenure.startDate,
        effectiveEnd: tenure.endDate,
        isInterim: tenure.isInterim,
        active: tenure.endYear === null && tenure.endDate === null,
        seasons: years.size,
        record: publicRecord(record),
        attributionComplete,
      };
    });
};

export const getCoachTenures = async (
  coachId?: number,
  teamId?: number,
  year?: number,
  active?: boolean,
): Promise<CoachTenure[]> => {
  validateCoachTenureSelectors(coachId, teamId, year);

  let tenureQuery = kdb
    .selectFrom('coachTeam')
    .innerJoin('coach', 'coachTeam.coachId', 'coach.id')
    .innerJoin('team', 'coachTeam.teamId', 'team.id')
    .select([
      'coachTeam.id',
      'coach.id as coachId',
      'coach.firstName',
      'coach.lastName',
      'team.id as teamId',
      'team.school',
      'coachTeam.hireDate',
      'coachTeam.startYear',
      'coachTeam.endYear',
      'coachTeam.startDate',
      'coachTeam.endDate',
      'coachTeam.isInterim',
    ])
    .orderBy('coachTeam.startYear')
    .orderBy(sql`coach_team.start_date asc nulls first`)
    .orderBy('team.id')
    .orderBy('coach.id')
    .orderBy('coachTeam.id');

  if (coachId !== undefined) {
    tenureQuery = tenureQuery.where('coachTeam.coachId', '=', coachId);
  }
  if (teamId !== undefined) {
    tenureQuery = tenureQuery.where('coachTeam.teamId', '=', teamId);
  }
  if (year !== undefined) {
    tenureQuery = tenureQuery
      .where('coachTeam.startYear', '<=', year)
      .where((eb) =>
        eb.or([
          eb('coachTeam.endYear', 'is', null),
          eb('coachTeam.endYear', '>=', year),
        ]),
      );
  }
  if (active === true) {
    tenureQuery = tenureQuery
      .where('coachTeam.endYear', 'is', null)
      .where('coachTeam.endDate', 'is', null);
  } else if (active === false) {
    tenureQuery = tenureQuery.where((eb) =>
      eb.or([
        eb('coachTeam.endYear', 'is not', null),
        eb('coachTeam.endDate', 'is not', null),
      ]),
    );
  }

  const tenures = await tenureQuery.execute();
  if (tenures.length === 0) {
    return [];
  }

  const currentYear = new Date().getUTCFullYear();
  const teamIds = [...new Set(tenures.map((tenure) => tenure.teamId))];
  const minYear = Math.min(...tenures.map((tenure) => tenure.startYear));
  const maxYear = Math.max(
    ...tenures.map((tenure) => tenure.endYear ?? currentYear),
  );

  const [seasons, intervals, games] = await Promise.all([
    kdb
      .selectFrom('coachSeason')
      .where('coachSeason.teamId', 'in', teamIds)
      .where('coachSeason.year', '>=', minYear)
      .where('coachSeason.year', '<=', maxYear)
      .select([
        'coachSeason.coachId',
        'coachSeason.teamId',
        'coachSeason.year',
        'coachSeason.games',
        'coachSeason.wins',
        'coachSeason.losses',
        'coachSeason.ties',
      ])
      .orderBy('coachSeason.teamId')
      .orderBy('coachSeason.year')
      .orderBy('coachSeason.coachId')
      .execute(),
    kdb
      .selectFrom('coachTeam')
      .where('coachTeam.teamId', 'in', teamIds)
      .where('coachTeam.startYear', '<=', maxYear)
      .where((eb) =>
        eb.or([
          eb('coachTeam.endYear', 'is', null),
          eb('coachTeam.endYear', '>=', minYear),
        ]),
      )
      .select([
        'coachTeam.id',
        'coachTeam.coachId',
        'coachTeam.teamId',
        'coachTeam.startYear',
        'coachTeam.endYear',
        'coachTeam.startDate',
        'coachTeam.endDate',
      ])
      .orderBy('coachTeam.teamId')
      .orderBy('coachTeam.startYear')
      .orderBy('coachTeam.id')
      .execute(),
    kdb
      .selectFrom('game')
      .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
      .innerJoin('gameTeam as opponent', (join) =>
        join
          .onRef('game.id', '=', 'opponent.gameId')
          .onRef('gameTeam.teamId', '<>', 'opponent.teamId'),
      )
      .where('game.status', '=', 'completed')
      .where('game.season', '>=', minYear)
      .where('game.season', '<=', maxYear)
      .where('gameTeam.teamId', 'in', teamIds)
      .select([
        'game.id',
        'game.season',
        'game.startDate',
        'gameTeam.teamId',
        'gameTeam.points',
        'opponent.points as opponentPoints',
      ])
      .orderBy('game.season')
      .orderBy('game.startDate')
      .orderBy('game.id')
      .orderBy('gameTeam.teamId')
      .execute(),
  ]);

  return mapCoachTenures(tenures, seasons, intervals, games);
};

export const mapCoachRows = (results: CoachRow[]): Coach[] => {
  const coaches = new Map<number, Coach>();

  for (const row of results) {
    let coach = coaches.get(row.id);
    if (!coach) {
      coach = {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        hireDate: row.hireDate,
        seasons: [],
      };
      coaches.set(row.id, coach);
    }

    coach.seasons.push({
      teamId: row.teamId,
      school: row.school,
      conference: row.conference,
      year: row.year,
      games: row.games,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      winPercentage: calculateWinPercentage(row.wins, row.ties, row.games),
      preseasonRank: row.preseasonRank,
      postseasonRank: row.postseasonRank,
      srs: roundRating(row.srs),
      spOverall: roundRating(row.sp),
      spOffense: roundRating(row.spOffense),
      spDefense: roundRating(row.spDefense),
    });
  }

  return Array.from(coaches.values());
};

export const getCoaches = async (
  firstName?: string,
  lastName?: string,
  team?: string,
  year?: number,
  minYear?: number,
  maxYear?: number,
): Promise<Coach[]> => {
  let query = kdb
    .selectFrom('coach')
    .innerJoin('coachSeason', 'coach.id', 'coachSeason.coachId')
    .innerJoin('team', 'coachSeason.teamId', 'team.id')
    .leftJoin('srs', (join) =>
      join
        .onRef('coachSeason.year', '=', 'srs.year')
        .onRef('team.id', '=', 'srs.teamId'),
    )
    .leftJoin('ratings', (join) =>
      join
        .onRef('coachSeason.year', '=', 'ratings.year')
        .onRef('team.id', '=', 'ratings.teamId'),
    )
    .select([
      'coach.id',
      'coach.firstName',
      'coach.lastName',
      'team.id as teamId',
      'team.school',
      'coachSeason.year',
      'coachSeason.games',
      'coachSeason.wins',
      'coachSeason.losses',
      'coachSeason.ties',
      'coachSeason.preseasonRank',
      'coachSeason.postseasonRank',
      'srs.rating as srs',
      'ratings.rating as sp',
      'ratings.oRating as spOffense',
      'ratings.dRating as spDefense',
    ])
    .select(
      sql<string | null>`(
        select case
          when count(distinct c.id) = 1 then min(c.name)
          else null
        end
        from conference_team ct
        inner join conference c on c.id = ct.conference_id
        where ct.team_id = coach_season.team_id
          and ct.start_year <= coach_season.year
          and (
            ct.end_year is null
            or ct.end_year >= coach_season.year
          )
      )`.as('conference'),
    )
    .select((eb) =>
      eb
        .selectFrom('coachTeam')
        .whereRef('coachTeam.coachId', '=', 'coach.id')
        .whereRef('coachTeam.teamId', '=', 'team.id')
        .where((eb) =>
          eb(
            'coachSeason.year',
            '>=',
            sql<number>`extract(year from coach_team.hire_date)`,
          ),
        )
        .orderBy('coachTeam.hireDate', 'desc')
        .limit(1)
        .select('coachTeam.hireDate')
        .as('hireDate'),
    )
    .orderBy('coach.lastName')
    .orderBy('coach.firstName')
    .orderBy('coach.id')
    .orderBy('coachSeason.year')
    .orderBy('team.id');

  if (firstName) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['coach.firstName']), '=', firstName.toLowerCase()),
    );
  }

  if (lastName) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['coach.lastName']), '=', lastName.toLowerCase()),
    );
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (year) {
    query = query.where('coachSeason.year', '=', year);
  }

  if (minYear) {
    query = query.where('coachSeason.year', '>=', minYear);
  }

  if (maxYear) {
    query = query.where('coachSeason.year', '<=', maxYear);
  }

  const results = await query.execute();

  return mapCoachRows(results);
};

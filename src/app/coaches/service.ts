import { sql } from 'kysely';
import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import {
  Coach,
  CoachCfpContext,
  CoachDraftContext,
  CoachPollResume,
  CoachProfile,
  CoachRecord,
  CoachRecordSplits,
  CoachScoring,
  CoachSeasonTeamReference,
  CoachTenure,
  DetailedCoachSeason,
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
  team?: string,
  year?: number,
): void => {
  if (coachId === undefined && team === undefined) {
    throw validationError('coachId', coachId, 'coachId or team is required');
  }
  if (coachId !== undefined) {
    validatePositiveInteger('coachId', coachId);
  }
  if (team !== undefined && team.trim().length === 0) {
    throw validationError('team', team, 'team must not be empty');
  }
  if (year !== undefined) {
    validatePositiveInteger('year', year);
  }
};

export const validateCoachSeasonSelectors = (
  coachId?: number,
  team?: string,
  year?: number,
  minYear?: number,
  maxYear?: number,
): void => {
  if (coachId === undefined && team === undefined && year === undefined) {
    throw validationError(
      'coachId',
      coachId,
      'coachId, team, or year is required',
    );
  }
  for (const [field, value] of [
    ['coachId', coachId],
    ['year', year],
    ['minYear', minYear],
    ['maxYear', maxYear],
  ] as const) {
    if (value !== undefined) {
      validatePositiveInteger(field, value);
    }
  }
  if (team !== undefined && team.trim().length === 0) {
    throw validationError('team', team, 'team must not be empty');
  }
  if (year !== undefined && (minYear !== undefined || maxYear !== undefined)) {
    throw validationError(
      'year',
      year,
      'year cannot be combined with minYear or maxYear',
    );
  }
  if (minYear !== undefined && maxYear !== undefined && minYear > maxYear) {
    throw validationError(
      'minYear',
      minYear,
      'minYear cannot be greater than maxYear',
    );
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
  team?: string,
  year?: number,
  active?: boolean,
): Promise<CoachTenure[]> => {
  validateCoachTenureSelectors(coachId, team, year);

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
  if (team !== undefined) {
    tenureQuery = tenureQuery.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
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

export interface DetailedCoachSeasonRow {
  coachId: number;
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
  spOverall: string | null;
  spOffense: string | null;
  spDefense: string | null;
  spSpecialTeams: string | null;
  strengthOfSchedule: string | null;
  secondOrderWins: string | null;
  fpi: string | null;
  recruitingRank: number | null;
  recruitingPoints: string | null;
}

export interface CoachTeamYearMetricRow {
  teamId: number;
  year: number;
  srs: string | null;
  spOverall: string | null;
}

export interface CoachTeamYearWinsRow {
  teamId: number;
  year: number;
  wins: number | string;
}

export interface CoachTalentRow {
  teamId: number;
  year: number;
  talent: string;
}

export interface CoachPollTypeRow {
  id: number;
  name: string;
  shortName: string;
}

export interface CoachPollRow {
  pollId: number;
  year: number;
  seasonType: string;
  week: number;
  teamId: number | null;
  rank: number | null;
}

export interface CoachDraftCoverageRow {
  minYear: number | null;
  maxYear: number | null;
}

export interface CoachDraftPickRow {
  teamId: number;
  year: number;
  round: number;
}

export interface CoachCfpParticipantRow {
  teamId: number;
  year: number;
  seed: number;
}

export interface CoachCfpGameRow {
  teamId: number;
  year: number;
  roundCode: string;
  winner: boolean | null;
  status: string | null;
}

export interface DetailedCoachGameRow extends CoachTenureGameRow {
  conferenceGame: boolean | null;
  seasonType: string;
  neutralSite: boolean;
  homeAway: 'home' | 'away';
}

export interface DetailedCoachSeasonContext {
  teamMetrics: CoachTeamYearMetricRow[];
  teamWins: CoachTeamYearWinsRow[];
  talents: CoachTalentRow[];
  polls: CoachPollRow[];
  draftCoverage: CoachDraftCoverageRow | undefined;
  draftPicks: CoachDraftPickRow[];
  cfpParticipants: CoachCfpParticipantRow[];
  cfpGames: CoachCfpGameRow[];
  attributionSeasons: CoachTenureSeasonRow[];
  intervals: CoachTenureIntervalRow[];
  games: DetailedCoachGameRow[];
}

const seasonKey = (coachId: number, teamId: number, year: number): string =>
  `${coachId}:${teamId}:${year}`;

const teamYearKey = (teamId: number, year: number): string =>
  `${teamId}:${year}`;

const oneValue = <T>(values: T[]): T | null => {
  const distinct = new Set(values.filter((value) => value !== null));
  return distinct.size === 1 ? [...distinct][0] : null;
};

const oneNumericString = (values: (string | null)[]): string | null => {
  const distinct = new Set(
    values.filter((value) => value !== null).map((value) => Number(value)),
  );
  return distinct.size === 1 ? String([...distinct][0]) : null;
};

const collapseDetailedRows = (
  rows: DetailedCoachSeasonRow[],
): DetailedCoachSeasonRow[] => {
  const groups = new Map<string, DetailedCoachSeasonRow[]>();
  for (const row of rows) {
    const key = seasonKey(row.coachId, row.teamId, row.year);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    return {
      ...first,
      conference: oneValue(group.map((row) => row.conference)),
      srs: oneNumericString(group.map((row) => row.srs)),
      spOverall: oneNumericString(group.map((row) => row.spOverall)),
      spOffense: oneNumericString(group.map((row) => row.spOffense)),
      spDefense: oneNumericString(group.map((row) => row.spDefense)),
      spSpecialTeams: oneNumericString(group.map((row) => row.spSpecialTeams)),
      strengthOfSchedule: oneNumericString(
        group.map((row) => row.strengthOfSchedule),
      ),
      secondOrderWins: oneNumericString(
        group.map((row) => row.secondOrderWins),
      ),
      fpi: oneNumericString(group.map((row) => row.fpi)),
      recruitingRank: oneValue(group.map((row) => row.recruitingRank)),
      recruitingPoints: oneNumericString(
        group.map((row) => row.recruitingPoints),
      ),
    };
  });
};

const decimal = (value: string | null): number | null =>
  value === null ? null : Number(value);

const buildMetricMap = (
  rows: CoachTeamYearMetricRow[],
): Map<string, { srs: number | null; spOverall: number | null }> => {
  const groups = new Map<string, CoachTeamYearMetricRow[]>();
  for (const row of rows) {
    const key = teamYearKey(row.teamId, row.year);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return new Map(
    [...groups].map(([key, group]) => [
      key,
      {
        srs: roundRating(oneNumericString(group.map((row) => row.srs))),
        spOverall: roundRating(
          oneNumericString(group.map((row) => row.spOverall)),
        ),
      },
    ]),
  );
};

const buildTalentMap = (rows: CoachTalentRow[]): Map<string, number | null> => {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = teamYearKey(row.teamId, row.year);
    groups.set(key, [...(groups.get(key) ?? []), row.talent]);
  }
  return new Map(
    [...groups].map(([key, values]) => [
      key,
      decimal(oneNumericString(values)),
    ]),
  );
};

export const selectApPollType = (rows: CoachPollTypeRow[]): number => {
  const ids = new Set(
    rows
      .filter(
        (row) =>
          row.name.trim().toLowerCase() === 'ap top 25' ||
          row.shortName.trim().toLowerCase() === 'ap poll',
      )
      .map((row) => row.id),
  );
  if (ids.size !== 1) {
    throw new Error(`Expected one AP poll type; found ${ids.size}`);
  }
  return [...ids][0];
};

const mapPollResume = (
  teamId: number,
  year: number,
  preseasonRank: number | null,
  postseasonRank: number | null,
  rows: CoachPollRow[],
): CoachPollResume | null => {
  const seasonRows = rows.filter((row) => row.year === year);
  const pollIdsBySnapshot = new Map<string, Set<number>>();
  for (const row of seasonRows) {
    const snapshot = `${row.seasonType}:${row.week}`;
    const ids = pollIdsBySnapshot.get(snapshot) ?? new Set<number>();
    ids.add(row.pollId);
    pollIdsBySnapshot.set(snapshot, ids);
  }
  if ([...pollIdsBySnapshot.values()].some((ids) => ids.size !== 1)) {
    throw new Error(`Ambiguous AP poll snapshots for season ${year}`);
  }
  if (pollIdsBySnapshot.size === 0) {
    return null;
  }

  const ranks: number[] = [];
  for (const pollId of new Set(seasonRows.map((row) => row.pollId))) {
    const values = seasonRows
      .filter((row) => row.pollId === pollId && row.teamId === teamId)
      .map((row) => row.rank);
    const rank = oneValue(values);
    if (values.filter((value) => value !== null).length > 0 && rank === null) {
      throw new Error(
        `Conflicting AP ranks for poll ${pollId}, team ${teamId}`,
      );
    }
    if (rank !== null) {
      ranks.push(rank);
    }
  }

  return {
    preseasonRank,
    postseasonRank,
    bestRank: ranks.length > 0 ? Math.min(...ranks) : null,
    weeksRanked: ranks.length,
    weeksTopTen: ranks.filter((rank) => rank <= 10).length,
  };
};

interface DetailedAttribution {
  complete: boolean;
  splits: CoachRecordSplits | null;
  scoring: CoachScoring | null;
}

interface MutableDetailedAttribution {
  overall: MutableRecord;
  conference: MutableRecord;
  postseason: MutableRecord;
  home: MutableRecord;
  away: MutableRecord;
  neutral: MutableRecord;
  pointsFor: number;
  pointsAgainst: number;
}

const emptyDetailedAttribution = (): MutableDetailedAttribution => ({
  overall: emptyRecord(),
  conference: emptyRecord(),
  postseason: emptyRecord(),
  home: emptyRecord(),
  away: emptyRecord(),
  neutral: emptyRecord(),
  pointsFor: 0,
  pointsAgainst: 0,
});

const addGame = (
  target: MutableDetailedAttribution,
  game: DetailedCoachGameRow,
): boolean => {
  if (
    !Number.isInteger(game.points) ||
    !Number.isInteger(game.opponentPoints)
  ) {
    return false;
  }
  const outcome = emptyRecord();
  outcome.games = 1;
  if (game.points! > game.opponentPoints!) {
    outcome.wins = 1;
  } else if (game.points! < game.opponentPoints!) {
    outcome.losses = 1;
  } else {
    outcome.ties = 1;
  }
  addRecord(target.overall, outcome);
  if (game.conferenceGame === true) {
    addRecord(target.conference, outcome);
  }
  if (game.seasonType === 'postseason') {
    addRecord(target.postseason, outcome);
  }
  if (game.neutralSite) {
    addRecord(target.neutral, outcome);
  } else if (game.homeAway === 'home') {
    addRecord(target.home, outcome);
  } else {
    addRecord(target.away, outcome);
  }
  target.pointsFor += game.points!;
  target.pointsAgainst += game.opponentPoints!;
  return true;
};

const finishDetailedAttribution = (
  value: MutableDetailedAttribution,
): DetailedAttribution => ({
  complete: true,
  splits: {
    conference: publicRecord(value.conference),
    postseason: publicRecord(value.postseason),
    home: publicRecord(value.home),
    away: publicRecord(value.away),
    neutral: publicRecord(value.neutral),
  },
  scoring: {
    pointsFor: value.pointsFor,
    pointsAgainst: value.pointsAgainst,
    averagePointDifferential:
      value.overall.games === 0
        ? null
        : Math.round(
            ((value.pointsFor - value.pointsAgainst) / value.overall.games) *
              1000,
          ) / 1000,
  },
});

const incompleteAttribution = (): DetailedAttribution => ({
  complete: false,
  splits: null,
  scoring: null,
});

const calculateDetailedAttribution = (
  teamId: number,
  year: number,
  seasons: CoachTenureSeasonRow[],
  intervals: CoachTenureIntervalRow[],
  games: DetailedCoachGameRow[],
): Map<number, DetailedAttribution> => {
  const teamSeasons = seasons.filter(
    (season) => season.teamId === teamId && season.year === year,
  );
  const result = new Map<number, DetailedAttribution>();
  const teamGames = games.filter(
    (game) => game.teamId === teamId && game.season === year,
  );
  if (teamSeasons.length === 1) {
    const attribution = emptyDetailedAttribution();
    if (
      teamGames.every((game) => addGame(attribution, game)) &&
      sameRecord(attribution.overall, teamSeasons[0])
    ) {
      result.set(
        teamSeasons[0].coachId,
        finishDetailedAttribution(attribution),
      );
    } else {
      result.set(teamSeasons[0].coachId, incompleteAttribution());
    }
    return result;
  }

  const teamIntervals = intervals.filter(
    (interval) => interval.teamId === teamId && coversYear(interval, year),
  );
  const ranges = teamIntervals
    .map((interval) => ({ interval, ...intervalBounds(interval, year) }))
    .sort(
      (first, second) =>
        first.start - second.start || first.interval.id - second.interval.id,
    );
  const seasonCoachIds = new Set(teamSeasons.map((season) => season.coachId));
  const intervalCoachIds = new Set(
    teamIntervals.map((interval) => interval.coachId),
  );
  const invalid =
    teamSeasons.length === 0 ||
    seasonCoachIds.size !== intervalCoachIds.size ||
    [...seasonCoachIds].some((coachId) => !intervalCoachIds.has(coachId)) ||
    ranges.some(
      (range, index) =>
        range.end <= range.start ||
        (ranges[index + 1] !== undefined &&
          range.end > ranges[index + 1].start),
    );
  if (invalid) {
    for (const coachId of seasonCoachIds) {
      result.set(coachId, incompleteAttribution());
    }
    return result;
  }

  const values = new Map<number, MutableDetailedAttribution>();
  for (const coachId of seasonCoachIds) {
    values.set(coachId, emptyDetailedAttribution());
  }
  for (const game of teamGames) {
    const time = game.startDate.getTime();
    const matches = ranges.filter(
      (range) => range.start <= time && time < range.end,
    );
    const value =
      matches.length === 1
        ? values.get(matches[0].interval.coachId)
        : undefined;
    if (!value || !addGame(value, game)) {
      for (const coachId of seasonCoachIds) {
        result.set(coachId, incompleteAttribution());
      }
      return result;
    }
  }
  const reconciles = teamSeasons.every((season) =>
    sameRecord(values.get(season.coachId)!.overall, season),
  );
  for (const coachId of seasonCoachIds) {
    result.set(
      coachId,
      reconciles
        ? finishDetailedAttribution(values.get(coachId)!)
        : incompleteAttribution(),
    );
  }
  return result;
};

const mapCfpContext = (
  teamId: number,
  year: number,
  participants: CoachCfpParticipantRow[],
  games: CoachCfpGameRow[],
): CoachCfpContext => {
  const participant = participants.find(
    (row) => row.teamId === teamId && row.year === year,
  );
  if (!participant) {
    return { appeared: false, seed: null, outcome: null };
  }
  const teamGames = games.filter(
    (row) =>
      row.teamId === teamId && row.year === year && row.status === 'completed',
  );
  const outcome = teamGames.some(
    (game) => game.roundCode === 'championship' && game.winner === true,
  )
    ? 'champion'
    : teamGames.some((game) => game.winner === false)
      ? 'eliminated'
      : 'active';
  return { appeared: true, seed: participant.seed, outcome };
};

export const mapDetailedCoachSeasons = (
  baseRows: DetailedCoachSeasonRow[],
  context: DetailedCoachSeasonContext,
): DetailedCoachSeason[] => {
  const rows = collapseDetailedRows(baseRows);
  const metrics = buildMetricMap(context.teamMetrics);
  const talents = buildTalentMap(context.talents);
  const wins = new Map(
    context.teamWins.map((row) => [
      teamYearKey(row.teamId, row.year),
      numeric(row.wins),
    ]),
  );
  const draftCoverage = context.draftCoverage;
  const attribution = new Map<string, DetailedAttribution>();
  for (const row of rows) {
    const key = teamYearKey(row.teamId, row.year);
    if (!attribution.has(key)) {
      const teamAttribution = calculateDetailedAttribution(
        row.teamId,
        row.year,
        context.attributionSeasons,
        context.intervals,
        context.games,
      );
      for (const [coachId, value] of teamAttribution) {
        attribution.set(seasonKey(coachId, row.teamId, row.year), value);
      }
    }
  }

  return rows
    .sort(
      (first, second) =>
        first.year - second.year ||
        first.teamId - second.teamId ||
        first.coachId - second.coachId,
    )
    .map((row) => {
      const priorMetrics = metrics.get(teamYearKey(row.teamId, row.year - 1));
      const priorWins = wins.get(teamYearKey(row.teamId, row.year - 1));
      const rowAttribution =
        attribution.get(seasonKey(row.coachId, row.teamId, row.year)) ??
        incompleteAttribution();
      const draftYear = row.year + 1;
      let draftFollowingSeason: CoachDraftContext | null = null;
      if (
        draftCoverage?.minYear !== null &&
        draftCoverage?.maxYear !== null &&
        draftCoverage?.minYear !== undefined &&
        draftCoverage?.maxYear !== undefined &&
        draftYear >= draftCoverage.minYear &&
        draftYear <= draftCoverage.maxYear
      ) {
        const picks = context.draftPicks.filter(
          (pick) => pick.teamId === row.teamId && pick.year === draftYear,
        );
        draftFollowingSeason = {
          year: draftYear,
          totalPicks: picks.length,
          firstRoundPicks: picks.filter((pick) => pick.round === 1).length,
        };
      }

      return {
        coach: {
          id: row.coachId,
          firstName: row.firstName,
          lastName: row.lastName,
        },
        team: {
          id: row.teamId,
          school: row.school,
          conference: row.conference,
        },
        year: row.year,
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        winPercentage: calculateWinPercentage(row.wins, row.ties, row.games),
        preseasonRank: row.preseasonRank,
        postseasonRank: row.postseasonRank,
        srs: roundRating(row.srs),
        spOverall: roundRating(row.spOverall),
        spOffense: roundRating(row.spOffense),
        spDefense: roundRating(row.spDefense),
        teamMetrics: {
          spSpecialTeams: roundRating(row.spSpecialTeams),
          strengthOfSchedule: decimal(row.strengthOfSchedule),
          secondOrderWins: decimal(row.secondOrderWins),
          fpi: decimal(row.fpi),
          yearOverYear: {
            wins:
              priorWins === undefined
                ? null
                : wins.get(teamYearKey(row.teamId, row.year)) === undefined
                  ? null
                  : wins.get(teamYearKey(row.teamId, row.year))! - priorWins,
            srs:
              priorMetrics?.srs === null || priorMetrics?.srs === undefined
                ? null
                : roundRating(row.srs) === null
                  ? null
                  : Math.round(
                      (roundRating(row.srs)! - priorMetrics.srs) * 10,
                    ) / 10,
            spOverall:
              priorMetrics?.spOverall === null ||
              priorMetrics?.spOverall === undefined
                ? null
                : roundRating(row.spOverall) === null
                  ? null
                  : Math.round(
                      (roundRating(row.spOverall)! - priorMetrics.spOverall) *
                        10,
                    ) / 10,
          },
        },
        recruiting: {
          rank: row.recruitingRank,
          points: decimal(row.recruitingPoints),
          talent: talents.get(teamYearKey(row.teamId, row.year)) ?? null,
        },
        pollResume: mapPollResume(
          row.teamId,
          row.year,
          row.preseasonRank,
          row.postseasonRank,
          context.polls,
        ),
        attributionComplete: rowAttribution.complete,
        recordSplits: rowAttribution.splits,
        scoring: rowAttribution.scoring,
        cfp: mapCfpContext(
          row.teamId,
          row.year,
          context.cfpParticipants,
          context.cfpGames,
        ),
        draftFollowingSeason,
      };
    });
};

export const getCoachSeasons = async (
  coachId?: number,
  team?: string,
  year?: number,
  minYear?: number,
  maxYear?: number,
): Promise<DetailedCoachSeason[]> => {
  validateCoachSeasonSelectors(coachId, team, year, minYear, maxYear);

  let query = kdb
    .selectFrom('coachSeason')
    .innerJoin('coach', 'coachSeason.coachId', 'coach.id')
    .innerJoin('team', 'coachSeason.teamId', 'team.id')
    .leftJoin('srs', (join) =>
      join
        .onRef('coachSeason.teamId', '=', 'srs.teamId')
        .onRef('coachSeason.year', '=', 'srs.year'),
    )
    .leftJoin('ratings', (join) =>
      join
        .onRef('coachSeason.teamId', '=', 'ratings.teamId')
        .onRef('coachSeason.year', '=', 'ratings.year'),
    )
    .leftJoin('fpi', (join) =>
      join
        .onRef('coachSeason.teamId', '=', 'fpi.teamId')
        .onRef('coachSeason.year', '=', 'fpi.year'),
    )
    .leftJoin('recruitingTeam', (join) =>
      join
        .onRef('coachSeason.teamId', '=', 'recruitingTeam.teamId')
        .onRef('coachSeason.year', '=', 'recruitingTeam.year'),
    )
    .select([
      'coach.id as coachId',
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
      'ratings.rating as spOverall',
      'ratings.oRating as spOffense',
      'ratings.dRating as spDefense',
      'ratings.stRating as spSpecialTeams',
      'ratings.sos as strengthOfSchedule',
      'ratings.secondOrderWins',
      'fpi.fpi',
      'recruitingTeam.rank as recruitingRank',
      'recruitingTeam.points as recruitingPoints',
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
          and (ct.end_year is null or ct.end_year >= coach_season.year)
      )`.as('conference'),
    )
    .orderBy('coachSeason.year')
    .orderBy('team.id')
    .orderBy('coach.id');

  if (coachId !== undefined) {
    query = query.where('coachSeason.coachId', '=', coachId);
  }
  if (team !== undefined) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }
  if (year !== undefined) {
    query = query.where('coachSeason.year', '=', year);
  }
  if (minYear !== undefined) {
    query = query.where('coachSeason.year', '>=', minYear);
  }
  if (maxYear !== undefined) {
    query = query.where('coachSeason.year', '<=', maxYear);
  }

  const baseRows = await query.execute();
  if (baseRows.length === 0) {
    return [];
  }

  const selectedRows = collapseDetailedRows(baseRows);
  const teamIds = [...new Set(selectedRows.map((row) => row.teamId))];
  const selectedMinYear = Math.min(...selectedRows.map((row) => row.year));
  const selectedMaxYear = Math.max(...selectedRows.map((row) => row.year));
  const contextMinYear = selectedMinYear - 1;
  const draftMinYear = selectedMinYear + 1;
  const draftMaxYear = selectedMaxYear + 1;

  const [
    teamMetrics,
    teamWins,
    talents,
    pollTypes,
    draftCoverage,
    draftPicks,
    cfpParticipants,
    cfpGames,
    attributionSeasons,
    intervals,
    games,
  ] = await Promise.all([
    kdb
      .selectFrom('srs')
      .fullJoin('ratings', (join) =>
        join
          .onRef('srs.teamId', '=', 'ratings.teamId')
          .onRef('srs.year', '=', 'ratings.year'),
      )
      .where((eb) =>
        eb.or([
          eb('srs.teamId', 'in', teamIds),
          eb('ratings.teamId', 'in', teamIds),
        ]),
      )
      .where((eb) =>
        eb.or([
          eb('srs.year', '>=', contextMinYear),
          eb('ratings.year', '>=', contextMinYear),
        ]),
      )
      .where((eb) =>
        eb.or([
          eb('srs.year', '<=', selectedMaxYear),
          eb('ratings.year', '<=', selectedMaxYear),
        ]),
      )
      .select([
        sql<number>`coalesce(srs.team_id, ratings.team_id)`.as('teamId'),
        sql<number>`coalesce(srs.year, ratings.year)`.as('year'),
        'srs.rating as srs',
        'ratings.rating as spOverall',
      ])
      .execute(),
    kdb
      .selectFrom('coachSeason')
      .where('coachSeason.teamId', 'in', teamIds)
      .where('coachSeason.year', '>=', contextMinYear)
      .where('coachSeason.year', '<=', selectedMaxYear)
      .select(['coachSeason.teamId', 'coachSeason.year'])
      .select(sql<number>`sum(coach_season.wins)`.as('wins'))
      .groupBy(['coachSeason.teamId', 'coachSeason.year'])
      .execute(),
    kdb
      .selectFrom('teamTalent')
      .where('teamTalent.teamId', 'in', teamIds)
      .where('teamTalent.year', '>=', selectedMinYear)
      .where('teamTalent.year', '<=', selectedMaxYear)
      .select(['teamTalent.teamId', 'teamTalent.year', 'teamTalent.talent'])
      .execute(),
    kdb
      .selectFrom('pollType')
      .select(['pollType.id', 'pollType.name', 'pollType.shortName'])
      .execute(),
    kdb
      .selectFrom('draftPicks')
      .select([
        sql<number | null>`min(draft_picks.year)`.as('minYear'),
        sql<number | null>`max(draft_picks.year)`.as('maxYear'),
      ])
      .executeTakeFirst(),
    kdb
      .selectFrom('draftPicks')
      .where('draftPicks.collegeTeamId', 'in', teamIds)
      .where('draftPicks.year', '>=', draftMinYear)
      .where('draftPicks.year', '<=', draftMaxYear)
      .select([
        'draftPicks.collegeTeamId as teamId',
        'draftPicks.year',
        'draftPicks.round',
      ])
      .execute(),
    kdb
      .selectFrom('playoffParticipant')
      .innerJoin(
        'playoffTournament',
        'playoffParticipant.playoffId',
        'playoffTournament.id',
      )
      .where('playoffTournament.competition', '=', 'cfp')
      .where('playoffParticipant.teamId', 'in', teamIds)
      .where('playoffTournament.season', '>=', selectedMinYear)
      .where('playoffTournament.season', '<=', selectedMaxYear)
      .select([
        'playoffParticipant.teamId',
        'playoffTournament.season as year',
        'playoffParticipant.seed',
      ])
      .execute(),
    kdb
      .selectFrom('playoffMatchup')
      .innerJoin(
        'playoffTournament',
        'playoffMatchup.playoffId',
        'playoffTournament.id',
      )
      .innerJoin('playoffRound', 'playoffMatchup.roundId', 'playoffRound.id')
      .innerJoin('game', 'playoffMatchup.gameId', 'game.id')
      .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
      .where('playoffTournament.competition', '=', 'cfp')
      .where('gameTeam.teamId', 'in', teamIds)
      .where('playoffTournament.season', '>=', selectedMinYear)
      .where('playoffTournament.season', '<=', selectedMaxYear)
      .select([
        'gameTeam.teamId',
        'playoffTournament.season as year',
        'playoffRound.code as roundCode',
        'gameTeam.winner',
        'game.status',
      ])
      .execute(),
    kdb
      .selectFrom('coachSeason')
      .where('coachSeason.teamId', 'in', teamIds)
      .where('coachSeason.year', '>=', selectedMinYear)
      .where('coachSeason.year', '<=', selectedMaxYear)
      .select([
        'coachSeason.coachId',
        'coachSeason.teamId',
        'coachSeason.year',
        'coachSeason.games',
        'coachSeason.wins',
        'coachSeason.losses',
        'coachSeason.ties',
      ])
      .execute(),
    kdb
      .selectFrom('coachTeam')
      .where('coachTeam.teamId', 'in', teamIds)
      .where('coachTeam.startYear', '<=', selectedMaxYear)
      .where((eb) =>
        eb.or([
          eb('coachTeam.endYear', 'is', null),
          eb('coachTeam.endYear', '>=', selectedMinYear),
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
      .where('game.season', '>=', selectedMinYear)
      .where('game.season', '<=', selectedMaxYear)
      .where('gameTeam.teamId', 'in', teamIds)
      .select([
        'game.id',
        'game.season',
        'game.startDate',
        'game.conferenceGame',
        'game.seasonType',
        'game.neutralSite',
        'gameTeam.teamId',
        'gameTeam.homeAway',
        'gameTeam.points',
        'opponent.points as opponentPoints',
      ])
      .orderBy('game.season')
      .orderBy('game.startDate')
      .orderBy('game.id')
      .orderBy('gameTeam.teamId')
      .execute(),
  ]);

  const apPollTypeId = selectApPollType(pollTypes);
  const polls = await kdb
    .selectFrom('poll')
    .leftJoin('pollRank', (join) =>
      join
        .onRef('poll.id', '=', 'pollRank.pollId')
        .on('pollRank.teamId', 'in', teamIds),
    )
    .where('poll.pollTypeId', '=', apPollTypeId)
    .where('poll.season', '>=', selectedMinYear)
    .where('poll.season', '<=', selectedMaxYear)
    .select([
      'poll.id as pollId',
      'poll.season as year',
      'poll.seasonType',
      'poll.week',
      'pollRank.teamId',
      'pollRank.rank',
    ])
    .orderBy('poll.season')
    .orderBy('poll.week')
    .orderBy('poll.id')
    .execute();

  return mapDetailedCoachSeasons(selectedRows, {
    teamMetrics,
    teamWins,
    talents,
    polls,
    draftCoverage,
    draftPicks,
    cfpParticipants,
    cfpGames,
    attributionSeasons,
    intervals,
    games,
  });
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

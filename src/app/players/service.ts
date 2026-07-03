import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import {
  PlayerPPAChartItem,
  PlayerSearchResult,
  PlayerSearchTeamStint,
  PlayerSeasonOverview,
  PlayerSeasonOverviewCategory,
  PlayerTransfer,
  PlayerUsage,
  ReturningProduction,
} from './types';
import { SelectQueryBuilder, sql } from 'kysely';
import { PASS_PLAY_TYPES } from '../../globals';
import { DB, PlayerUsageStats } from 'src/config/types/db';
import { TransferEligibility } from '../enums';
import { getPredictedPointsAddedByPlayerSeason } from '../metrics/service';
import { getPlayerSeasonStats } from '../stats/service';
import { PlayerStat } from '../stats/types';

interface PlayerSeasonOverviewGameCount {
  season: number;
  id: string;
  name: string;
  position: string;
  team: string;
  conference: string;
  games: number;
}

interface PlayerSearchRawTeamStint {
  rowId: number;
  athleteId: string;
  teamId: number;
  team: string;
  color?: string | null;
  altColor?: string | null;
  startYear: number | null;
  endYear: number | null;
}

interface PlayerSearchLatestTeam {
  team: string;
  teamColor: string;
  teamColorSecondary: string;
}

interface PlayerSearchStintSummary {
  activeStartYear: number | null;
  activeEndYear: number | null;
  latestTeam: PlayerSearchLatestTeam | null;
  teamStints: PlayerSearchTeamStint[];
}

interface PlayerSearchMergedTeamStint extends PlayerSearchTeamStint {
  teamId: number;
  color: string | null;
  altColor: string | null;
}

const getOverviewKey = (season: number, id: string, team: string): string =>
  `${season}:${id}:${team}`;

const compareNullableYears = (
  yearA: number | null,
  yearB: number | null,
): number => {
  if (yearA === null && yearB === null) return 0;
  if (yearA === null) return 1;
  if (yearB === null) return -1;

  return yearA - yearB;
};

const comparePlayerSearchRawTeamStints = (
  stintA: PlayerSearchRawTeamStint,
  stintB: PlayerSearchRawTeamStint,
): number =>
  compareNullableYears(stintA.startYear, stintB.startYear) ||
  compareNullableYears(stintA.endYear, stintB.endYear) ||
  stintA.rowId - stintB.rowId;

const comparePlayerSearchMergedTeamStints = (
  stintA: PlayerSearchMergedTeamStint,
  stintB: PlayerSearchMergedTeamStint,
): number =>
  compareNullableYears(stintA.startYear, stintB.startYear) ||
  compareNullableYears(stintA.endYear, stintB.endYear) ||
  stintA.team.localeCompare(stintB.team) ||
  stintA.teamId - stintB.teamId;

const canMergePlayerSearchStints = (
  current: PlayerSearchTeamStint,
  next: PlayerSearchRawTeamStint,
): boolean => {
  if (current.endYear === null) return true;
  if (next.startYear === null) return false;

  return next.startYear <= current.endYear + 1;
};

const mergePlayerSearchStint = (
  current: PlayerSearchMergedTeamStint,
  next: PlayerSearchRawTeamStint,
): void => {
  if (current.startYear === null) {
    current.startYear = next.startYear;
  } else if (next.startYear !== null) {
    current.startYear = Math.min(current.startYear, next.startYear);
  }

  if (current.endYear === null || next.endYear === null) {
    current.endYear = null;
  } else {
    current.endYear = Math.max(current.endYear, next.endYear);
  }
};

const isMoreRecentPlayerSearchTeamStint = (
  candidate: PlayerSearchMergedTeamStint,
  current: PlayerSearchMergedTeamStint,
): boolean => {
  if (candidate.endYear === null && current.endYear !== null) return true;
  if (candidate.endYear !== null && current.endYear === null) return false;

  if (
    candidate.endYear !== null &&
    current.endYear !== null &&
    candidate.endYear !== current.endYear
  ) {
    return candidate.endYear > current.endYear;
  }

  if (candidate.startYear !== null && current.startYear === null) return true;
  if (candidate.startYear === null && current.startYear !== null) return false;

  if (
    candidate.startYear !== null &&
    current.startYear !== null &&
    candidate.startYear !== current.startYear
  ) {
    return candidate.startYear > current.startYear;
  }

  return candidate.teamId < current.teamId;
};

const getLatestPlayerSearchTeam = (
  stints: PlayerSearchMergedTeamStint[],
): PlayerSearchLatestTeam | null => {
  if (stints.length === 0) {
    return null;
  }

  const latestStint = stints.reduce((latest, stint) =>
    isMoreRecentPlayerSearchTeamStint(stint, latest) ? stint : latest,
  );

  return {
    team: latestStint.team,
    teamColor: `#${latestStint.color}`,
    teamColorSecondary: `#${latestStint.altColor}`,
  };
};

const derivePlayerSearchStintSummary = (
  stints: PlayerSearchTeamStint[],
  latestTeam: PlayerSearchLatestTeam | null,
): PlayerSearchStintSummary => {
  const knownStartYears = stints
    .map((stint) => stint.startYear)
    .filter((year): year is number => year !== null);
  const knownEndYears = stints
    .map((stint) => stint.endYear)
    .filter((year): year is number => year !== null);

  return {
    activeStartYear:
      knownStartYears.length > 0 ? Math.min(...knownStartYears) : null,
    activeEndYear: stints.some((stint) => stint.endYear === null)
      ? null
      : knownEndYears.length > 0
        ? Math.max(...knownEndYears)
        : null,
    latestTeam,
    teamStints: stints,
  };
};

export const mapPlayerSeasonOverviewCategories = (
  stats: PlayerStat[],
): PlayerSeasonOverviewCategory[] => {
  const categoryMap = new Map<string, PlayerSeasonOverviewCategory>();

  for (const stat of stats) {
    const category = categoryMap.get(stat.category) ?? {
      name: stat.category,
      stats: [],
    };

    category.stats.push({
      name: stat.statType,
      value: stat.stat,
    });

    categoryMap.set(stat.category, category);
  }

  return Array.from(categoryMap.values());
};

export const mapPlayerSearchStintSummaries = (
  rows: PlayerSearchRawTeamStint[],
): Map<string, PlayerSearchStintSummary> => {
  const rowsByAthlete = new Map<string, PlayerSearchRawTeamStint[]>();

  for (const row of rows) {
    const athleteId = String(row.athleteId);
    const athleteRows = rowsByAthlete.get(athleteId) ?? [];
    athleteRows.push({
      ...row,
      athleteId,
    });
    rowsByAthlete.set(athleteId, athleteRows);
  }

  const summaries = new Map<string, PlayerSearchStintSummary>();

  for (const [athleteId, athleteRows] of rowsByAthlete.entries()) {
    const rowsByTeam = new Map<number, PlayerSearchRawTeamStint[]>();

    for (const row of athleteRows) {
      const teamRows = rowsByTeam.get(row.teamId) ?? [];
      teamRows.push(row);
      rowsByTeam.set(row.teamId, teamRows);
    }

    const mergedStints: PlayerSearchMergedTeamStint[] = [];

    for (const teamRows of rowsByTeam.values()) {
      const sortedRows = [...teamRows].sort(comparePlayerSearchRawTeamStints);
      let currentStint: PlayerSearchMergedTeamStint | null = null;

      for (const row of sortedRows) {
        if (!currentStint) {
          currentStint = {
            team: row.team,
            teamId: row.teamId,
            color: row.color ?? null,
            altColor: row.altColor ?? null,
            startYear: row.startYear,
            endYear: row.endYear,
          };
          continue;
        }

        if (canMergePlayerSearchStints(currentStint, row)) {
          mergePlayerSearchStint(currentStint, row);
        } else {
          mergedStints.push(currentStint);
          currentStint = {
            team: row.team,
            teamId: row.teamId,
            color: row.color ?? null,
            altColor: row.altColor ?? null,
            startYear: row.startYear,
            endYear: row.endYear,
          };
        }
      }

      if (currentStint) {
        mergedStints.push(currentStint);
      }
    }

    const sortedStints = mergedStints.sort(comparePlayerSearchMergedTeamStints);
    const latestTeam = getLatestPlayerSearchTeam(sortedStints);
    const teamStints = sortedStints.map(
      (stint): PlayerSearchTeamStint => ({
        team: stint.team,
        startYear: stint.startYear,
        endYear: stint.endYear,
      }),
    );

    summaries.set(
      athleteId,
      derivePlayerSearchStintSummary(teamStints, latestTeam),
    );
  }

  return summaries;
};

export const searchPlayers = async (
  searchTerm: string,
  year?: number,
  team?: string,
  position?: string,
): Promise<PlayerSearchResult[]> => {
  let query = kdb
    .selectFrom('athlete')
    .innerJoin('athleteTeam', 'athlete.id', 'athleteTeam.athleteId')
    .innerJoin('team', 'athleteTeam.teamId', 'team.id')
    .innerJoin('position', 'athlete.positionId', 'position.id')
    .innerJoin('hometown', 'athlete.hometownId', 'hometown.id')
    .where((eb) =>
      eb(
        eb.fn('lower', ['athlete.name']),
        'like',
        `%${searchTerm.toLowerCase()}%`,
      ),
    )
    .select([
      'athlete.id',
      'athlete.name',
      'athlete.firstName',
      'athlete.lastName',
      'athlete.weight',
      'athlete.height',
      'athlete.jersey',
      'position.abbreviation as position',
      'hometown.city as hometownCity',
    ])
    .distinct()
    .orderBy('athlete.name')
    .limit(100);

  if (year) {
    query = query
      .where('athleteTeam.startYear', '<=', year)
      .where((eb) =>
        eb.or([
          eb('athleteTeam.endYear', '>=', year),
          eb('athleteTeam.endYear', 'is', null),
        ]),
      );
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (position) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['position.abbreviation']),
        '=',
        position.toLowerCase(),
      ),
    );
  }

  const results = await query.execute();

  if (results.length === 0) {
    return [];
  }

  const athleteIds = Array.from(new Set(results.map((result) => result.id)));
  const stintRows = await kdb
    .selectFrom('athleteTeam')
    .innerJoin('team', 'athleteTeam.teamId', 'team.id')
    .select([
      'athleteTeam.id as rowId',
      'athleteTeam.athleteId',
      'athleteTeam.teamId',
      'team.school as team',
      'team.color',
      'team.altColor',
      'athleteTeam.startYear',
      'athleteTeam.endYear',
    ])
    .where('athleteTeam.athleteId', 'in', athleteIds)
    .orderBy('athleteTeam.athleteId')
    .orderBy('athleteTeam.teamId')
    .orderBy('athleteTeam.startYear')
    .orderBy('athleteTeam.endYear')
    .orderBy('athleteTeam.id')
    .execute();

  const stintSummaries = mapPlayerSearchStintSummaries(
    stintRows.map((row) => ({
      rowId: row.rowId,
      athleteId: String(row.athleteId),
      teamId: row.teamId,
      team: row.team,
      color: row.color,
      altColor: row.altColor,
      startYear: row.startYear,
      endYear: row.endYear,
    })),
  );
  const emptySummary: PlayerSearchStintSummary = {
    activeStartYear: null,
    activeEndYear: null,
    latestTeam: null,
    teamStints: [],
  };

  return results.map((r): PlayerSearchResult => {
    const summary = stintSummaries.get(String(r.id)) ?? emptySummary;

    return {
      id: r.id,
      team: summary.latestTeam?.team ?? '',
      name: r.name,
      firstName: r.firstName,
      lastName: r.lastName,
      weight: r.weight,
      height: r.height,
      jersey: r.jersey,
      position: r.position,
      hometown: `${r.hometownCity}`,
      teamColor: summary.latestTeam?.teamColor ?? '#null',
      teamColorSecondary: summary.latestTeam?.teamColorSecondary ?? '#null',
      activeStartYear: summary.activeStartYear,
      activeEndYear: summary.activeEndYear,
      teamStints: summary.teamStints,
    };
  });
};

export const generateMeanPassingChart = async (
  id: number,
  year?: number,
  rollingPlays?: number,
): Promise<PlayerPPAChartItem[]> => {
  const season = year ? year : 2025;
  const query = kdb
    .with('plays', (cte) =>
      cte
        .selectFrom('game')
        .innerJoin('drive', 'game.id', 'drive.gameId')
        .innerJoin('play', (join) =>
          join
            .onRef('drive.id', '=', 'play.driveId')
            .on('play.ppa', 'is not', null)
            .on('play.playTypeId', 'in', PASS_PLAY_TYPES),
        )
        .innerJoin('playStat', 'play.id', 'playStat.playId')
        .innerJoin('athlete', 'playStat.athleteId', 'athlete.id')
        .innerJoin('team', 'play.offenseId', 'team.id')
        .innerJoin('conferenceTeam', (join) =>
          join
            .onRef('team.id', '=', 'conferenceTeam.teamId')
            .on('conferenceTeam.endYear', 'is', null)
            .on('conferenceTeam.startYear', 'is not', null),
        )
        .innerJoin('position', (join) =>
          join
            .onRef('athlete.positionId', '=', 'position.id')
            .on('position.abbreviation', '=', 'QB'),
        )
        .where('game.season', '=', season)
        .where('athlete.id', '=', id.toString())
        .select(['athlete.id', 'athlete.name', 'team.school', 'play.ppa'])
        .select((eb) =>
          eb.fn
            .agg<number>('row_number')
            .over((ob) =>
              ob
                .partitionBy(['athlete.name', 'team.school'])
                .orderBy('game.season')
                .orderBy('game.week')
                .orderBy('play.period')
                .orderBy('play.clock', 'desc')
                .orderBy('drive.id')
                .orderBy('play.id'),
            )

            .as('row_num'),
        ),
    )
    .with('grouped', (cte) =>
      cte
        .selectFrom('plays as p1')
        .innerJoin('plays as p2', (join) => {
          if (rollingPlays) {
            return join
              .onRef('p2.row_num', '<=', 'p1.row_num')
              .on((eb) =>
                eb(
                  eb.ref('p2.row_num'),
                  '>',
                  eb('p1.row_num', '-', rollingPlays),
                ),
              );
          } else {
            return join.onRef('p2.row_num', '<=', 'p1.row_num');
          }
        })
        .select(['p1.row_num as rowNum', 'p2.ppa']),
    )
    .selectFrom('grouped')
    .groupBy('rowNum')
    .orderBy('rowNum')
    .select('rowNum')
    .select((eb) => eb.fn.avg('ppa').as('avgPpa'));

  const results = await query.execute();

  return results.map(
    (r): PlayerPPAChartItem => ({
      playNumber: r.rowNum,
      avgPPA: typeof r.avgPpa === 'number' ? r.avgPpa : parseFloat(r.avgPpa),
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
  threshold?: number,
): Promise<PlayerUsage[]> => {
  let baseQuery: SelectQueryBuilder<
    DB & {
      usage: PlayerUsageStats;
    },
    'usage',
    object
  >;

  if (excludeGarbageTime) {
    baseQuery = kdb.selectFrom('playerUsageStatsFiltered as usage');
  } else {
    baseQuery = kdb.selectFrom('playerUsageStats as usage');
  }

  let query = baseQuery
    .innerJoin('team', 'usage.school', 'team.school')
    .leftJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .onRef('conferenceTeam.startYear', '<=', 'usage.season')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', 'is', null),
            eb('conferenceTeam.endYear', '>=', eb.ref('usage.season')),
          ]),
        ),
    )
    .leftJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .groupBy([
      'usage.season',
      'usage.athleteId',
      'usage.name',
      'usage.position',
      'team.school',
      'conference.abbreviation',
    ])
    .select([
      'usage.season',
      'usage.athleteId',
      'usage.name',
      'usage.position',
      'team.school',
      'conference.abbreviation as conference',
    ])
    .select((eb) => [
      eb.fn.sum('usage.teamPlays').as('teamPlays'),
      eb.fn.sum('usage.teamPassPlays').as('teamPassPlays'),
      eb.fn.sum('usage.teamRushPlays').as('teamRushPlays'),
      eb.fn.sum('usage.teamFirstDowns').as('teamFirstDowns'),
      eb.fn.sum('usage.teamSecondDowns').as('teamSecondDowns'),
      eb.fn.sum('usage.teamThirdDowns').as('teamThirdDowns'),
      eb.fn.sum('usage.teamStandardDowns').as('teamStandardDowns'),
      eb.fn.sum('usage.teamPassingDowns').as('teamPassingDowns'),
      eb.fn.sum('usage.plays').as('plays'),
      eb.fn.sum('usage.passPlays').as('passPlays'),
      eb.fn.sum('usage.rushPlays').as('rushPlays'),
      eb.fn.sum('usage.firstDowns').as('firstDowns'),
      eb.fn.sum('usage.secondDowns').as('secondDowns'),
      eb.fn.sum('usage.thirdDowns').as('thirdDowns'),
      eb.fn.sum('usage.standardDowns').as('standardDowns'),
      eb.fn.sum('usage.passingDowns').as('passingDowns'),
    ]);

  if (year) {
    query = query.where('usage.season', '=', year);
  }

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  if (position) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['usage.position']), '=', position.toLowerCase()),
    );
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (playerId) {
    query = query.where('usage.athleteId', '=', String(playerId));
  }

  if (threshold) {
    query = query.having('plays', '>=', threshold);
  }

  const results = await query.execute();

  return results.map(
    (r): PlayerUsage => ({
      season: r.season,
      id: r.athleteId,
      name: r.name,
      position: r.position,
      team: r.school,
      conference: r.conference ?? '',
      usage: {
        overall: r.plays
          ? Math.round((Number(r.plays) * 1000) / Number(r.teamPlays)) / 1000
          : null,
        pass: r.passPlays
          ? Math.round((Number(r.passPlays) * 1000) / Number(r.teamPassPlays)) /
            1000
          : null,
        rush: r.rushPlays
          ? Math.round((Number(r.rushPlays) * 1000) / Number(r.teamRushPlays)) /
            1000
          : null,
        firstDown: r.firstDowns
          ? Math.round(
              (Number(r.firstDowns) * 1000) / Number(r.teamFirstDowns),
            ) / 1000
          : null,
        secondDown: r.secondDowns
          ? Math.round(
              (Number(r.secondDowns) * 1000) / Number(r.teamSecondDowns),
            ) / 1000
          : null,
        thirdDown: r.thirdDowns
          ? Math.round(
              (Number(r.thirdDowns) * 1000) / Number(r.teamThirdDowns),
            ) / 1000
          : null,
        standardDowns: r.standardDowns
          ? Math.round(
              (Number(r.standardDowns) * 1000) / Number(r.teamStandardDowns),
            ) / 1000
          : null,
        passingDowns: r.passingDowns
          ? Math.round(
              (Number(r.passingDowns) * 1000) / Number(r.teamPassingDowns),
            ) / 1000
          : null,
      },
    }),
  );
};

const getPlayerSeasonOverviewGameCounts = async (
  year: number,
  playerId: number,
): Promise<PlayerSeasonOverviewGameCount[]> => {
  const results = await kdb
    .selectFrom('game')
    .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
    .innerJoin('gamePlayerStat', 'gameTeam.id', 'gamePlayerStat.gameTeamId')
    .innerJoin('athlete', 'gamePlayerStat.athleteId', 'athlete.id')
    .innerJoin('position', 'athlete.positionId', 'position.id')
    .innerJoin('team', 'gameTeam.teamId', 'team.id')
    .innerJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .onRef('conferenceTeam.startYear', '<=', 'game.season')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', 'is', null),
            eb('conferenceTeam.endYear', '>=', eb.ref('game.season')),
          ]),
        ),
    )
    .innerJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .where('game.season', '=', year)
    .where('athlete.id', '=', String(playerId))
    .select([
      'game.season',
      'athlete.id',
      'athlete.name',
      'position.abbreviation as position',
      'team.school as team',
      'conference.name as conference',
      sql<number>`COUNT(DISTINCT game.id)`.as('games'),
    ])
    .groupBy([
      'game.season',
      'athlete.id',
      'athlete.name',
      'position.abbreviation',
      'team.school',
      'conference.name',
    ])
    .execute();

  return results.map(
    (r): PlayerSeasonOverviewGameCount => ({
      season: r.season,
      id: r.id,
      name: r.name,
      position: r.position,
      team: r.team,
      conference: r.conference,
      games: Number(r.games),
    }),
  );
};

export const getPlayerSeasonOverview = async (
  year: number,
  playerId: number,
): Promise<PlayerSeasonOverview> => {
  const [stats, usage, ppa, gameCounts] = await Promise.all([
    getPlayerSeasonStats(
      year,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      playerId,
    ),
    getPlayerUsage(year, undefined, undefined, undefined, playerId),
    getPredictedPointsAddedByPlayerSeason(
      year,
      undefined,
      undefined,
      undefined,
      String(playerId),
    ),
    getPlayerSeasonOverviewGameCounts(year, playerId),
  ]);

  const overviewMap = new Map<string, PlayerSeasonOverview>();

  const upsertOverview = (
    season: number,
    id: string,
    name: string,
    position: string,
    team: string,
    conference: string,
  ): PlayerSeasonOverview => {
    const key = getOverviewKey(season, id, team);
    const existing = overviewMap.get(key);

    if (existing) {
      return existing;
    }

    const overview: PlayerSeasonOverview = {
      season,
      id,
      name,
      position,
      team,
      conference,
      games: 0,
      boxScoreStats: {
        categories: [],
      },
    };

    overviewMap.set(key, overview);
    return overview;
  };

  for (const gameCount of gameCounts) {
    const overview = upsertOverview(
      gameCount.season,
      gameCount.id,
      gameCount.name,
      gameCount.position,
      gameCount.team,
      gameCount.conference,
    );

    overview.games = gameCount.games;
  }

  const statsByPlayer = new Map<string, PlayerStat[]>();
  for (const stat of stats) {
    const key = getOverviewKey(stat.season, stat.playerId, stat.team);
    const playerStats = statsByPlayer.get(key) ?? [];
    playerStats.push(stat);
    statsByPlayer.set(key, playerStats);

    upsertOverview(
      stat.season,
      stat.playerId,
      stat.player,
      stat.position,
      stat.team,
      stat.conference,
    );
  }

  for (const [key, playerStats] of statsByPlayer.entries()) {
    const overview = overviewMap.get(key);

    if (overview) {
      overview.boxScoreStats.categories =
        mapPlayerSeasonOverviewCategories(playerStats);
    }
  }

  for (const playerUsage of usage) {
    const overview = upsertOverview(
      playerUsage.season,
      playerUsage.id,
      playerUsage.name,
      playerUsage.position,
      playerUsage.team,
      playerUsage.conference,
    );

    overview.usage = playerUsage.usage;
  }

  for (const playerPpa of ppa) {
    const overview = upsertOverview(
      playerPpa.season,
      playerPpa.id,
      playerPpa.name,
      playerPpa.position,
      playerPpa.team,
      playerPpa.conference,
    );

    overview.ppa = {
      average: playerPpa.averagePPA,
      total: playerPpa.totalPPA,
    };
  }

  return Array.from(overviewMap.values())[0];
};

export const getReturningProduction = async (
  year?: number,
  team?: string,
  conference?: string,
): Promise<ReturningProduction[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  let query = kdb.selectFrom('returningProduction').selectAll();

  if (year) {
    query = query.where('season', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['conference']), '=', conference.toLowerCase()),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): ReturningProduction => ({
      season: r.season,
      team: r.school,
      conference: r.conference,
      totalPPA: Number(r.returningPpa),
      totalPassingPPA: Number(r.returningPassPpa),
      totalReceivingPPA: Number(r.returningReceivingPpa),
      totalRushingPPA: Number(r.returningRushPpa),
      percentPPA:
        Number(r.ppa) !== 0
          ? Math.round((Number(r.returningPpa) * 1000) / Number(r.ppa)) / 1000
          : 0,
      percentPassingPPA:
        Number(r.passPpa) !== 0
          ? Math.round(
              (Number(r.returningPassPpa) * 1000) / Number(r.passPpa),
            ) / 1000
          : 0,
      percentReceivingPPA:
        Number(r.receivingPpa) !== 0
          ? Math.round(
              (Number(r.returningReceivingPpa) * 1000) / Number(r.receivingPpa),
            ) / 1000
          : 0,
      percentRushingPPA:
        Number(r.rushPpa) !== 0
          ? Math.round(
              (Number(r.returningRushPpa) * 1000) / Number(r.rushPpa),
            ) / 1000
          : 0,
      usage: Number(r.returningUsage),
      passingUsage: Number(r.returningPassUsage),
      receivingUsage: Number(r.returningReceivingUsage),
      rushingUsage: Number(r.returningRushUsage),
    }),
  );
};

export const getTransferPortal = async (
  year: number,
): Promise<PlayerTransfer[]> => {
  const transfers = await kdb
    .selectFrom('transfer')
    .innerJoin('recruitPosition', 'transfer.positionId', 'recruitPosition.id')
    .innerJoin('team as fromTeam', 'transfer.fromTeamId', 'fromTeam.id')
    .leftJoin('team as toTeam', 'transfer.toTeamId', 'toTeam.id')
    .where('transfer.season', '=', year)
    .select([
      'transfer.id',
      'transfer.season',
      'transfer.firstName',
      'transfer.lastName',
      'recruitPosition.position as position',
      'fromTeam.school as source',
      'toTeam.school as destination',
      'transfer.transferDate',
      'transfer.rating',
      'transfer.stars',
      'transfer.eligibility',
    ])
    .execute();

  return transfers.map(
    (t): PlayerTransfer => ({
      season: t.season,
      firstName: t.firstName,
      lastName: t.lastName,
      position: t.position,
      origin: t.source,
      destination: t.destination,
      transferDate: t.transferDate,
      rating: t.rating ? Number(t.rating) : null,
      stars: t.stars,
      eligibility: t.eligibility as TransferEligibility | null,
    }),
  );
};

import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import {
  PlayerPPAChartItem,
  PlayerSearchResult,
  PlayerTransfer,
  PlayerUsage,
  ReturningProduction,
} from './types';
import { SelectQueryBuilder } from 'kysely';
import { PASS_PLAY_TYPES } from '../../globals';
import { DB, PlayerUsageStats } from 'src/config/types/db';

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
      'team.school',
      'athlete.name',
      'athlete.firstName',
      'athlete.lastName',
      'athlete.weight',
      'athlete.height',
      'athlete.jersey',
      'position.abbreviation as position',
      'hometown.city as hometownCity',
      'hometown.state as hometownState',
      'team.color',
      'team.altColor',
    ])
    .distinct()
    .orderBy('athlete.name')
    .limit(100);

  if (year) {
    query = query
      .where('athleteTeam.startYear', '<=', year)
      .where('athleteTeam.endYear', '>=', year);
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

  return results.map(
    (r): PlayerSearchResult => ({
      id: r.id,
      team: r.school,
      name: r.name,
      firstName: r.firstName,
      lastName: r.lastName,
      weight: r.weight,
      height: r.height,
      jersey: r.jersey,
      position: r.position,
      hometown: `${r.hometownCity}`,
      teamColor: `#${r.color}`,
      teamColorSecondary: `#${r.altColor}`,
    }),
  );
};

export const generateMeanPassingChart = async (
  id: number,
  year?: number,
  rollingPlays?: number,
): Promise<PlayerPPAChartItem[]> => {
  const season = year ? year : 2023;
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
    {}
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
      // @ts-ignore
      eligibility: t.eligibility,
    }),
  );
};

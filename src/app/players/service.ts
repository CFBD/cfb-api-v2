import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import {
  PlayerPPAChartItem,
  PlayerSearchResult,
  PlayerTransfer,
  PlayerUsage,
  ReturningProduction,
} from './types';
import { sql } from 'kysely';
import { PASS_PLAY_TYPES, RUSH_PLAY_TYPES } from '../../globals';

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
  let season = year ? year : 2023;
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
                eb(sql`p2.row_num + ${rollingPlays}`, '>', 'p1.row_num'),
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
): Promise<PlayerUsage[]> => {
  const query = kdb
    .with('plays', (cte) => {
      let playsQuery = cte
        .selectFrom('game')
        .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
        .innerJoin('team', 'gameTeam.teamId', 'team.id')
        .innerJoin('conferenceTeam', (join) =>
          join
            .onRef('team.id', '=', 'conferenceTeam.teamId')
            .onRef('conferenceTeam.startYear', '<=', 'game.season')
            .on((eb) =>
              eb.or([
                eb('conferenceTeam.endYear', '>=', eb.ref('game.season')),
                eb('conferenceTeam.endYear', 'is', null),
              ]),
            ),
        )
        .innerJoin('conference', (join) =>
          join
            .onRef('conferenceTeam.conferenceId', '=', 'conference.id')
            .on('conference.division', '=', 'fbs'),
        )
        .innerJoin('drive', 'game.id', 'drive.gameId')
        .innerJoin('play', (join) =>
          join
            .onRef('drive.id', '=', 'play.driveId')
            .onRef('play.offenseId', '=', 'team.id')
            .on('play.ppa', 'is not', null),
        )
        .innerJoin(
          (eb) =>
            eb
              .selectFrom('playStat')
              .select(['playStat.playId', 'playStat.athleteId'])
              .distinct()
              .as('playStatAthlete'),
          (join) => join.onRef('play.id', '=', 'playStatAthlete.playId'),
        )
        .innerJoin('athlete', 'playStatAthlete.athleteId', 'athlete.id')
        // .innerJoin('athleteTeam', (join) =>
        //   join
        //     .onRef('athlete.id', '=', 'athleteTeam.athleteId')
        //     .onRef('athleteTeam.startYear', '<=', 'game.season')
        //     .onRef('athleteTeam.endYear', '>=', 'game.season')
        //     .onRef('athleteTeam.teamId', '=', 'team.id'),
        // )
        .innerJoin('position', 'athlete.positionId', 'position.id')
        .where('position.abbreviation', 'in', ['QB', 'RB', 'FB', 'TE', 'WR'])
        .where('game.season', '=', year)
        .groupBy([
          'game.season',
          'athlete.id',
          'athlete.name',
          'position.abbreviation',
          'team.id',
          'team.school',
          'conference.name',
        ])
        .select([
          'game.season',
          'team.id as teamId',
          'team.school',
          'conference.name as conference',
          'athlete.id',
          'athlete.name',
          'position.abbreviation as position',
        ])
        .select((eb) => eb.fn.count('play.id').as('plays'))
        .select((eb) =>
          eb.fn
            .count('play.id')
            .filterWhere('play.playTypeId', 'in', PASS_PLAY_TYPES)
            .as('passPlays'),
        )
        .select((eb) =>
          eb.fn
            .count('play.id')
            .filterWhere('play.playTypeId', 'in', RUSH_PLAY_TYPES)
            .as('rushPlays'),
        )
        .select((eb) =>
          eb.fn
            .count('play.id')
            .filterWhere('play.down', '=', 1)
            .as('firstDowns'),
        )
        .select((eb) =>
          eb.fn
            .count('play.id')
            .filterWhere('play.down', '=', 2)
            .as('secondDowns'),
        )
        .select((eb) =>
          eb.fn
            .count('play.id')
            .filterWhere('play.down', '=', 3)
            .as('thirdDowns'),
        )
        .select((eb) =>
          eb.fn
            .count('play.id')
            .filterWhere((eb) =>
              eb.or([
                eb('play.down', '=', 2).and('play.distance', '>=', 8),
                eb('play.down', 'in', [3, 4]).and('play.distance', '>=', 5),
              ]),
            )
            .as('passingDowns'),
        )
        .select((eb) =>
          eb.fn
            .count('play.id')
            .filterWhere((eb) =>
              eb.or([
                eb('play.distance', '<', 5),
                eb('play.down', '=', 2).and('play.distance', '<', 8),
              ]),
            )
            .as('standardDowns'),
        )
        .distinct();

      if (excludeGarbageTime) {
        playsQuery = playsQuery.where('play.garbageTime', '=', false);
      }

      if (conference) {
        playsQuery = playsQuery.where((eb) =>
          eb(
            eb.fn('lower', ['conference.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
        );
      }

      if (position) {
        playsQuery = playsQuery.where((eb) =>
          eb(
            eb.fn('lower', ['position.abbreviation']),
            '=',
            position.toLowerCase(),
          ),
        );
      }

      if (team) {
        playsQuery = playsQuery.where((eb) =>
          eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
        );
      }

      if (playerId) {
        playsQuery = playsQuery.where('athlete.id', '=', playerId.toString());
      }

      return playsQuery;
    })
    .with('teamCounts', (cte) => {
      let teamCountsQuery = cte
        .selectFrom('game')
        .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
        .innerJoin('team', 'gameTeam.teamId', 'team.id')
        .innerJoin('conferenceTeam', (join) =>
          join
            .onRef('team.id', '=', 'conferenceTeam.teamId')
            .onRef('conferenceTeam.startYear', '<=', 'game.season')
            .on((eb) =>
              eb.or([
                eb('conferenceTeam.endYear', '>=', eb.ref('game.season')),
                eb('conferenceTeam.endYear', 'is', null),
              ]),
            ),
        )
        .innerJoin('conference', (join) =>
          join
            .onRef('conferenceTeam.conferenceId', '=', 'conference.id')
            .on('conference.division', '=', 'fbs'),
        )
        .innerJoin('drive', 'game.id', 'drive.gameId')
        .innerJoin('play', (join) =>
          join
            .onRef('drive.id', '=', 'play.driveId')
            .onRef('play.offenseId', '=', 'team.id')
            .on('play.ppa', 'is not', null),
        )
        .where('game.season', '=', year)
        .groupBy(['game.season', 'team.id', 'team.school'])
        .select(['game.season', 'team.id as teamId', 'team.school'])
        .select((eb) => eb.fn.countAll().as('plays'))
        .select((eb) =>
          eb.fn
            .countAll()
            .filterWhere('play.playTypeId', 'in', PASS_PLAY_TYPES)
            .as('passPlays'),
        )
        .select((eb) =>
          eb.fn
            .countAll()
            .filterWhere('play.playTypeId', 'in', RUSH_PLAY_TYPES)
            .as('rushPlays'),
        )
        .select((eb) =>
          eb.fn.countAll().filterWhere('play.down', '=', 1).as('firstDowns'),
        )
        .select((eb) =>
          eb.fn.countAll().filterWhere('play.down', '=', 2).as('secondDowns'),
        )
        .select((eb) =>
          eb.fn.countAll().filterWhere('play.down', '=', 3).as('thirdDowns'),
        )
        .select((eb) =>
          eb.fn
            .countAll()
            .filterWhere((eb) =>
              eb.or([
                eb('play.down', '=', 2).and('play.distance', '>=', 8),
                eb('play.down', 'in', [3, 4]).and('play.distance', '>=', 5),
              ]),
            )
            .as('passingDowns'),
        )
        .select((eb) =>
          eb.fn
            .countAll()
            .filterWhere((eb) =>
              eb.or([
                eb('play.distance', '<', 5),
                eb('play.down', '=', 2).and('play.distance', '<', 8),
              ]),
            )
            .as('standardDowns'),
        );

      if (excludeGarbageTime) {
        teamCountsQuery = teamCountsQuery.where('play.garbageTime', '=', false);
      }
      return teamCountsQuery;
    })
    .selectFrom('plays')
    .innerJoin('teamCounts', 'plays.teamId', 'teamCounts.teamId')
    .select([
      'plays.season',
      'plays.id',
      'plays.name',
      'plays.position',
      'plays.school',
      'plays.conference',
    ])
    .select(
      sql<number>`ROUND(CAST(CAST(plays.plays AS NUMERIC) /  team_counts.plays AS NUMERIC), 4)`.as(
        'overallUsage',
      ),
    )
    .select(
      sql<number>`ROUND(CAST(CAST(plays.pass_plays AS NUMERIC) /  team_counts.pass_plays AS NUMERIC), 4)`.as(
        'passUsage',
      ),
    )
    .select(
      sql<number>`ROUND(CAST(CAST(plays.rush_plays AS NUMERIC) /  team_counts.rush_plays AS NUMERIC), 4)`.as(
        'rushUsage',
      ),
    )
    .select(
      sql<number>`ROUND(CAST(CAST(plays.first_downs AS NUMERIC) /  team_counts.first_downs AS NUMERIC), 4)`.as(
        'firstDownUsage',
      ),
    )
    .select(
      sql<number>`ROUND(CAST(CAST(plays.second_downs AS NUMERIC) /  team_counts.second_downs AS NUMERIC), 3)`.as(
        'secondDownUsage',
      ),
    )
    .select(
      sql<number>`ROUND(CAST(CAST(plays.third_downs AS NUMERIC) /  team_counts.third_downs AS NUMERIC), 3)`.as(
        'thirdDownUsage',
      ),
    )
    .select(
      sql<number>`ROUND(CAST(CAST(plays.standard_downs AS NUMERIC) /  team_counts.standard_downs AS NUMERIC), 3)`.as(
        'standardDownUsage',
      ),
    )
    .select(
      sql<number>`ROUND(CAST(CAST(plays.passing_downs AS NUMERIC) /  team_counts.passing_downs AS NUMERIC), 3)`.as(
        'passingDownUsage',
      ),
    )
    .orderBy('overallUsage', 'desc');

  const results = await query.execute();

  return results.map(
    (r): PlayerUsage => ({
      season: r.season,
      id: r.id,
      name: r.name,
      position: r.position,
      team: r.school,
      conference: r.conference,
      usage: {
        overall: r.overallUsage,
        pass: r.passUsage,
        rush: r.rushUsage,
        firstDown: r.firstDownUsage,
        secondDown: r.secondDownUsage,
        thirdDown: r.thirdDownUsage,
        standardDowns: r.standardDownUsage,
        passingDowns: r.passingDownUsage,
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
      totalPPA: r.returningPpa,
      totalPassingPPA: r.returningPassPpa,
      totalReceivingPPA: r.returningReceivingPpa,
      totalRushingPPA: r.returningRushPpa,
      percentPPA: Math.round((r.returningPpa * 1000) / r.ppa) / 1000,
      percentPassingPPA:
        Math.round((r.returningPassPpa * 1000) / r.passPpa) / 1000,
      percentReceivingPPA:
        Math.round((r.returningReceivingPpa * 1000) / r.receivingPpa) / 1000,
      percentRushingPPA:
        Math.round((r.returningRushPpa * 1000) / r.rushPpa) / 1000,
      usage: r.returningUsage,
      passingUsage: r.returningPassUsage,
      receivingUsage: r.returningReceivingUsage,
      rushingUsage: r.returningRushUsage,
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
      rating: t.rating ? parseFloat(t.rating) : null,
      stars: t.stars,
      // @ts-ignore
      eligibility: t.eligibility,
    }),
  );
};

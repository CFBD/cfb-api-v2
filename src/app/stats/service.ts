import { ValidateError } from 'tsoa';
import { db, kdb } from '../../config/database';
import { SeasonType } from '../enums';
import {
  AdvancedGameStat,
  AdvancedSeasonStat,
  PlayerStat,
  TeamStat,
} from './types';
import { sql } from 'kysely';
import { PASS_PLAY_TYPES, RUSH_PLAY_TYPES } from '../../globals';

export const getPlayerSeasonStats = async (
  year: number,
  conference?: string,
  team?: string,
  startWeek?: number,
  endWeek?: number,
  seasonType?: SeasonType,
  category?: string,
): Promise<PlayerStat[]> => {
  let baseQuery = kdb
    .selectFrom('game')
    .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
    .innerJoin('gamePlayerStat', 'gameTeam.id', 'gamePlayerStat.gameTeamId')
    .innerJoin('athlete', 'gamePlayerStat.athleteId', 'athlete.id')
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
    .innerJoin(
      'playerStatCategory',
      'gamePlayerStat.categoryId',
      'playerStatCategory.id',
    )
    .innerJoin('playerStatType', 'gamePlayerStat.typeId', 'playerStatType.id')
    .select([
      'game.season',
      'athlete.id as playerId',
      'athlete.name as player',
      'team.school as team',
      'conference.name as conference',
      'playerStatCategory.name as category',
    ])
    .where('game.season', '=', year)
    .groupBy([
      'game.season',
      'athlete.id',
      'athlete.name',
      'team.school',
      'conference.name',
      'playerStatCategory.name',
      'playerStatType.name',
    ]);

  if (conference) {
    baseQuery = baseQuery.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  if (team) {
    baseQuery = baseQuery.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (startWeek) {
    baseQuery = baseQuery.where('game.week', '>=', startWeek);
  }

  if (endWeek) {
    baseQuery = baseQuery.where('game.week', '<=', endWeek);
  }

  if (seasonType && seasonType !== SeasonType.Both) {
    baseQuery = baseQuery.where('game.seasonType', '=', seasonType);
  }

  if (category) {
    baseQuery = baseQuery.where((eb) =>
      eb(
        eb.fn('lower', ['playerStatCategory.name']),
        '=',
        category.toLowerCase(),
      ),
    );
  }

  let query = baseQuery
    .where('gamePlayerStat.stat', '<>', '--')
    .where('gamePlayerStat.stat', 'not like', '--/--')
    .where((eb) =>
      eb.or([
        eb('playerStatType.id', 'in', [8, 14, 22]),
        eb.and([
          eb('playerStatCategory.id', '=', 1),
          eb('playerStatType.id', '=', 11),
        ]),
        eb.and([
          eb('playerStatCategory.id', '=', 2),
          eb('playerStatType.id', '=', 5),
        ]),
        eb.and([
          eb('playerStatCategory.id', '=', 3),
          eb('playerStatType.id', 'in', [6, 21]),
        ]),
        eb.and([
          eb('playerStatCategory.id', '=', 6),
          eb('playerStatType.id', '=', 18),
        ]),
        eb('playerStatCategory.id', '=', 7),
        eb.and([
          eb('playerStatCategory.id', '=', 8),
          eb('playerStatType.id', '=', 9),
        ]),
        eb.and([
          eb('playerStatCategory.id', '=', 9),
          eb('playerStatType.id', '=', 18),
        ]),
        eb('playerStatCategory.id', '=', 10),
      ]),
    )
    .select('playerStatType.name as statType')
    .select((eb) =>
      eb.fn.sum<number>(eb.cast('gamePlayerStat.stat', 'numeric')).as('stat'),
    );

  query = query
    .union(
      baseQuery
        .where('playerStatType.id', '=', 15)
        .where('gamePlayerStat.stat', '<>', '--')
        .where('gamePlayerStat.stat', 'not like', '--/--')
        .select('playerStatType.name as statType')
        .select((eb) =>
          eb.fn
            .max<number>(eb.cast('gamePlayerStat.stat', 'integer'))
            .as('stat'),
        ),
    )
    .union(
      baseQuery
        .where((eb) =>
          eb.or([
            eb.and([
              eb('playerStatCategory.id', '=', 2),
              eb('playerStatType.id', 'in', [2, 10]),
            ]),
            eb.and([
              eb('playerStatCategory.id', '=', 9),
              eb('playerStatType.id', '=', 3),
            ]),
          ]),
        )
        .where('gamePlayerStat.stat', '<>', '--')
        .where('gamePlayerStat.stat', 'not like', '--/--')
        .select((eb) =>
          eb
            .case()
            .when(
              eb.and([
                eb('playerStatCategory.name', '=', 'kicking'),
                eb('playerStatType.name', '=', 'FG'),
              ]),
            )
            .then('FGM')
            .when(
              eb.and([
                eb('playerStatCategory.name', '=', 'kicking'),
                eb('playerStatType.name', '=', 'XP'),
              ]),
            )
            .then('XPM')
            .when(
              eb.and([
                eb('playerStatCategory.name', '=', 'passing'),
                eb('playerStatType.name', '=', 'C/ATT'),
              ]),
            )
            .then('COMPLETIONS')
            .else('')
            .end()
            .as('statType'),
        )
        .select((eb) =>
          eb.fn
            .sum<number>(
              eb.cast(
                sql<string>`split_part(game_player_stat.stat, '/', 1)`,
                'integer',
              ),
            )
            .as('stat'),
        ),
    )
    .union(
      baseQuery
        .where((eb) =>
          eb.or([
            eb.and([
              eb('playerStatCategory.id', '=', 2),
              eb('playerStatType.id', 'in', [2, 10]),
            ]),
            eb.and([
              eb('playerStatCategory.id', '=', 9),
              eb('playerStatType.id', '=', 3),
            ]),
          ]),
        )
        .where('gamePlayerStat.stat', '<>', '--')
        .where('gamePlayerStat.stat', 'not like', '--/--')
        .select((eb) =>
          eb
            .case()
            .when(
              eb.and([
                eb('playerStatCategory.name', '=', 'kicking'),
                eb('playerStatType.name', '=', 'FG'),
              ]),
            )
            .then('FGA')
            .when(
              eb.and([
                eb('playerStatCategory.name', '=', 'kicking'),
                eb('playerStatType.name', '=', 'XP'),
              ]),
            )
            .then('XPA')
            .when(
              eb.and([
                eb('playerStatCategory.name', '=', 'passing'),
                eb('playerStatType.name', '=', 'C/ATT'),
              ]),
            )
            .then('ATT')
            .else('')
            .end()
            .as('statType'),
        )
        .select((eb) =>
          eb.fn
            .sum<number>(
              eb.cast(
                sql<string>`split_part(game_player_stat.stat, '/', 2)`,
                'integer',
              ),
            )
            .as('stat'),
        ),
    )
    .union(
      baseQuery
        .where('playerStatCategory.id', 'in', [1, 3, 4, 5, 6, 8, 9])
        .where('gamePlayerStat.stat', '<>', '--')
        .where('gamePlayerStat.stat', 'not like', '--/--')
        .select((eb) =>
          eb
            .case()
            .when(eb('playerStatCategory.name', '=', 'rushing'))
            .then('YPC')
            .when(eb('playerStatCategory.name', '=', 'receiving'))
            .then('YPR')
            .when(eb('playerStatCategory.name', '=', 'punting'))
            .then('YPP')
            .when(eb('playerStatCategory.name', '=', 'passing'))
            .then('YPA')
            .when(
              eb('playerStatCategory.name', 'in', [
                'kickReturns',
                'puntReturns',
                'interceptions',
              ]),
            )
            .then('AVG')
            .else('')
            .end()
            .as('statType'),
        )
        .select((eb) =>
          eb
            .case()
            .when(
              eb.and([
                eb('playerStatCategory.name', 'in', [
                  'rushing',
                  'punting',
                  'kickReturns',
                  'puntReturns',
                  'interceptions',
                  'receiving',
                ]),
                eb(
                  eb.fn
                    .sum<number>(eb.cast('gamePlayerStat.stat', 'integer'))
                    .filterWhere(
                      eb('playerStatType.name', 'in', [
                        'CAR',
                        'NO',
                        'INT',
                        'REC',
                      ]),
                    ),
                  '=',
                  0,
                ),
              ]),
            )
            .then(0)
            .when(
              eb('playerStatCategory.name', 'in', [
                'rushing',
                'punting',
                'kickReturns',
                'puntReturns',
                'interceptions',
                'receiving',
              ]),
            )
            .then(
              sql<number>`ROUND(COALESCE(SUM(CAST(game_player_stat.stat AS INT)) FILTER(WHERE player_stat_type.name = 'YDS'), 0) / SUM(CAST(game_player_stat.stat AS NUMERIC)) FILTER(WHERE player_stat_type.name IN('CAR', 'NO', 'INT', 'REC')), 1)`,
            )
            .when(
              eb.and([
                eb('playerStatCategory.name', '=', 'passing'),
                eb(
                  eb.fn
                    .sum<number>(
                      eb.cast(
                        sql<string>`split_part(game_player_stat.stat, '/', 2)`,
                        'integer',
                      ),
                    )
                    .filterWhere('playerStatType.id', '=', 3),
                  '=',
                  0,
                ),
              ]),
            )
            .then(0)
            .when(eb('playerStatCategory.name', '=', 'passing'))
            .then(
              sql<number>`ROUND(SUM(CAST(game_player_stat.stat AS INT)) FILTER(WHERE player_stat_type.id = 8) / SUM(CAST(split_part(game_player_stat.stat, '/', 2) AS NUMERIC)) FILTER(WHERE player_stat_type.id = 3), 1)`,
            )
            .else(0)
            .end()
            .as('stat'),
        ),
    )
    .union(
      baseQuery
        .where('playerStatCategory.id', 'in', [2, 9])
        .where('gamePlayerStat.stat', '<>', '--')
        .where('gamePlayerStat.stat', '<>', '--/--')
        .select((eb) =>
          eb
            .case()
            .when(eb('playerStatCategory.name', '=', 'kicking'))
            .then('PCT')
            .when(eb('playerStatCategory.name', '=', 'passing'))
            .then('PCT')
            .else('')
            .end()
            .as('statType'),
        )
        .select((eb) =>
          eb
            .case()
            .when(
              eb.and([
                eb('playerStatCategory.name', '=', 'passing'),
                eb(
                  eb.fn
                    .sum<number>(
                      eb.cast(
                        sql<string>`split_part(game_player_stat.stat, '/', 2)`,
                        'integer',
                      ),
                    )
                    .filterWhere('playerStatType.id', '=', 3),
                  '=',
                  0,
                ),
              ]),
            )
            .then(0)
            .when(eb('playerStatCategory.name', '=', 'passing'))
            .then(
              sql<number>`ROUND(SUM(CAST(split_part(game_player_stat.stat, '/', 1) AS INT)) FILTER(WHERE player_stat_type.id = 3) / SUM(CAST(split_part(game_player_stat.stat, '/', 2) AS NUMERIC)) FILTER(WHERE player_stat_type.id = 3), 3)`,
            )
            .when(
              eb.and([
                eb('playerStatCategory.name', '=', 'kicking'),
                eb(
                  eb.fn
                    .sum<number>(
                      eb.cast(
                        sql<string>`split_part(game_player_stat.stat, '/', 2)`,
                        'integer',
                      ),
                    )
                    .filterWhere('playerStatType.id', '=', 2),
                  '=',
                  0,
                ),
              ]),
            )
            .then(0)
            .when(eb('playerStatCategory.name', '=', 'kicking'))
            .then(
              sql<number>`ROUND(SUM(CAST(split_part(game_player_stat.stat, '/', 1) AS INT)) FILTER(WHERE player_stat_type.id = 2) / SUM(CAST(split_part(game_player_stat.stat, '/', 2) AS NUMERIC)) FILTER(WHERE player_stat_type.id = 2), 3)`,
            )
            .else(0)
            .end()
            .as('stat'),
        ),
    );

  const results = await query.execute();

  return results
    .filter(
      (r) =>
        r.stat !== null && r.stat !== 0 && r.stat !== 0.0 && !isNaN(r.stat),
    )
    .map(
      (r): PlayerStat => ({
        season: r.season,
        playerId: r.playerId,
        player: r.player,
        team: r.team,
        conference: r.conference,
        category: r.category,
        statType: r.statType,
        stat: r.stat,
      }),
    );
};

export const getTeamStats = async (
  year?: number,
  team?: string,
  conference?: string,
  startWeek?: number,
  endWeek?: number,
): Promise<TeamStat[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }
  let baseQuery = kdb
    .selectFrom('game')
    .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
    .innerJoin('team', 'gameTeam.teamId', 'team.id')
    .innerJoin('gameTeamStat', 'gameTeam.id', 'gameTeamStat.gameTeamId')
    .innerJoin('teamStatType', 'gameTeamStat.typeId', 'teamStatType.id')
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
    .innerJoin('conference', (join) =>
      join
        .onRef('conferenceTeam.conferenceId', '=', 'conference.id')
        .on('conference.division', '=', 'fbs'),
    )
    .select(['game.season', 'team.school', 'conference.name as conference'])
    .groupBy([
      'game.season',
      'team.school',
      'conference.name',
      'teamStatType.id',
      'teamStatType.name',
    ]);

  let gamesQuery = kdb
    .selectFrom('game')
    .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
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
    .innerJoin('conference', (join) =>
      join
        .onRef('conferenceTeam.conferenceId', '=', 'conference.id')
        .on('conference.division', '=', 'fbs'),
    )
    .select(['game.season', 'team.school', 'conference.name as conference'])
    .select(sql.lit('games').as('statType'))
    .select((eb) => eb.fn.countAll().as('stat'))
    .groupBy(['game.season', 'team.school', 'conference.name']);

  if (year) {
    baseQuery = baseQuery.where('game.season', '=', year);
    gamesQuery = gamesQuery.where('game.season', '=', year);
  }

  if (team) {
    baseQuery = baseQuery.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
    gamesQuery = gamesQuery.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    baseQuery = baseQuery.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
    gamesQuery = gamesQuery.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  if (startWeek) {
    baseQuery = baseQuery.where((eb) =>
      eb.or([
        eb('game.week', '>=', startWeek),
        eb('game.seasonType', '=', 'postseason'),
      ]),
    );

    gamesQuery = gamesQuery.where((eb) =>
      eb.or([
        eb('game.week', '>=', startWeek),
        eb('game.seasonType', '=', 'postseason'),
      ]),
    );
  }

  if (endWeek) {
    baseQuery = baseQuery
      .where('game.week', '<=', endWeek)
      .where('game.seasonType', '<>', 'postseason');
    gamesQuery = gamesQuery
      .where('game.week', '<=', endWeek)
      .where('game.seasonType', '<>', 'postseason');
  }

  let query = gamesQuery
    .union(
      baseQuery
        .where(
          'teamStatType.id',
          'in',
          [
            2, 3, 4, 7, 10, 11, 12, 13, 18, 21, 23, 24, 25, 26, 31, 32, 33, 34,
            35, 36, 37, 38,
          ],
        )
        .select('teamStatType.name as statType')
        .select(
          sql<number>`FLOOR(SUM(CAST(game_team_stat.stat AS NUMERIC)))`.as(
            'stat',
          ),
        ),
    )
    .union(
      baseQuery
        .where('teamStatType.id', 'in', [5, 6, 14, 15])
        .select((eb) =>
          eb
            .case()
            .when(eb('teamStatType.id', '=', 5))
            .then('passCompletions')
            .when(eb('teamStatType.id', '=', 6))
            .then('penalties')
            .when(eb('teamStatType.id', '=', 14))
            .then('thirdDownConversions')
            .when(eb('teamStatType.id', '=', 15))
            .then('fourthDownConversions')
            .else('')
            .end()
            .as('statType'),
        )
        .select(
          sql<number>`FLOOR(SUM(CAST(split_part(game_team_stat.stat, '-', 1) AS NUMERIC)))`.as(
            'stat',
          ),
        ),
    )
    .union(
      baseQuery
        .where('teamStatType.id', 'in', [5, 6, 14, 15])
        .select((eb) =>
          eb
            .case()
            .when(eb('teamStatType.id', '=', 5))
            .then('passAttempts')
            .when(eb('teamStatType.id', '=', 6))
            .then('penaltyYards')
            .when(eb('teamStatType.id', '=', 14))
            .then('thirdDowns')
            .when(eb('teamStatType.id', '=', 15))
            .then('fourthDowns')
            .else('')
            .end()
            .as('statType'),
        )
        .select(
          sql<number>`FLOOR(SUM(CAST(CASE WHEN split_part(game_team_stat.stat, '-', 2) = '' THEN '0' ELSE split_part(game_team_stat.stat, '-', 2) END AS INT)))`.as(
            'stat',
          ),
        ),
    )
    .union(
      baseQuery
        .where('teamStatType.id', '=', 8)
        .select('teamStatType.name as statType')
        .select(
          sql<number>`SUM(EXTRACT(epoch FROM CAST('00:' || game_team_stat.stat AS INTERVAL)))`.as(
            'stat',
          ),
        ),
    );

  const results = await query.execute();

  return results.map(
    (r): TeamStat => ({
      season: r.season,
      team: r.school,
      conference: r.conference,
      statName: r.statType,
      // @ts-ignore
      statValue: r.stat,
    }),
  );
};

export const getCategories = async (): Promise<string[]> => {
  const results = await kdb
    .selectFrom('teamStatType')
    .select('name')
    .orderBy('name')
    .execute();
  return results.map((r) => r.name);
};

export const getAdvancedStats = async (
  year?: number,
  team?: string,
  excludeGarbageTime?: boolean,
  startWeek?: number,
  endWeek?: number,
): Promise<AdvancedSeasonStat[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  const filters = [];
  const params = [];
  let index = 1;

  if (year) {
    filters.push(`g.season = $${index}`);
    params.push(year);
    index++;
  }

  if (team) {
    filters.push(`LOWER(t.school) = LOWER($${index})`);
    params.push(team);
    index++;
  }

  if (startWeek) {
    filters.push(`(g.week >= $${index} OR g.season_type = 'postseason')`);
    params.push(startWeek);
    index++;
  }

  if (endWeek) {
    filters.push(`g.week <= $${index} AND g.season_type <> 'postseason'`);
    params.push(endWeek);
    index++;
  }

  const filter = `WHERE ${filters.join(' AND ')}`;

  const mainTask = db.any(
    `
        WITH plays AS (
            SELECT  g.id,
                    g.season,
                    t.school,
                    p.drive_id,
                    p.down,
                    p.distance,
                    p.yards_gained,
                    c.name AS conference,
                    CASE
                        WHEN p.offense_id = t.id THEN 'offense'
                        ELSE 'defense'
                    END AS o_d,
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
                    p.ppa AS ppa
            FROM game AS g
                INNER JOIN game_team AS gt ON g.id = gt.game_id
                INNER JOIN team AS t ON gt.team_id = t.id
                INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.end_year IS NULL
                INNER JOIN conference AS c ON ct.conference_id = c.id AND c.division = 'fbs'
                INNER JOIN drive AS d ON g.id = d.game_id
                INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
            ${filter}
        )
        SELECT 	season,
                school AS team,
                conference,
                o_d AS unit,
                COUNT(ppa) AS plays,
                COUNT(DISTINCT(drive_id)) AS drives,
                AVG(ppa) AS ppa,
                AVG(ppa) FILTER(WHERE down_type = 'standard') AS standard_down_ppa,
                AVG(ppa) FILTER(WHERE down_type = 'passing') AS passing_down_ppa,
                AVG(ppa) FILTER(WHERE play_type = 'Pass') AS passing_ppa,
                AVG(ppa) FILTER(WHERE play_type = 'Rush') AS rushing_ppa,
                SUM(ppa) AS total_ppa,
                SUM(ppa) FILTER(WHERE play_type = 'Pass') AS total_passing_ppa,
                SUM(ppa) FILTER(WHERE play_type = 'Rush') AS total_rushing_ppa,
                CAST(AVG(CASE WHEN down_type = 'standard' THEN 1 ELSE 0 END) AS NUMERIC) AS standard_down_rate,
                CAST(AVG(CASE WHEN down_type = 'passing' THEN 1 ELSE 0 END) AS NUMERIC) AS passing_down_rate,
                CAST(AVG(CASE WHEN play_type = 'Pass' THEN 1 ELSE 0 END) AS NUMERIC) AS passing_rate,
                CAST(AVG(CASE WHEN play_type = 'Rush' THEN 1 ELSE 0 END) AS NUMERIC) AS rush_rate,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END)) AS NUMERIC) AS success_rate,
                AVG(ppa) FILTER(WHERE success = true) AS explosiveness,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE down_type = 'standard')) AS NUMERIC) AS standard_down_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND down_type = 'standard') AS standard_down_explosiveness,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE down_type = 'passing')) AS NUMERIC) AS passing_down_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND down_type = 'passing') AS passing_down_explosiveness,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE play_type = 'Rush')) AS NUMERIC) AS rush_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND play_type = 'Rush') AS rush_explosiveness,
                CAST((AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE play_type = 'Pass')) AS NUMERIC) AS pass_success_rate,
                AVG(ppa) FILTER(WHERE success = true AND play_type = 'Pass') AS pass_explosiveness,
                CAST(AVG(CASE WHEN success = true THEN 1 ELSE 0 END) FILTER(WHERE distance <= 2 AND play_type = 'Rush') AS NUMERIC) AS power_success,
                CAST(AVG(CASE WHEN yards_gained <= 0 THEN 1 ELSE 0 END) FILTER(WHERE play_type = 'Rush') AS NUMERIC) AS stuff_rate,
                COALESCE(CAST(AVG(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC)) AS line_yards,
                ROUND(COALESCE(CAST(SUM(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC), 0), 0) AS line_yards_sum,
                CAST(AVG(CASE WHEN yards_gained >= 10 THEN 5 WHEN yards_gained > 5 THEN (yards_gained - 5) ELSE 0 END) FILTER(WHERE play_type = 'Rush') AS NUMERIC) AS second_level_yards,
                CAST(SUM(CASE WHEN yards_gained >= 10 THEN 5 ELSE (yards_gained - 5) END) FILTER(WHERE yards_gained >= 5 AND play_type = 'Rush') AS NUMERIC) AS second_level_yards_sum,
                CAST(AVG(CASE WHEN yards_gained > 10 THEN yards_gained - 10 ELSE 0 END) FILTER(WHERE play_type = 'Rush') AS NUMERIC) AS open_field_yards,
                CAST(SUM(yards_gained - 10) FILTER(WHERE play_type = 'Rush' AND yards_gained >= 10) AS NUMERIC) AS open_field_yards_sum
        FROM plays
        ${excludeGarbageTime === true ? 'WHERE garbage_time = false' : ''}
        GROUP BY season, school, conference, o_d
        `,
    params,
  );

  const havocTask1 = db.any(
    `
            WITH havoc_events AS (
                WITH fumbles AS (
                    SELECT g.season, t.id AS team_id, COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0) AS fumbles
                    FROM game AS g
                        INNER JOIN game_team AS gt ON g.id = gt.game_id
                        INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                        INNER JOIN team AS t ON gt2.team_id = t.id
                        INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                        LEFT JOIN game_player_stat AS s ON s.game_team_id = gt.id AND s.type_id = 4 AND s.category_id = 10
                    ${filter}
                    GROUP BY g.season, t.id
                )
                SELECT 	g.season,
                        t.id AS team_id,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0.0) + f.fumbles AS total_havoc,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id IN (16,24)), 0.0) AS db_havoc,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id = 21), 0.0) + f.fumbles AS front_seven_havoc
                FROM game AS g
                    INNER JOIN game_team AS gt ON g.id = gt.game_id
                    INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                    INNER JOIN team AS t ON gt.team_id = t.id
                    INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                    INNER JOIN game_team_stat AS s ON s.game_team_id = gt.id AND s.type_id IN (16,21,24)
                    LEFT JOIN fumbles AS f ON f.team_id = t.id
                ${filter}
                GROUP BY g.season, t.id, f.fumbles
            ), plays AS (
                SELECT g.season, t.id AS team_id, COUNT(p.id) AS total
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
                    INNER JOIN team AS t ON p.defense_id = t.id
                    INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                ${filter}
                GROUP BY g.season, t.id
            )
            SELECT p.season AS season, t.school AS team, (h.total_havoc / p.total) AS total_havoc, (h.front_seven_havoc / p.total) AS front_seven_havoc, (h.db_havoc / p.total) AS db_havoc
            FROM plays AS p
                INNER JOIN havoc_events AS h ON p.team_id = h.team_id AND h.season = p.season
                INNER JOIN team AS t ON t.id = p.team_id
        `,
    params,
  );

  const havocTask2 = await db.any(
    `
            WITH havoc_events AS (
                WITH fumbles AS (
                    SELECT g.season, t.id AS team_id, COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0) AS fumbles
                    FROM game AS g
                        INNER JOIN game_team AS gt ON g.id = gt.game_id
                        INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                        INNER JOIN team AS t ON gt.team_id = t.id
                        INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                        LEFT JOIN game_player_stat AS s ON s.game_team_id = gt.id AND s.type_id = 4 AND s.category_id = 10
                    ${filter}
                    GROUP BY g.season, t.id
                )
                SELECT 	g.season,
                        t.id AS team_id,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)), 0.0) + f.fumbles AS total_havoc,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id IN (16,24)), 0.0) AS db_havoc,
                        COALESCE(SUM(CAST(s.stat AS NUMERIC)) FILTER (WHERE s.type_id = 21), 0.0) + f.fumbles AS front_seven_havoc
                FROM game AS g
                    INNER JOIN game_team AS gt ON g.id = gt.game_id
                    INNER JOIN game_team AS gt2 ON g.id = gt2.game_id AND gt.id <> gt2.id
                    INNER JOIN team AS t ON gt.team_id = t.id
                    INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                    INNER JOIN game_team_stat AS s ON s.game_team_id = gt2.id AND s.type_id IN (16,21,24)
                    LEFT JOIN fumbles AS f ON f.team_id = t.id
                ${filter}
                GROUP BY g.season, t.id, f.fumbles
            ), plays AS (
                SELECT g.season, t.id AS team_id, COUNT(p.id) AS total
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN play AS p ON d.id = p.drive_id AND p.ppa IS NOT NULL
                    INNER JOIN team AS t ON p.offense_id = t.id
                    INNER JOIN conference_team AS ct ON ct.team_id = t.id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                ${filter}
                GROUP BY g.season, t.id
            )
            SELECT p.season AS season, t.school AS team, (h.total_havoc / p.total) AS total_havoc, (h.front_seven_havoc / p.total) AS front_seven_havoc, (h.db_havoc / p.total) AS db_havoc
            FROM plays AS p
                INNER JOIN havoc_events AS h ON p.team_id = h.team_id AND h.season = p.season
                INNER JOIN team AS t ON t.id = p.team_id
        `,
    params,
  );

  const scoringOppTasks = db.any(
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
                ${filter} AND d.start_period < 5
            ), drives AS (
                SELECT season, drive_id, MIN(yardsToGoal) AS min_yards
                FROM drive_data
                GROUP BY season, drive_id
            ), drive_points AS (
                SELECT  t.school,
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
            SELECT season, school, unit, COUNT(*) AS opportunities, AVG(points) AS points
            FROM drive_points
            GROUP BY season, school, unit
        `,
    params,
  );

  const fieldPositionTask = db.any(
    `
            WITH offensive_drives AS (
                SELECT 	g.season,
                        t.id AS team_id,
                        AVG(CASE
                            WHEN gt.home_away = 'home' THEN (100 - d.start_yardline)
                            ELSE d.start_yardline
                        END) as drive_start,
                        AVG(ppa.predicted_points) AS ppa
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN game_team AS gt ON g.id = gt.game_id AND gt.team_id = d.offense_id
                    INNER JOIN team AS t ON d.offense_id = t.id
                    INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                    INNER JOIN ppa ON ppa.down = 1 AND ppa.distance = 10 AND ((gt.home_away = 'home' AND (100 - d.start_yardline) = ppa.yard_line) OR (gt.home_away = 'away' AND d.start_yardline = ppa.yard_line))
                ${filter} AND d.start_period < 5 AND d.result_id NOT IN (28, 41, 43, 44, 57)
                GROUP BY g.season, t.id
            ), defensive_drives AS (
                SELECT 	g.season,
                        t.id AS team_id,
                        AVG(CASE
                            WHEN gt.home_away = 'away' THEN (100 - d.start_yardline)
                            ELSE d.start_yardline
                        END) as drive_start,
                        AVG(ppa.predicted_points) AS ppa
                FROM game AS g
                    INNER JOIN drive AS d ON g.id = d.game_id
                    INNER JOIN game_team AS gt ON g.id = gt.game_id AND gt.team_id = d.defense_id
                    INNER JOIN team AS t ON d.defense_id = t.id
                    INNER JOIN conference_team AS ct ON t.id = ct.team_id AND ct.end_year IS NULL AND ct.start_year IS NOT NULL
                    INNER JOIN ppa ON ppa.down = 1 AND ppa.distance = 10 AND ((gt.home_away = 'away' AND (100 - d.start_yardline) = ppa.yard_line) OR (gt.home_away = 'home' AND d.start_yardline = ppa.yard_line))
                ${filter} AND d.start_period < 5 AND d.result_id NOT IN (28, 41, 43, 44, 57)
                GROUP BY g.season, t.id
            )
            SELECT 	o.season,
                    t.school,
                    ROUND(o.drive_start, 1) AS avg_start_off,
                    ROUND((o.ppa), 3) AS avg_predicted_points_off,
                    ROUND((d.drive_start), 1) AS avg_start_def,
                    ROUND((-d.ppa), 3) AS avg_predicted_points_def
            FROM team AS t
                INNER JOIN offensive_drives AS o ON o.team_id = t.id
                INNER JOIN defensive_drives AS d ON t.id = d.team_id AND o.season = d.season
        `,
    params,
  );

  const fullResults = await db.task(async (t) => {
    return await t.batch([
      mainTask,
      havocTask1,
      havocTask2,
      scoringOppTasks,
      fieldPositionTask,
    ]);
  });

  const results = fullResults[0];
  const havocResultsD = fullResults[1];
  const havocResultsO = fullResults[2];
  const scoringOppResults = fullResults[3];
  const fieldPositionResults = fullResults[4];

  let stats: AdvancedSeasonStat[] = [];
  let years = Array.from(new Set(results.map((r) => r.season)));

  for (let year of years) {
    let teams = Array.from(
      new Set(results.filter((r) => r.season == year).map((r) => r.team)),
    );

    let yearStats = teams.map((t): AdvancedSeasonStat => {
      let offense = results.find(
        (r) => r.season == year && r.team == t && r.unit == 'offense',
      );
      let defense = results.find(
        (r) => r.season == year && r.team == t && r.unit == 'defense',
      );
      let havocD = havocResultsD.find((r) => r.season == year && r.team == t);
      let havocO = havocResultsO.find((r) => r.season == year && r.team == t);
      let scoringOppO = scoringOppResults.find(
        (r) => r.season == year && r.school == t && r.unit == 'offense',
      );
      let scoringOppD = scoringOppResults.find(
        (r) => r.season == year && r.school == t && r.unit == 'defense',
      );
      let fieldPosition = fieldPositionResults.find(
        (r) => r.season == year && r.school == t,
      );

      return {
        season: year,
        team: t,
        conference: offense.conference,
        offense: {
          plays: parseInt(offense.plays),
          drives: parseInt(offense.drives),
          ppa: parseFloat(offense.ppa),
          totalPPA: parseFloat(offense.total_ppa),
          successRate: parseFloat(offense.success_rate),
          explosiveness: parseFloat(offense.explosiveness),
          powerSuccess: parseFloat(offense.power_success),
          stuffRate: parseFloat(offense.stuff_rate),
          lineYards: parseFloat(offense.line_yards),
          lineYardsTotal: parseInt(offense.line_yards_sum),
          secondLevelYards: parseFloat(offense.second_level_yards),
          secondLevelYardsTotal: parseInt(offense.second_level_yards_sum),
          openFieldYards: parseFloat(offense.open_field_yards),
          openFieldYardsTotal: parseInt(offense.open_field_yards_sum),
          totalOpportunies: parseInt(
            scoringOppO ? scoringOppO.opportunities : 0,
          ),
          pointsPerOpportunity: parseFloat(
            scoringOppO ? scoringOppO.points : 0,
          ),
          fieldPosition: {
            averageStart: fieldPosition
              ? parseFloat(fieldPosition.avg_start_off)
              : null,
            averagePredictedPoints: fieldPosition
              ? parseFloat(fieldPosition.avg_predicted_points_off)
              : null,
          },
          havoc: {
            total: havocO ? parseFloat(havocO.total_havoc) : null,
            frontSeven: havocO ? parseFloat(havocO.front_seven_havoc) : null,
            db: havocO ? parseFloat(havocO.db_havoc) : null,
          },
          standardDowns: {
            rate: parseFloat(offense.standard_down_rate),
            ppa: parseFloat(offense.standard_down_ppa),
            successRate: parseFloat(offense.standard_down_success_rate),
            explosiveness: parseFloat(offense.standard_down_explosiveness),
          },
          passingDowns: {
            rate: parseFloat(offense.passing_down_rate),
            ppa: parseFloat(offense.passing_down_ppa),
            successRate: parseFloat(offense.passing_down_success_rate),
            explosiveness: parseFloat(offense.passing_down_explosiveness),
          },
          rushingPlays: {
            rate: parseFloat(offense.rush_rate),
            ppa: parseFloat(offense.rushing_ppa),
            totalPPA: parseFloat(offense.total_rushing_ppa),
            successRate: parseFloat(offense.rush_success_rate),
            explosiveness: parseFloat(offense.rush_explosiveness),
          },
          passingPlays: {
            rate: parseFloat(offense.passing_rate),
            ppa: parseFloat(offense.passing_ppa),
            totalPPA: parseFloat(offense.total_passing_ppa),
            successRate: parseFloat(offense.pass_success_rate),
            explosiveness: parseFloat(offense.pass_explosiveness),
          },
        },
        defense: {
          plays: parseInt(defense.plays),
          drives: parseInt(defense.drives),
          ppa: parseFloat(defense.ppa),
          totalPPA: parseFloat(defense.total_ppa),
          successRate: parseFloat(defense.success_rate),
          explosiveness: parseFloat(defense.explosiveness),
          powerSuccess: parseFloat(defense.power_success),
          stuffRate: parseFloat(defense.stuff_rate),
          lineYards: parseFloat(defense.line_yards),
          lineYardsTotal: parseInt(defense.line_yards_sum),
          secondLevelYards: parseFloat(defense.second_level_yards),
          secondLevelYardsTotal: parseInt(defense.second_level_yards_sum),
          openFieldYards: parseFloat(defense.open_field_yards),
          openFieldYardsTotal: parseInt(defense.open_field_yards_sum),
          totalOpportunies: parseInt(
            scoringOppD ? scoringOppD.opportunities : 0,
          ),
          pointsPerOpportunity: parseFloat(
            scoringOppD ? scoringOppD.points : 0,
          ),
          fieldPosition: {
            averageStart: fieldPosition
              ? parseFloat(fieldPosition.avg_start_def)
              : null,
            averagePredictedPoints: fieldPosition
              ? parseFloat(fieldPosition.avg_predicted_points_def)
              : null,
          },
          havoc: {
            total: havocD ? parseFloat(havocD.total_havoc) : null,
            frontSeven: havocD ? parseFloat(havocD.front_seven_havoc) : null,
            db: havocD ? parseFloat(havocD.db_havoc) : null,
          },
          standardDowns: {
            rate: parseFloat(defense.standard_down_rate),
            ppa: parseFloat(defense.standard_down_ppa),
            successRate: parseFloat(defense.standard_down_success_rate),
            explosiveness: parseFloat(defense.standard_down_explosiveness),
          },
          passingDowns: {
            rate: parseFloat(defense.passing_down_rate),
            ppa: parseFloat(defense.passing_down_ppa),
            totalPPA: parseFloat(defense.total_passing_ppa),
            successRate: parseFloat(defense.passing_down_success_rate),
            explosiveness: parseFloat(defense.passing_down_explosiveness),
          },
          rushingPlays: {
            rate: parseFloat(defense.rush_rate),
            ppa: parseFloat(defense.rushing_ppa),
            totalPPA: parseFloat(defense.total_rushing_ppa),
            successRate: parseFloat(defense.rush_success_rate),
            explosiveness: parseFloat(defense.rush_explosiveness),
          },
          passingPlays: {
            rate: parseFloat(defense.passing_rate),
            ppa: parseFloat(defense.passing_ppa),
            totalPPA: parseFloat(defense.total_passing_ppa),
            successRate: parseFloat(defense.pass_success_rate),
            explosiveness: parseFloat(defense.pass_explosiveness),
          },
        },
      };
    });

    stats = [...stats, ...yearStats];
  }

  return stats;
};

export const getAdvancedGameStats = async (
  year?: number,
  team?: string,
  week?: number,
  opponent?: string,
  excludeGarbageTime?: boolean,
  seasonType?: SeasonType,
): Promise<AdvancedGameStat[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  let query = kdb
    .with('plays', (eb) => {
      let withClause = eb
        .selectFrom('game')
        .innerJoin('gameTeam as gt', 'game.id', 'gt.gameId')
        .innerJoin('team as t', 'gt.teamId', 't.id')
        .innerJoin('gameTeam as gt2', (join) =>
          join
            .onRef('game.id', '=', 'gt2.gameId')
            .onRef('gt.id', '<>', 'gt2.id'),
        )
        .innerJoin('team as t2', 'gt2.teamId', 't2.id')
        .innerJoin('drive', 'game.id', 'drive.gameId')
        .innerJoin('play', (join) =>
          join
            .onRef('drive.id', '=', 'play.driveId')
            .on('play.ppa', 'is not', null),
        )
        .select([
          'game.id',
          'game.season',
          'game.week',
          't.school',
          't2.school as opponent',
          'play.driveId',
          'play.down',
          'play.distance',
          'play.yardsGained',
          'play.ppa',
        ])
        .select((eb) =>
          eb
            .case()
            .when(eb('play.offenseId', '=', eb.ref('t.id')))
            .then('offense')
            .else('defense')
            .end()
            .as('oD'),
        )
        .select((eb) =>
          eb
            .case()
            .when(
              eb.and([eb('play.down', '=', 2), eb('play.distance', '>=', 8)]),
            )
            .then('passing')
            .when(
              eb.and([
                eb('play.down', 'in', [3, 4]),
                eb('play.distance', '>=', 5),
              ]),
            )
            .then('passing')
            .else('standard')
            .end()
            .as('downType'),
        )
        .select((eb) =>
          eb
            .case()
            .when(eb('play.playTypeId', 'in', [20, 26, 34, 36, 37, 38, 39, 63]))
            .then(false)
            .when(eb('play.scoring', '=', true))
            .then(true)
            .when(
              eb.and([
                eb('play.down', '=', 1),
                eb(
                  sql<number>`(CAST(play.yards_gained AS NUMERIC) / play.distance)`,
                  '>=',
                  0.5,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('play.down', '=', 2),
                eb(
                  sql<number>`(CAST(play.yards_gained AS NUMERIC) / play.distance)`,
                  '>=',
                  0.7,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('play.down', 'in', [3, 4]),
                eb('play.yardsGained', '>=', eb.ref('play.distance')),
              ]),
            )
            .then(true)
            .else(false)
            .end()
            .as('success'),
        )
        .select((eb) =>
          eb
            .case()
            .when(eb('play.playTypeId', 'in', PASS_PLAY_TYPES))
            .then('Pass')
            .when(eb('play.playTypeId', 'in', RUSH_PLAY_TYPES))
            .then('Rush')
            .else('Other')
            .end()
            .as('playType'),
        )
        .select((eb) =>
          eb
            .case()
            .when(
              eb.and([
                eb('play.period', '=', 2),
                eb('play.scoring', '=', false),
                eb(
                  sql<number>`ABS(play.home_score - play.away_score)`,
                  '>',
                  38,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('play.period', '=', 3),
                eb('play.scoring', '=', false),
                eb(
                  sql<number>`ABS(play.home_score - play.away_score)`,
                  '>',
                  28,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('play.period', '=', 4),
                eb('play.scoring', '=', false),
                eb(
                  sql<number>`ABS(play.home_score - play.away_score)`,
                  '>',
                  22,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('play.period', '=', 2),
                eb('play.scoring', '=', true),
                eb(
                  sql<number>`ABS(play.home_score - play.away_score)`,
                  '>',
                  45,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('play.period', '=', 3),
                eb('play.scoring', '=', true),
                eb(
                  sql<number>`ABS(play.home_score - play.away_score)`,
                  '>',
                  35,
                ),
              ]),
            )
            .then(true)
            .when(
              eb.and([
                eb('play.period', '=', 4),
                eb('play.scoring', '=', true),
                eb(
                  sql<number>`ABS(play.home_score - play.away_score)`,
                  '>',
                  29,
                ),
              ]),
            )
            .then(true)
            .else(false)
            .end()
            .as('garbageTime'),
        );

      if (year) {
        withClause = withClause.where('game.season', '=', year);
      }

      if (team) {
        withClause = withClause.where(
          (eb) => eb.fn('LOWER', ['t.school']),
          '=',
          team.toLowerCase(),
        );
      }

      if (opponent) {
        withClause = withClause.where(
          (eb) => eb.fn('LOWER', ['t2.school']),
          '=',
          opponent.toLowerCase(),
        );
      }

      if (week) {
        withClause = withClause.where('game.week', '=', week);
      }

      if (seasonType && seasonType !== SeasonType.Both) {
        withClause = withClause.where('game.seasonType', '=', seasonType);
      }

      return withClause;
    })
    .selectFrom('plays')
    .groupBy(['id', 'season', 'week', 'school', 'opponent', 'oD'])
    .select([
      'id',
      'season as year',
      'week',
      'school as team',
      'opponent',
      'oD as unit',
    ])
    .select((eb) => eb.fn.count('ppa').as('plays'))
    .select((eb) => eb.fn.count('driveId').distinct().as('drives'))
    .select((eb) => eb.fn.avg('ppa').as('ppa'))
    .select((eb) => eb.fn.sum('ppa').as('totalPpa'))
    .select((eb) =>
      eb.fn
        .avg('ppa')
        .filterWhere('downType', '=', 'standard')
        .as('standardDownPpa'),
    )
    .select((eb) =>
      eb.fn
        .avg('ppa')
        .filterWhere('downType', '=', 'passing')
        .as('passingDownPpa'),
    )
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('playType', '=', 'Pass').as('passingPpa'),
    )
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('playType', '=', 'Rush').as('rushingPpa'),
    )
    .select((eb) =>
      eb.fn
        .sum('ppa')
        .filterWhere('playType', '=', 'Pass')
        .as('totalPassingPpa'),
    )
    .select((eb) =>
      eb.fn
        .sum('ppa')
        .filterWhere('playType', '=', 'Rush')
        .as('totalRushingPpa'),
    )
    .select(
      sql<number>`CAST((COUNT(*) FILTER(WHERE success = true)) AS NUMERIC) / COUNT(*)`.as(
        'successRate',
      ),
    )
    .select((eb) =>
      eb.fn.avg('ppa').filterWhere('success', '=', true).as('explosiveness'),
    )
    .select(
      sql<number>`CAST((COUNT(*) FILTER(WHERE success = true AND down_type = 'standard')) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE down_type = 'standard'), 0), 1)`.as(
        'standardDownSuccessRate',
      ),
    )
    .select((eb) =>
      eb.fn
        .avg('ppa')
        .filterWhere('success', '=', true)
        .filterWhere('downType', '=', 'standard')
        .as('standardDownExplosiveness'),
    )
    .select(
      sql<number>`CAST((COUNT(*) FILTER(WHERE success = true AND down_type = 'passing')) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE down_type = 'passing'), 0), 1)`.as(
        'passingDownSuccessRate',
      ),
    )
    .select((eb) =>
      eb.fn
        .avg('ppa')
        .filterWhere('success', '=', true)
        .filterWhere('downType', '=', 'passing')
        .as('passingDownExplosiveness'),
    )
    .select(
      sql<number>`CAST((COUNT(*) FILTER(WHERE success = true AND play_type = 'Rush')) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1)`.as(
        'rushSuccessRate',
      ),
    )
    .select((eb) =>
      eb.fn
        .avg('ppa')
        .filterWhere('success', '=', true)
        .filterWhere('playType', '=', 'Rush')
        .as('rushExplosiveness'),
    )
    .select(
      sql<number>`CAST((COUNT(*) FILTER(WHERE success = true AND play_type = 'Pass')) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Pass'), 0), 1)`.as(
        'passSuccessRate',
      ),
    )
    .select((eb) =>
      eb.fn
        .avg('ppa')
        .filterWhere('success', '=', true)
        .filterWhere('playType', '=', 'Pass')
        .as('passExplosiveness'),
    )
    .select(
      sql<number>`CAST(COUNT(*) FILTER(WHERE distance <= 2 AND play_type = 'Rush' AND success = true) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE distance <= 2 AND play_type = 'Rush'), 0), 1)`.as(
        'powerSuccess',
      ),
    )
    .select(
      sql<number>`CAST(COUNT(*) FILTER(WHERE play_type = 'Rush' AND yards_gained <= 0) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1)`.as(
        'stuffRate',
      ),
    )
    .select(
      sql<number>`COALESCE(CAST(SUM(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1), 0)`.as(
        'lineYards',
      ),
    )
    .select(
      sql<number>`ROUND(COALESCE(CAST(SUM(CASE WHEN yards_gained <= 0 THEN yards_gained * 1.2 WHEN yards_gained < 5 THEN yards_gained WHEN yards_gained < 11 THEN 4 + (yards_gained - 4) * .5 ELSE 7 END) FILTER (WHERE play_type = 'Rush') AS NUMERIC), 0), 0)`.as(
        'lineYardsSum',
      ),
    )
    .select(
      sql<number>`CAST(SUM(CASE WHEN yards_gained >= 10 THEN 5 ELSE (yards_gained - 5) END) FILTER(WHERE yards_gained >= 5 AND play_type = 'Rush') AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1)`.as(
        'secondLevelYards',
      ),
    )
    .select(
      sql<number>`CAST(SUM(CASE WHEN yards_gained >= 10 THEN 5 ELSE (yards_gained - 5) END) FILTER(WHERE yards_gained >= 5 AND play_type = 'Rush') AS NUMERIC)`.as(
        'secondLevelYardsSum',
      ),
    )
    .select(
      sql<number>`CAST(SUM(yards_gained - 10) FILTER(WHERE play_type = 'Rush' AND yards_gained >= 10) AS NUMERIC) / COALESCE(NULLIF(COUNT(*) FILTER(WHERE play_type = 'Rush'), 0), 1)`.as(
        'openFieldYards',
      ),
    )
    .select(
      sql<number>`CAST(SUM(yards_gained - 10) FILTER(WHERE play_type = 'Rush' AND yards_gained >= 10) AS NUMERIC)`.as(
        'openFieldYardsSum',
      ),
    );

  if (excludeGarbageTime) {
    query = query.where('garbageTime', '=', false);
  }

  const results = await query.execute();

  let stats: AdvancedGameStat[] = [];
  let ids = Array.from(new Set(results.map((r) => r.id)));

  for (let id of ids) {
    let teams = Array.from(
      new Set(results.filter((r) => r.id == id).map((r) => r.team)),
    );

    // @ts-ignore
    let gameStats: AdvancedGameStat[] = teams
      .map((t): AdvancedGameStat | null => {
        let offense = results.find(
          (r) => r.id == id && r.team == t && r.unit == 'offense',
        );
        let defense = results.find(
          (r) => r.id == id && r.team == t && r.unit == 'defense',
        );

        if (!offense || !defense) {
          return null;
        }

        return {
          gameId: id,
          season: offense.year,
          week: offense.week,
          team: t,
          opponent: offense.opponent,
          offense: {
            plays: Number(offense.plays),
            drives: Number(offense.drives),
            ppa: Number(offense.ppa),
            totalPPA: Number(offense.totalPpa),
            successRate: offense.successRate,
            explosiveness: Number(offense.explosiveness),
            powerSuccess: offense.powerSuccess,
            stuffRate: offense.stuffRate,
            lineYards: offense.lineYards,
            lineYardsTotal: offense.lineYardsSum,
            secondLevelYards: offense.secondLevelYards,
            secondLevelYardsTotal: offense.secondLevelYardsSum,
            openFieldYards: offense.openFieldYards,
            openFieldYardsTotal: offense.openFieldYardsSum,
            standardDowns: {
              ppa: Number(offense.standardDownPpa),
              successRate: Number(offense.standardDownSuccessRate),
              explosiveness: Number(offense.standardDownExplosiveness),
            },
            passingDowns: {
              ppa: Number(offense.passingDownPpa),
              successRate: Number(offense.passingDownSuccessRate),
              explosiveness: Number(offense.passingDownExplosiveness),
            },
            rushingPlays: {
              ppa: Number(offense.rushingPpa),
              totalPPA: Number(offense.totalRushingPpa),
              successRate: Number(offense.rushSuccessRate),
              explosiveness: Number(offense.rushExplosiveness),
            },
            passingPlays: {
              ppa: Number(offense.passingPpa),
              totalPPA: Number(offense.totalPassingPpa),
              successRate: Number(offense.passSuccessRate),
              explosiveness: Number(offense.passExplosiveness),
            },
          },
          defense: {
            plays: Number(defense.plays),
            drives: Number(defense.drives),
            ppa: Number(defense.ppa),
            totalPPA: Number(defense.totalPpa),
            successRate: Number(defense.successRate),
            explosiveness: Number(defense.explosiveness),
            powerSuccess: Number(defense.powerSuccess),
            stuffRate: Number(defense.stuffRate),
            lineYards: Number(defense.lineYards),
            lineYardsTotal: Number(defense.lineYardsSum),
            secondLevelYards: Number(defense.secondLevelYards),
            secondLevelYardsTotal: Number(defense.secondLevelYardsSum),
            openFieldYards: Number(defense.openFieldYards),
            openFieldYardsTotal: Number(defense.openFieldYardsSum),
            standardDowns: {
              ppa: Number(defense.standardDownPpa),
              successRate: Number(defense.standardDownSuccessRate),
              explosiveness: Number(defense.standardDownExplosiveness),
            },
            passingDowns: {
              ppa: Number(defense.passingDownPpa),
              successRate: Number(defense.passingDownSuccessRate),
              explosiveness: Number(defense.passingDownExplosiveness),
            },
            rushingPlays: {
              ppa: Number(defense.rushingPpa),
              totalPPA: Number(defense.totalRushingPpa),
              successRate: Number(defense.rushSuccessRate),
              explosiveness: Number(defense.rushExplosiveness),
            },
            passingPlays: {
              ppa: Number(defense.passingPpa),
              totalPPA: Number(defense.totalPassingPpa),
              successRate: Number(defense.passSuccessRate),
              explosiveness: Number(defense.passExplosiveness),
            },
          },
        };
      })
      .filter((r) => r != null);

    stats = [...stats, ...gameStats];
  }

  return stats;
};
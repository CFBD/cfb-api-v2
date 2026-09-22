// Read-only experiment; not imported by the API and does not change its payload.
import 'dotenv/config';
import { Pool } from 'pg';
import { CamelCasePlugin, Kysely, PostgresDialect, sql } from 'kysely';
import { DB } from '../src/config/types/db';
import { seasonOverviewQuery } from '../src/app/teams/seasonOverview';

// Frozen pre-ranking baseline used by the original cost report.
const historicalOverviewQuery = (db: Kysely<DB>, year: number, team: string) =>
  db
    .withoutPlugins()
    .withPlugin(new CamelCasePlugin({ maintainNestedObjectKeys: true }))
    .selectFrom('team as t')
    .leftJoin('teamSeasonSnapshot as snapshot', (join) =>
      join
        .onRef('snapshot.teamId', '=', 't.id')
        .on('snapshot.season', '=', year),
    )
    .leftJoin('coreRatings as core', (join) =>
      join
        .onRef('core.teamId', '=', 'snapshot.teamId')
        .onRef('core.year', '=', 'snapshot.season'),
    )
    .leftJoin('srs', (join) =>
      join
        .onRef('srs.teamId', '=', 'snapshot.teamId')
        .onRef('srs.year', '=', 'snapshot.season'),
    )
    .leftJoin('ratings as sp', (join) =>
      join
        .onRef('sp.teamId', '=', 'snapshot.teamId')
        .onRef('sp.year', '=', 'snapshot.season'),
    )
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('game as g')
          .innerJoin('gameTeam as gt', 'gt.gameId', 'g.id')
          .innerJoin('gameTeam as opponent', (join) =>
            join
              .onRef('opponent.gameId', '=', 'g.id')
              .onRef('opponent.id', '<>', 'gt.id'),
          )
          .whereRef('gt.teamId', '=', 'snapshot.teamId')
          .whereRef('g.season', '=', 'snapshot.season')
          .where('g.status', '=', 'completed')
          .select((eb) => [
            eb.fn.countAll().as('games'),
            eb.fn.countAll().filterWhere('gt.winner', '=', true).as('wins'),
            eb.fn
              .countAll()
              .filterWhere('opponent.winner', '=', true)
              .as('losses'),
            eb.fn
              .countAll()
              .filterWhere(
                eb.and([
                  eb('gt.winner', '<>', true),
                  eb('opponent.winner', '<>', true),
                ]),
              )
              .as('ties'),
          ])
          .as('record'),
      (join) => join.onTrue(),
    )
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('game as eg')
          .innerJoin('gameTeam as egt', 'egt.gameId', 'eg.id')
          .whereRef('egt.teamId', '=', 'snapshot.teamId')
          .whereRef('eg.season', '=', 'snapshot.season')
          .where('eg.status', '=', 'completed')
          .where('egt.endElo', 'is not', null)
          .orderBy('eg.startDate', 'desc')
          .orderBy('eg.id', 'desc')
          .select('egt.endElo')
          .limit(1)
          .as('elo'),
      (join) => join.onTrue(),
    )
    .where((eb) =>
      eb(eb.fn<string>('lower', ['t.school']), '=', team.toLowerCase()),
    )
    .select([
      't.id as teamId',
      't.school as team',
      'snapshot.teamId as snapshotTeamId',
      'snapshot.season',
      'snapshot.formatVersion',
      'snapshot.payload',
      'record.games',
      'record.wins',
      'record.losses',
      'record.ties',
      'core.overall as coreOverall',
      'core.offense as coreOffense',
      'core.defense as coreDefense',
      'core.teamId as coreTeamId',
      'srs.rating as srsRating',
      'elo.endElo as eloRating',
      'sp.teamId as spTeamId',
      'sp.rating as spOverall',
      'sp.oRating as spOffense',
      'sp.dRating as spDefense',
      'sp.stRating as spSpecialTeams',
    ])
    .limit(2);

const run = async () => {
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: process.env.DATABASE_HOST,
        database: process.env.DATABASE,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        port: Number(process.env.DATABASE_PORT ?? 5432),
        max: 1,
        connectionTimeoutMillis: 5000,
        options:
          '-c default_transaction_read_only=on -c statement_timeout=10000 ' +
          '-c lock_timeout=1000 -c application_name=season_rank_cost',
      }),
    }),
    plugins: [new CamelCasePlugin({ maintainNestedObjectKeys: true })],
  });
  try {
    const indexes = await db
      .withTables<{
        pgIndexes: {
          schemaname: string;
          tablename: string;
          indexname: string;
          indexdef: string;
        };
      }>()
      .withSchema('pg_catalog')
      .selectFrom('pgIndexes')
      .where('schemaname', '=', 'public')
      .where('tablename', 'in', [
        'core_ratings',
        'ratings',
        'srs',
        'game',
        'game_team',
        'conference_team',
        'team_season_snapshot',
      ])
      .select(['tablename', 'indexname', 'indexdef'])
      .execute();
    console.log(JSON.stringify({ indexes }));
    for (const scope of [
      { year: 2025, team: 'Michigan' },
      { year: 2026, team: 'Michigan' },
      { year: 2025, team: 'North Dakota State' },
    ]) {
      const { year, team } = scope;
      if (process.argv.includes('--current-only')) {
        const query = seasonOverviewQuery(db, year, team);
        console.log(
          JSON.stringify({
            scope,
            name: 'currentWithFpi',
            plan: await query.explain(
              'json',
              sql`analyze, buffers, timing off`,
            ),
          }),
        );
        const timingsMs: number[] = [];
        for (let i = 0; i < 6; i++) {
          const start = performance.now();
          const rows = await query.execute();
          if (rows.length !== 1 || rows[0].snapshotTeamId == null)
            throw new Error('Missing snapshot');
          if (i) timingsMs.push(performance.now() - start);
        }
        console.log(
          JSON.stringify({ scope, name: 'currentWithFpi', timingsMs }),
        );
        continue;
      }
      const ranked = db
        .with('cohort', (qb) =>
          qb
            .selectFrom('conferenceTeam as ct')
            .innerJoin('conference as c', 'c.id', 'ct.conferenceId')
            .where('ct.startYear', '<=', year)
            .where((eb) =>
              eb.or([
                eb('ct.endYear', 'is', null),
                eb('ct.endYear', '>=', year),
              ]),
            )
            .select(['ct.teamId', 'c.division'])
            .distinct(),
        )
        .with('coreRanks', (qb) =>
          qb
            .selectFrom('coreRatings as r')
            .innerJoin('cohort as c', 'c.teamId', 'r.teamId')
            .where('r.year', '=', year)
            .select('r.teamId')
            .select((eb) => [
              eb.fn
                .agg('rank')
                .over((w) =>
                  w.partitionBy('c.division').orderBy('r.overall', 'desc'),
                )
                .as('overall'),
              eb.fn
                .agg('rank')
                .over((w) =>
                  w.partitionBy('c.division').orderBy('r.offense', 'desc'),
                )
                .as('offense'),
              eb.fn
                .agg('rank')
                .over((w) =>
                  w.partitionBy('c.division').orderBy('r.defense', 'asc'),
                )
                .as('defense'),
            ]),
        )
        .with('srsRanks', (qb) =>
          qb
            .selectFrom('srs as r')
            .innerJoin('cohort as c', 'c.teamId', 'r.teamId')
            .where('r.year', '=', year)
            .select('r.teamId')
            .select((eb) =>
              eb.fn
                .agg('rank')
                .over((w) =>
                  w.partitionBy('c.division').orderBy('r.rating', 'desc'),
                )
                .as('overall'),
            ),
        )
        .with('spRanks', (qb) =>
          qb
            .selectFrom('ratings as r')
            .innerJoin('cohort as c', 'c.teamId', 'r.teamId')
            .where('r.year', '=', year)
            .select('r.teamId')
            .select((eb) => [
              eb.fn
                .agg('rank')
                .over((w) =>
                  w.partitionBy('c.division').orderBy('r.rating', 'desc'),
                )
                .as('overall'),
              eb.fn
                .agg('rank')
                .over((w) =>
                  w.partitionBy('c.division').orderBy('r.oRating', 'desc'),
                )
                .as('offense'),
              eb.fn
                .agg('rank')
                .over((w) =>
                  w.partitionBy('c.division').orderBy('r.dRating', 'asc'),
                )
                .as('defense'),
              eb
                .case()
                .when('r.stRating', 'is', null)
                .then(null)
                .else(
                  eb.fn
                    .agg('rank')
                    .over((w) =>
                      w
                        .partitionBy('c.division')
                        .orderBy('r.stRating', (ob) => ob.desc().nullsLast()),
                    ),
                )
                .end()
                .as('specialTeams'),
            ]),
        )
        .with('latestElo', (qb) =>
          qb
            .selectFrom('game as g')
            .innerJoin('gameTeam as gt', 'gt.gameId', 'g.id')
            .innerJoin('cohort as c', 'c.teamId', 'gt.teamId')
            .where('g.season', '=', year)
            .where('g.status', '=', 'completed')
            .where('gt.endElo', 'is not', null)
            .distinctOn('gt.teamId')
            .orderBy('gt.teamId')
            .orderBy('g.startDate', 'desc')
            .orderBy('g.id', 'desc')
            .select(['gt.teamId', 'gt.endElo', 'c.division']),
        )
        .with('eloRanks', (qb) =>
          qb
            .selectFrom('latestElo')
            .select('teamId')
            .select((eb) =>
              eb.fn
                .agg('rank')
                .over((w) =>
                  w.partitionBy('division').orderBy('endElo', 'desc'),
                )
                .as('overall'),
            ),
        );
      const baseline = historicalOverviewQuery(db, year, team);
      const annual = ranked
        .selectFrom(baseline.as('overview'))
        .leftJoin('coreRanks as cr', 'cr.teamId', 'overview.snapshotTeamId')
        .leftJoin('srsRanks as sr', 'sr.teamId', 'overview.snapshotTeamId')
        .leftJoin('spRanks as spr', 'spr.teamId', 'overview.snapshotTeamId')
        .selectAll('overview')
        .select([
          'cr.overall as coreRank',
          'cr.offense as coreOffenseRank',
          'cr.defense as coreDefenseRank',
          'sr.overall as srsRank',
          'spr.overall as spRank',
          'spr.offense as spOffenseRank',
          'spr.defense as spDefenseRank',
          'spr.specialTeams as spSpecialTeamsRank',
        ]);
      const all = annual
        .leftJoin('eloRanks as er', 'er.teamId', 'overview.snapshotTeamId')
        .select('er.overall as eloRank');
      const queries = [
        { name: 'baseline', query: baseline },
        { name: 'annualRanks', query: annual },
        { name: 'allRanks', query: all },
      ];
      for (const { name, query } of queries) {
        console.log(
          JSON.stringify({
            scope,
            name,
            plan: process.argv.includes('--analyze')
              ? await query.explain('json', sql`analyze, buffers, timing off`)
              : await query.explain('json'),
          }),
        );
      }
      if (process.argv.includes('--execute')) {
        const samples = new Map<string, number[]>();
        for (let round = 0; round < 6; round++) {
          // Rotate query order, discard the first pass as warmup.
          for (let offset = 0; offset < queries.length; offset++) {
            const { name, query } = queries[(offset + round) % queries.length];
            const start = performance.now();
            const rows = await query.execute();
            const elapsed = performance.now() - start;
            if (rows.length !== 1 || rows[0].snapshotTeamId == null)
              throw new Error(
                'Selected scope does not have exactly one snapshot',
              );
            if (round > 0)
              samples.set(name, [...(samples.get(name) ?? []), elapsed]);
          }
        }
        console.log(
          JSON.stringify({ scope, timingsMs: Object.fromEntries(samples) }),
        );
      }
    }
  } finally {
    await db.destroy();
  }
};
run().catch((error: unknown) => {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? error.code
      : 'CHECK_FAILED';
  console.error(
    'Read-only cost evaluation failed',
    typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)
      ? code
      : 'CHECK_FAILED',
  );
  process.exitCode = 1;
});

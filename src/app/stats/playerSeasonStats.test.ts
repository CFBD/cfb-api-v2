import {
  CamelCasePlugin,
  CompiledQuery,
  DatabaseConnection,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  QueryResult,
} from 'kysely';

import { DB } from '../../config/types/db';
import { replicaKdb } from '../../config/database';
import { SeasonType } from '../enums';
import { getPlayerSeasonStats } from './service';

jest.mock('../../config/database', () => ({
  db: {},
  replicaDb: {},
  kdb: {},
  replicaKdb: { selectFrom: jest.fn(), with: jest.fn() },
}));

const queries: CompiledQuery<unknown>[] = [];
let rows: unknown[] = [];
class FixtureDriver extends DummyDriver {
  async acquireConnection(): Promise<DatabaseConnection> {
    return {
      async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
        queries.push(query);
        // Test-only rows for the real query compiler; no PostgreSQL I/O.
        return { rows: rows as R[] };
      },
      async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
        yield { rows: [] };
      },
    };
  }
}
const compileDb = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new FixtureDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  plugins: [new CamelCasePlugin()],
});

beforeEach(() => {
  queries.length = 0;
  rows = [];
  (replicaKdb.selectFrom as jest.Mock).mockImplementation(
    compileDb.selectFrom.bind(compileDb),
  );
  (replicaKdb.with as jest.Mock).mockImplementation(
    compileDb.with.bind(compileDb),
  );
});

afterAll(() => compileDb.destroy());

const occurrences = (sql: string, text: string) => sql.split(text).length - 1;

describe('player season stats query', () => {
  test('reads the scoped game stats once and derives every stat from totals', async () => {
    await getPlayerSeasonStats(2025);

    expect(queries).toHaveLength(1);
    const { sql } = queries[0];
    expect(sql.startsWith('with "stat_totals" as materialized (')).toBe(true);
    expect(occurrences(sql, 'from "game"')).toBe(1);
    expect(occurrences(sql, 'inner join "game_player_stat"')).toBe(1);
    // Six result families, each read from the aggregated totals.
    expect(occurrences(sql, 'from "stat_totals"')).toBe(6);
    expect(occurrences(sql, ' union ')).toBe(5);
    // Raw values are only cast inside the filter their consumer applied.
    const totals = sql.slice(0, sql.indexOf(') select '));
    expect(occurrences(totals, ' as integer)')).toBe(
      occurrences(totals, ' as integer)) filter(where '),
    );
    expect(occurrences(totals, ' as numeric)')).toBe(
      occurrences(totals, ' as numeric)) filter(where '),
    );
  });

  test('applies every scope filter before aggregating', async () => {
    await getPlayerSeasonStats(
      2025,
      'SEC',
      'Georgia',
      2,
      9,
      SeasonType.Regular,
      'Passing',
      4870606,
    );

    const { sql, parameters } = queries[0];
    const totals = sql.slice(0, sql.indexOf(') select '));
    for (const predicate of [
      '"game"."season" = $',
      'lower("conference"."abbreviation") = $',
      'lower("team"."school") = $',
      '"game"."week" >= $',
      '"game"."week" <= $',
      '"game"."season_type" = $',
      'lower("player_stat_category"."name") = $',
      '"athlete"."id" = $',
      '"game_player_stat"."stat" <> $',
      '"game_player_stat"."stat" not like $',
    ])
      expect(totals).toContain(predicate);
    expect(parameters).toEqual(
      expect.arrayContaining([
        2025,
        'sec',
        'georgia',
        2,
        9,
        'regular',
        'passing',
        '4870606',
        '--',
        '--/--',
      ]),
    );
  });

  test('omits null, zero and non-numeric stats and stringifies the rest', async () => {
    const row = {
      season: 2025,
      playerId: '1',
      player: 'Player',
      position: 'QB',
      team: 'Georgia',
      conference: 'Southeastern Conference',
      category: 'passing',
    };
    rows = [
      { ...row, statType: 'YDS', stat: '250' },
      { ...row, statType: 'LONG', stat: 0 },
      { ...row, statType: 'PCT', stat: null },
      { ...row, statType: 'YPA', stat: '0' },
      { ...row, statType: 'QBR', stat: Number.NaN },
      { ...row, statType: 'TD', stat: 3 },
    ];

    await expect(getPlayerSeasonStats(2025)).resolves.toEqual([
      { ...row, statType: 'YDS', stat: '250' },
      { ...row, statType: 'YPA', stat: '0' },
      { ...row, statType: 'TD', stat: '3' },
    ]);
  });
});

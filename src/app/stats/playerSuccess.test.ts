import {
  CamelCasePlugin,
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import { DB } from '../../config/types/db';
import { kdb, replicaKdb } from '../../config/database';
import {
  getPlayerGameSuccessRates,
  getPlayerSeasonSuccessRates,
} from './service';

jest.mock('../../config/database', () => ({
  db: {},
  replicaDb: {},
  kdb: { with: jest.fn() },
  replicaKdb: { with: jest.fn() },
}));

const queries: CompiledQuery<unknown>[] = [];
const compileDb = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  plugins: [new CamelCasePlugin()],
  log: (event) => {
    if (event.level === 'query') queries.push(event.query);
  },
});

beforeEach(() => {
  queries.length = 0;
  for (const database of [kdb, replicaKdb])
    (database.with as jest.Mock).mockImplementation(
      compileDb.with.bind(compileDb),
    );
});

afterAll(() => compileDb.destroy());

// The athlete's credited plays bound the scan; without them the planner can
// read every play in history before probing play_stat for one player.
const prefilter = new RegExp(
  [
    String.raw`inner join \(select distinct "play_id" from "play_stat"`,
    String.raw` where "athlete_id" = \$(\d+) and "stat_type_id" in \(([^)]*)\)\)`,
    String.raw` as "player_plays" on "player_plays"\."play_id" = "p"\."id"`,
  ].join(''),
);

describe.each([
  {
    name: 'season',
    run: (playerId?: number) =>
      getPlayerSeasonSuccessRates(
        undefined,
        undefined,
        undefined,
        playerId ?? undefined,
      ),
    unscoped: () => getPlayerSeasonSuccessRates(2025),
  },
  {
    name: 'game',
    run: (playerId?: number) =>
      getPlayerGameSuccessRates(
        2025,
        undefined,
        undefined,
        undefined,
        undefined,
        playerId,
      ),
    unscoped: () => getPlayerGameSuccessRates(2025, 1),
  },
])('$name player success rates', ({ run, unscoped }) => {
  test('a player scope starts from that athlete’s credited plays', async () => {
    await run(4427238);

    expect(queries).toHaveLength(1);
    const { sql, parameters } = queries[0];
    const match = prefilter.exec(sql);
    expect(match).not.toBeNull();
    const [, athlete, types] = match as RegExpExecArray;
    expect(parameters[Number(athlete) - 1]).toBe('4427238');
    // The same stat types the credited-play filter accepts.
    const credited = /"ps"\."stat_type_id" in \(([^)]*)\)/.exec(sql);
    const values = (list: string) =>
      list
        .split(',')
        .map(
          (placeholder) => parameters[Number(placeholder.trim().slice(1)) - 1],
        );
    expect(values(types)).toEqual(values((credited as RegExpExecArray)[1]));
    // The original athlete predicate remains.
    expect(sql).toContain('"a"."id" = $');
  });

  test('other scopes are unchanged', async () => {
    await unscoped();

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).not.toContain('"player_plays"');
  });
});

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
import { calculatePayload } from './calculator';
import { snapshotQuery } from './snapshot';
import {
  getPlayerPassingForGame,
  getTeamPassingForGame,
} from '../passing/service';
import {
  getPlayerRushingForGame,
  getTeamRushingForGame,
} from '../rushing/service';
import { isSnapshotPayload } from './payload';
import modern from './fixtures/401752677.json';
import modernRows from './fixtures/401752677-rows.json';
import older from './fixtures/282430194.json';
import olderRows from './fixtures/282430194-rows.json';
import mixed from './fixtures/401754518.json';
import mixedRows from './fixtures/401754518-rows.json';
import overtime from './fixtures/401762432.json';
import overtimeRows from './fixtures/401762432-rows.json';

jest.mock('../../config/database', () => ({ kdb: {}, db: {}, authDb: {} }));

const database = async (results: unknown[][] = []) => {
  const driver = new DummyDriver();
  const connection = await driver.acquireConnection();
  const execute = jest.spyOn(connection, 'executeQuery');
  results.forEach((rows) => execute.mockResolvedValueOnce({ rows }));
  jest.spyOn(driver, 'acquireConnection').mockResolvedValue(connection);
  const queries: CompiledQuery[] = [];
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
    log: (event) => {
      if (event.level === 'query') queries.push(event.query);
    },
  });
  return { db, queries };
};
const sortRows = (rows: unknown[]) =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
it.each([
  [modern, modernRows],
  [older, olderRows],
  [mixed, mixedRows],
  [overtime, overtimeRows],
])(
  'preserves captured legacy wire values without enrichment rows',
  async (fixture, rows) => {
    const { db, queries } = await database([
      rows.teamQuery,
      rows.scoringQuery,
      rows.fieldPositionQuery,
      rows.playerQuery,
    ]);
    const result = await calculatePayload(db, fixture.game.id);
    for (const [key, value] of Object.entries(fixture.legacy.teams)) {
      expect(sortRows(Reflect.get(result.teams, key))).toEqual(sortRows(value));
    }
    expect(result.players.usage).toEqual(
      [...fixture.legacy.players.usage].sort(
        (a, b) =>
          a.team.localeCompare(b.team) || a.player.localeCompare(b.player),
      ),
    );
    expect(result.teams.passing).toEqual([]);
    expect(result.players.rushing).toEqual([]);
    expect(isSnapshotPayload(result)).toBe(true);
    expect(queries).toHaveLength(8);
    expect(
      queries.every((query) => query.parameters.includes(fixture.game.id)),
    ).toBe(true);
    await db.destroy();
  },
);
it('scopes enriched queries directly to a game without a division or garbage filter', async () => {
  const { db, queries } = await database();
  for (const calculate of [
    getPlayerPassingForGame,
    getTeamPassingForGame,
    getPlayerRushingForGame,
    getTeamRushingForGame,
  ])
    await calculate(db, 1234);
  expect(queries).toHaveLength(4);
  for (const query of queries) {
    expect(query.sql).toContain('"game"."id" =');
    expect(query.parameters).toContain(1234);
    expect(query.sql).not.toContain('"division" =');
    expect(query.sql).not.toContain('garbage');
  }
  await db.destroy();
});
it('snapshot lookup uses one bounded query and preserves JSON keys', async () => {
  const payload = {
    teams: { passing: [{ locations: { 'short left': { totalPpa: -1 } } }] },
    players: {},
  };
  const { db, queries } = await database([[{ payload, format_version: 1 }]]);
  const rows = await snapshotQuery(db, 1).execute();
  expect(rows[0].payload).toEqual(payload);
  expect(queries).toHaveLength(1);
  expect(queries[0].sql).toContain('left join "advanced_box_score_snapshot"');
  expect(queries[0].sql).not.toContain('limit');
  expect(queries[0].sql).not.toContain('"play"');
  await db.destroy();
});

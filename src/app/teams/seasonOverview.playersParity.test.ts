import {
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { DB } from '../../config/types/db';
import { kdb } from '../../config/database';
import { getPlayerUsage } from '../players/service';
import { getPredictedPointsAddedByPlayerSeason } from '../metrics/service';
import fixture from './fixtures/team-season-snapshots/player-mapping.json';

jest.mock('../../config/database', () => ({ kdb: { selectFrom: jest.fn() } }));
it('locks legacy player season mapper outputs including null names, zero denominators and negative rounding', async () => {
  const driver = new DummyDriver();
  const connection = await driver.acquireConnection();
  const original = connection.executeQuery.bind(connection);
  connection.executeQuery = async <R>(query: CompiledQuery) =>
    Object.assign(await original<R>(query), { rows: fixture.rows });
  driver.acquireConnection = async () => connection;
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  jest.mocked(kdb.selectFrom).mockImplementation(db.selectFrom.bind(db));
  const ppa = await getPredictedPointsAddedByPlayerSeason(
    2025,
    undefined,
    'Michigan',
  );
  const usage = await getPlayerUsage(2025, undefined, undefined, 'Michigan');
  const order = <T extends { id: string }>(rows: T[]) =>
    rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  expect(JSON.parse(JSON.stringify(order(ppa)))).toEqual(fixture.ppa);
  expect(JSON.parse(JSON.stringify(order(usage)))).toEqual(fixture.usage);
  await db.destroy();
});

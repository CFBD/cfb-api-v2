import { getAdvancedStats } from '../stats/service';
import { replicaDb, replicaKdb } from '../../config/database';
import fixture from './fixtures/team-season-snapshots/advanced-mapping.json';
jest.mock('../../config/database', () => ({
  replicaDb: { any: jest.fn(), task: jest.fn() },
  replicaKdb: { selectFrom: jest.fn() },
}));
it('locks the existing advanced mapper wire baseline without changing its formulas', async () => {
  jest
    .mocked(replicaDb.any)
    .mockResolvedValueOnce(fixture.plays)
    .mockResolvedValueOnce(fixture.opportunities)
    .mockResolvedValueOnce(fixture.fieldPosition);
  const query = {
    groupBy: jest.fn(),
    select: jest.fn(),
    where: jest.fn(),
    execute: jest.fn().mockResolvedValue(fixture.havoc),
  };
  query.groupBy.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.where.mockReturnValue(query);
  jest.mocked(replicaKdb.selectFrom).mockReturnValue(query as never);
  jest
    .mocked(replicaDb.task)
    .mockImplementation((async (
      work: (task: { batch: typeof Promise.all }) => unknown,
    ) => work({ batch: Promise.all.bind(Promise) })) as never);
  const result = await getAdvancedStats(2025, 'Michigan');
  // JSON is the established legacy wire representation for non-finite ratios.
  expect(JSON.parse(JSON.stringify(result))).toEqual([fixture.expected]);
});

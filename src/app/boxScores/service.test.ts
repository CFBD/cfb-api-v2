import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { DB } from '../../config/types/db';
import { kdb } from '../../config/database';
import { calculatePayload } from './calculator';
import {
  canonicalQuery,
  mapGameInfo,
  snapshotQuery,
  isSnapshotStorageError,
} from './snapshot';
import { getAdvancedBoxScore } from './service';
import { isSnapshotPayload } from './payload';
import captured from './fixtures/401752677-payload.json';
const payload = (() => {
  if (!isSnapshotPayload(captured)) throw new Error('Invalid fixture');
  return captured;
})();

jest.mock('../../config/database', () => ({ kdb: { transaction: jest.fn() } }));
jest.mock('./calculator', () => ({ calculatePayload: jest.fn() }));
jest.mock('./snapshot', () => ({
  ...jest.requireActual('./snapshot'),
  snapshotQuery: jest.fn(),
  canonicalQuery: jest.fn(),
}));
const metadata = {
  homeTeam: 'Ohio State',
  awayTeam: 'Texas',
  homePoints: 14,
  awayPoints: 7,
  homeWinProb: '0.6',
  awayWinProb: '0.3',
  homeWinner: true,
  excitement: null,
};
const compileDb = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});
const actual = jest.requireActual<typeof import('./snapshot')>('./snapshot');
const snapshotExecute = jest.fn();
const canonicalExecute = jest.fn();
const transaction = {
  setIsolationLevel: jest.fn(),
  setAccessMode: jest.fn(),
  execute: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(snapshotQuery).mockReturnValue(
    Object.assign(actual.snapshotQuery(compileDb, 1), {
      execute: snapshotExecute,
    }),
  );
  jest.mocked(canonicalQuery).mockReturnValue(
    Object.assign(actual.canonicalQuery(compileDb, 1), {
      execute: canonicalExecute,
    }),
  );
  canonicalExecute.mockResolvedValue([metadata]);
  jest.mocked(calculatePayload).mockResolvedValue(payload);
  (kdb.transaction as jest.Mock).mockReturnValue(transaction);
  transaction.setIsolationLevel.mockReturnValue(transaction);
  transaction.setAccessMode.mockReturnValue(transaction);
  transaction.execute.mockImplementation((work) => work(kdb));
});
it('serves a valid payload without calculating, ignoring age and reading canonical metadata', async () => {
  snapshotExecute.mockResolvedValue([
    { ...metadata, formatVersion: 1, payload, generatedAt: new Date(0) },
  ]);
  const result = await getAdvancedBoxScore(401752677);
  expect(result.teams).toEqual(payload.teams);
  expect(result.gameInfo).toMatchObject({
    homeWinProb: 0.6,
    awayWinProb: 0.3,
    excitement: 0,
  });
  expect(snapshotExecute).toHaveBeenCalledTimes(1);
  expect(calculatePayload).not.toHaveBeenCalled();
  expect(kdb.transaction).not.toHaveBeenCalled();
});
it.each([
  [null, null],
  [2, payload],
  [1, { teams: [], players: {} }],
])(
  'calculates for missing, unsupported or malformed storage',
  async (formatVersion, value) => {
    snapshotExecute.mockResolvedValue([
      { ...metadata, formatVersion, payload: value },
    ]);
    expect((await getAdvancedBoxScore(1)).teams).toEqual(payload.teams);
    expect(transaction.setIsolationLevel).toHaveBeenCalledWith(
      'repeatable read',
    );
    expect(transaction.setAccessMode).toHaveBeenCalledWith('read only');
    expect(canonicalExecute).toHaveBeenCalledTimes(1);
    expect(calculatePayload).toHaveBeenCalledTimes(1);
  },
);
it('falls back only for the snapshot relation failure', async () => {
  const missing = Object.assign(
    new Error('relation "advanced_box_score_snapshot" does not exist'),
    { code: '42P01' },
  );
  snapshotExecute.mockRejectedValue(missing);
  await getAdvancedBoxScore(1);
  expect(calculatePayload).toHaveBeenCalledTimes(1);
  expect(
    isSnapshotStorageError(
      Object.assign(new Error('relation "game" does not exist'), {
        code: '42P01',
      }),
    ),
  ).toBe(false);
});
it('propagates general database errors and ambiguous participants', async () => {
  snapshotExecute.mockRejectedValue(new Error('connection lost'));
  await expect(getAdvancedBoxScore(1)).rejects.toThrow('connection lost');
  expect(calculatePayload).not.toHaveBeenCalled();
  expect(() => mapGameInfo([])).toThrow();
  expect(() => mapGameInfo([metadata, metadata])).toThrow();
});
it('validates all nested buckets and primitive fields, allowing harmless additions', () => {
  expect(isSnapshotPayload(payload)).toBe(true);
  expect(isSnapshotPayload({ ...payload, future: 1 })).toBe(true);
  expect(isSnapshotPayload(JSON.stringify(payload))).toBe(false);
  const bad = structuredClone(payload);
  Object.assign(bad.teams.passing[0].offense.locations, { 'short left': {} });
  expect(isSnapshotPayload(bad)).toBe(false);
  const wrong = structuredClone(payload);
  Object.assign(wrong.players.usage[0], { total: '0.4' });
  expect(isSnapshotPayload(wrong)).toBe(false);
});

// Keep the real driver types/conversions for query builders, but prohibit
// all PostgreSQL I/O before test modules (and their services) are imported.
// A module mock factory reapplies the guard after jest.resetModules(). Direct
// assignments survive jest.restoreAllMocks() and jest.clearAllMocks().
jest.mock('pg', () => {
  const pg = jest.requireActual<typeof import('pg')>('pg');
  const blocked = (): never => {
    throw new Error(
      'Database access is disabled in Jest. Mock src/config/database or use a Kysely DummyDriver.',
    );
  };

  pg.Client.prototype.connect = blocked;
  pg.Client.prototype.query = blocked;
  pg.Pool.prototype.connect = blocked;
  pg.Pool.prototype.query = blocked;
  Object.defineProperty(pg, 'native', {
    configurable: true,
    get: blocked,
  });

  return pg;
});

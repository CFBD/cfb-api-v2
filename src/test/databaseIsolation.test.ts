import { Socket } from 'node:net';
import { Kysely, PostgresDialect } from 'kysely';
import { Client, Pool } from 'pg';
import pgPromise from 'pg-promise';

const blockedMessage = 'Database access is disabled in Jest';

describe('database isolation', () => {
  test.each([
    ['client connect', () => new Client().connect()],
    ['client query', () => new Client().query('SELECT 1')],
    ['pool connect', () => new Pool().connect()],
    ['pool query', () => new Pool().query('SELECT 1')],
  ])('blocks %s before opening a socket', (_name, attempt) => {
    const connect = jest.spyOn(Socket.prototype, 'connect');
    try {
      expect(attempt).toThrow(blockedMessage);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
    }
  });

  test('rejects Kysely execution through the PostgreSQL dialect', async () => {
    const database = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({ pool: new Pool() }),
    });
    try {
      await expect(
        database.selectNoFrom((eb) => eb.val(1).as('value')).execute(),
      ).rejects.toThrow(blockedMessage);
    } finally {
      await database.destroy();
    }
  });

  test('rejects pg-promise execution', async () => {
    const pgp = pgPromise();
    const database = pgp({ host: 'unused.invalid', database: 'test' });
    try {
      await expect(database.any('SELECT 1')).rejects.toThrow(blockedMessage);
    } finally {
      pgp.end();
    }
  });

  test('cannot enable native PostgreSQL access', () => {
    expect(() => jest.requireActual('pg').native).toThrow(blockedMessage);
  });

  test('keeps guards after mock restoration and module resets', async () => {
    jest.restoreAllMocks();
    expect(() => new Pool().connect()).toThrow(blockedMessage);
    jest.resetModules();
    const reloaded = await import('pg');
    expect(() => new reloaded.Client().connect()).toThrow(blockedMessage);
    expect(() => new reloaded.Pool().query('SELECT 1')).toThrow(blockedMessage);
  });
});

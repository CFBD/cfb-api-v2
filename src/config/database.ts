import { databasePoolMax } from './workers';
import { Promise } from 'bluebird';
import pgp from 'pg-promise';
import { Pool } from 'pg';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';

import {
  DatabaseConnectionConfig,
  getDatabaseConnectionConfigs,
} from './databaseConfig';
import { DB } from './types/db';

const { primary, replica } = getDatabaseConnectionConfigs();

const authDbHost = process.env.AUTH_DATABASE_HOST;
const authDbUser = process.env.AUTH_DATABASE_USER;
const authDbPassword = process.env.AUTH_DATABASE_PASSWORD;
const authDbName = process.env.AUTH_DATABASE;

const getConnectionString = (config: DatabaseConnectionConfig): string =>
  `postgres://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;

const authConnectionString = `postgres://${authDbUser}:${authDbPassword}@${authDbHost}:${primary.port}/${authDbName}`;
const createPgPromiseDatabase = pgp({ promiseLib: Promise });
const poolMax = databasePoolMax();

export const db = createPgPromiseDatabase({
  connectionString: getConnectionString(primary),
  max: poolMax,
});
export const replicaDb =
  replica === primary
    ? db
    : createPgPromiseDatabase({
        connectionString: getConnectionString(replica),
        max: poolMax,
      });
export const authDb = createPgPromiseDatabase({
  connectionString: authConnectionString,
  max: poolMax,
});

const createKyselyDatabase = (config: DatabaseConnectionConfig): Kysely<DB> =>
  new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        database: config.database,
        host: config.host,
        port: Number.parseInt(config.port, 10),
        user: config.user,
        password: config.password,
        max: poolMax,
      }),
    }),
    plugins: [new CamelCasePlugin()],
  });

export const kdb = createKyselyDatabase(primary);
export const replicaKdb =
  replica === primary ? kdb : createKyselyDatabase(replica);

export const closeDatabaseConnections = async (): Promise<void> => {
  await globalThis.Promise.all([
    kdb.destroy(),
    ...(replicaKdb === kdb ? [] : [replicaKdb.destroy()]),
    ...Array.from(new Set([db, replicaDb, authDb]), (database) =>
      database.$pool.end(),
    ),
  ]);
};

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

export const db = createPgPromiseDatabase(getConnectionString(primary));
export const replicaDb =
  replica === primary
    ? db
    : createPgPromiseDatabase(getConnectionString(replica));
export const authDb = createPgPromiseDatabase(authConnectionString);

const createKyselyDatabase = (config: DatabaseConnectionConfig): Kysely<DB> =>
  new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        database: config.database,
        host: config.host,
        port: Number.parseInt(config.port, 10),
        user: config.user,
        password: config.password,
        max: 10,
      }),
    }),
    plugins: [new CamelCasePlugin()],
  });

export const kdb = createKyselyDatabase(primary);
export const replicaKdb =
  replica === primary ? kdb : createKyselyDatabase(replica);

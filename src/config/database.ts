import { Promise } from 'bluebird';
import pgp from 'pg-promise';
import { Pool } from 'pg';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';

const user = process.env.DATABASE_USER;
const password = process.env.DATABASE_PASSWORD;
const host = process.env.DATABASE_HOST;
const port = process.env.DATABASE_PORT || '5432';
const dbName = process.env.DATABASE;

const authDbHost = process.env.AUTH_DATABASE_HOST;
const authDbUser = process.env.AUTH_DATABASE_USER;
const authDbPassword = process.env.AUTH_DATABASE_PASSWORD;
const authDbName = process.env.AUTH_DATABASE;

const connectionString = `postgres://${user}:${password}@${host}:${port}/${dbName}`;
const authConnectionString = `postgres://${authDbUser}:${authDbPassword}@${authDbHost}:${port}/${authDbName}`;

export const db = pgp({ promiseLib: Promise })(connectionString);
export const authDb = pgp({ promiseLib: Promise })(authConnectionString);

import { DB } from './types/db';

const dialect = new PostgresDialect({
  pool: new Pool({
    database: dbName,
    host,
    port: parseInt(port),
    user,
    password,
    max: 10,
  }),
});

export const kdb = new Kysely<DB>({
  dialect,
  plugins: [new CamelCasePlugin()],
});

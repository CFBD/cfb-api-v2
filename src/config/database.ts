import { Promise } from 'bluebird';
import pgp from 'pg-promise';

const user = process.env.DATABASE_USER;
const password = process.env.DATABASE_PASSWORD;
const host = process.env.DATABASE_HOST;
const port = process.env.DATABASE_PORT;
const dbName = process.env.DATABASE;

const authDbHost = process.env.AUTH_DATABASE_HOST;
const authDbUser = process.env.AUTH_DATABASE_USER;
const authDbPassword = process.env.AUTH_DATABASE_PASSWORD;
const authDbName = process.env.AUTH_DATABASE;

const connectionString = `postgres://${user}:${password}@${host}:${port}/${dbName}`;
const authConnectionString = `postgres://${authDbUser}:${authDbPassword}@${authDbHost}:${port}/${authDbName}`;

export const db = pgp({ promiseLib: Promise })(connectionString);
export const authDb = pgp({ promiseLib: Promise })(authConnectionString);

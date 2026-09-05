import 'dotenv/config';
import 'reflect-metadata';

import express, { Application } from 'express';

import { configureServer } from './config/express';
import { closeDatabaseConnections } from './config/database';
import { closeRedisConnection } from './config/redis';
import { installGracefulShutdown } from './config/serverLifecycle';

(async () => {
  const port = process.env.PORT;
  const app: Application = express();

  const configured = await configureServer(app);
  const server = configured.listen(port, () =>
    console.log(`API worker ${process.pid} listening on port ${port}.`),
  );
  installGracefulShutdown(server, async () => {
    await Promise.all([closeDatabaseConnections(), closeRedisConnection()]);
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

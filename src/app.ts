import 'dotenv/config';
import 'reflect-metadata';

import express, { Application } from 'express';

import { configureServer } from './config/express';

(async () => {
  const port = process.env.PORT;
  const app: Application = express();

  const server = await configureServer(app);

  server.listen(port, () => console.log(`Server running on port ${port}...`));
})().catch((err) => {
  console.error(err);
});

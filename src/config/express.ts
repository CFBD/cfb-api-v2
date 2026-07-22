import { Application } from 'express';
import swaggerUi from 'swagger-ui-express';

import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import middlewares from './middleware';
import * as Sentry from '@sentry/node';

import { RegisterRoutes } from '../../build/routes';
import spec from '../../build/swagger.json';
import errorHandler from './errors';
import { updateQuotas } from './middleware/quotas';

export const configureServer = async (
  app: Application,
): Promise<Application> => {
  app.enable('trust proxy');

  app.use(Sentry.Handlers.requestHandler());

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.use(cookieParser());
  app.use(bodyParser.json());
  app.use(
    bodyParser.urlencoded({
      extended: true,
    }),
  );

  app.use(Sentry.Handlers.errorHandler());

  app.use(middlewares.cors);
  app.use(updateQuotas);

  RegisterRoutes(app);

  app.use(errorHandler);

  app.get('/api-docs.json', cors(), (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(spec);
  });

  app.use('/', swaggerUi.serveFiles(spec), swaggerUi.setup(spec));

  return app;
};

import { Application, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';

import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';

import { RegisterRoutes } from '../../build/routes';
import errorHandler from './errors';

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

  RegisterRoutes(app);

  app.use(errorHandler);

  app.use('/', swaggerUi.serve, async (_req: Request, res: Response) => {
    return res.send(
      swaggerUi.generateHTML(await import('../../build/swagger.json')),
    );
  });

  return app;
};

import { Application, NextFunction, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';

import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';

import { RegisterRoutes } from '../../build/routes';
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

  app.use(updateQuotas);

  RegisterRoutes(app);

  app.use(errorHandler);

  const spec = await import('../../build/swagger.json');

  // @ts-ignore
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(spec);
  });

  app.use(
    '/',
    // @ts-ignore
    function (req: Request, res: Response, next: NextFunction) {
      // @ts-ignore
      spec.host = req.get('host');
      // @ts-ignore
      req.swaggerDoc = spec;
      next();
    },
    swaggerUi.serveFiles(spec),
    swaggerUi.setup(),
  );

  return app;
};

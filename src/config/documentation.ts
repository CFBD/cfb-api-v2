import express, { Application, NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

const moduleRoot = path.resolve(__dirname, '../..');
const repositoryRoot =
  path.basename(moduleRoot) === 'build' ? path.dirname(moduleRoot) : moduleRoot;
const defaultDistPath = path.join(repositoryRoot, 'docs-site/dist');

const documentationRoutes = [
  '/',
  '/getting-started',
  '/authentication',
  '/usage-and-access',
  '/libraries/python',
  '/libraries/typescript',
  '/api',
  '/api/*',
];

export const registerDocumentation = (
  app: Application,
  distPath: string = defaultDistPath,
): void => {
  const indexPath = path.join(distPath, 'index.html');

  if (!existsSync(distPath) || !existsSync(indexPath)) {
    console.error(
      `Documentation build not found at ${distPath}. Run pnpm docs:build before starting the server.`,
    );
    return;
  }

  app.use('/docs', (req: Request, res: Response) => {
    const suffix = req.originalUrl.slice('/docs'.length);
    const destination = `/${suffix.replace(/^\/+/, '')}`;

    res.redirect(308, destination);
  });

  app.use('/', express.static(distPath, { extensions: ['html'] }));
  app.get(
    documentationRoutes,
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.accepts('html')) {
        next();
        return;
      }

      res.sendFile(indexPath);
    },
  );
};

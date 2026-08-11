import express, { Application, NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

const moduleRoot = path.resolve(__dirname, '../..');
const repositoryRoot =
  path.basename(moduleRoot) === 'build' ? path.dirname(moduleRoot) : moduleRoot;
const defaultDistPath = path.join(repositoryRoot, 'docs-site/dist');

const documentationRoutes = [
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

  app.get('/', (req: Request, res: Response) => {
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);

    res.redirect(308, `/getting-started${query}`);
  });

  app.get(/\.html$/, (req: Request, res: Response) => {
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);

    res.redirect(308, `${req.path.slice(0, -'.html'.length)}${query}`);
  });

  app.get(/\/$/, (req: Request, res: Response, next: NextFunction) => {
    const cleanPath = req.path.slice(0, -1);
    const htmlPath = path.join(distPath, `${cleanPath}.html`);

    if (!existsSync(htmlPath)) {
      next();
      return;
    }

    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);

    res.redirect(308, `${cleanPath}${query}`);
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.endsWith('.md') ||
      req.path === '/llms.txt' ||
      /^\/(400|404|500)$/.test(req.path)
    ) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    next();
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

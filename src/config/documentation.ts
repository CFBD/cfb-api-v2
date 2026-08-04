import express, { Application, NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

const moduleRoot = path.resolve(__dirname, '../..');
const repositoryRoot =
  path.basename(moduleRoot) === 'build' ? path.dirname(moduleRoot) : moduleRoot;
const defaultDistPath = path.join(repositoryRoot, 'docs-site/dist/docs');

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

  app.use('/docs', express.static(distPath, { extensions: ['html'] }));
  app.get(
    ['/docs', '/docs/*'],
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.accepts('html') || path.extname(req.path)) {
        next();
        return;
      }

      res.sendFile(indexPath);
    },
  );
};

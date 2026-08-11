import express, { Application } from 'express';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

import { registerDocumentation } from './documentation';

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const withServer = async (
  app: Application,
  callback: (baseUrl: string) => Promise<void>,
): Promise<void> => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address() as AddressInfo;
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
};

describe('documentation GA routes', () => {
  let fixturePath: string;

  beforeEach(() => {
    fixturePath = mkdtempSync(path.join(tmpdir(), 'cfbd-docs-'));
    mkdirSync(path.join(fixturePath, 'assets'));
    writeFileSync(
      path.join(fixturePath, 'index.html'),
      '<!doctype html><title>Documentation index</title>',
    );
    writeFileSync(
      path.join(fixturePath, 'getting-started.html'),
      '<!doctype html><title>Documentation index</title>',
    );
    writeFileSync(
      path.join(fixturePath, 'getting-started.md'),
      '# Getting started',
    );
    writeFileSync(
      path.join(fixturePath, '404.html'),
      '<!doctype html><title>Page not found</title>',
    );
    writeFileSync(
      path.join(fixturePath, 'assets/site.css'),
      'body { color: navy; }',
    );
  });

  afterEach(() => {
    rmSync(fixturePath, { force: true, recursive: true });
  });

  test('serves allowlisted routes and static files', async () => {
    const app = express();
    registerDocumentation(app, fixturePath);

    const documentationRoutes = [
      '/getting-started',
      '/authentication',
      '/usage-and-access',
      '/libraries/python',
      '/libraries/typescript',
      '/api',
      '/api/games',
    ];

    await withServer(app, async (baseUrl) => {
      for (const route of documentationRoutes) {
        const response = await fetch(`${baseUrl}${route}`, {
          headers: { Accept: 'text/html' },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/html');
        expect(await response.text()).toContain('Documentation index');
      }

      const assetResponse = await fetch(`${baseUrl}/assets/site.css`);
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get('content-type')).toContain('text/css');
      expect(await assetResponse.text()).toContain('color: navy');
    });
  });

  test('permanently redirects root and duplicate page URLs', async () => {
    const app = express();
    registerDocumentation(app, fixturePath);

    await withServer(app, async (baseUrl) => {
      const redirects = [
        ['/?source=home', '/getting-started?source=home'],
        ['/getting-started.html?source=html', '/getting-started?source=html'],
        ['/getting-started/?source=slash', '/getting-started?source=slash'],
      ];

      for (const [source, destination] of redirects) {
        const response = await fetch(`${baseUrl}${source}`, {
          redirect: 'manual',
        });

        expect(response.status).toBe(308);
        expect(response.headers.get('location')).toBe(destination);
      }
    });
  });

  test('prevents alternate and error documents from being indexed', async () => {
    const app = express();
    registerDocumentation(app, fixturePath);

    await withServer(app, async (baseUrl) => {
      for (const route of ['/getting-started.md', '/404']) {
        const response = await fetch(`${baseUrl}${route}`);

        expect(response.status).toBe(200);
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      }
    });
  });

  test('serves the index for an allowlisted HTML HEAD request', async () => {
    const app = express();
    registerDocumentation(app, fixturePath);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/games`, {
        headers: { Accept: 'text/html' },
        method: 'HEAD',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });
  });

  test('redirects preview paths with path and query intact', async () => {
    const app = express();
    registerDocumentation(app, fixturePath);

    await withServer(app, async (baseUrl) => {
      const rootResponse = await fetch(`${baseUrl}/docs?source=preview`, {
        redirect: 'manual',
      });
      expect(rootResponse.status).toBe(308);
      expect(rootResponse.headers.get('location')).toBe('/?source=preview');

      const deepLinkResponse = await fetch(
        `${baseUrl}/docs/libraries/python?tab=install`,
        { redirect: 'manual' },
      );
      expect(deepLinkResponse.status).toBe(308);
      expect(deepLinkResponse.headers.get('location')).toBe(
        '/libraries/python?tab=install',
      );
    });
  });

  test('does not rewrite unknown routes or missing assets as HTML', async () => {
    const app = express();
    registerDocumentation(app, fixturePath);
    app.use((_req, res) => {
      res.status(418).json({ handledBy: 'fallthrough' });
    });

    await withServer(app, async (baseUrl) => {
      for (const route of ['/games-typo', '/assets/missing.js']) {
        const response = await fetch(`${baseUrl}${route}`, {
          headers: { Accept: 'text/html' },
        });
        expect(response.status).toBe(418);
        expect(await response.json()).toEqual({
          handledBy: 'fallthrough',
        });
      }

      const nonHtmlDocsResponse = await fetch(`${baseUrl}/api/games`, {
        headers: { Accept: 'application/json' },
      });
      expect(nonHtmlDocsResponse.status).toBe(418);
      expect(await nonHtmlDocsResponse.json()).toEqual({
        handledBy: 'fallthrough',
      });
    });
  });

  test('logs once and leaves the app usable when the dist is missing', async () => {
    const app = express();
    const missingPath = path.join(fixturePath, 'missing');
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() => registerDocumentation(app, missingPath)).not.toThrow();
    app.get('/health', (_req, res) => {
      res.json({ healthy: true });
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ healthy: true });
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Run pnpm docs:build'),
    );
    consoleSpy.mockRestore();
  });

  test('preserves Swagger, OpenAPI, and registered REST routes', async () => {
    const app = express();
    app.get('/api-docs.json', (_req, res) => {
      res.json({ openapi: '3.0.0' });
    });
    app.get('/games', (_req, res) => {
      res.json([{ id: 1 }]);
    });
    app.use('/swagger', (_req, res) => {
      res.type('html').send('<title>Swagger UI</title>');
    });
    registerDocumentation(app, fixturePath);

    await withServer(app, async (baseUrl) => {
      const specResponse = await fetch(`${baseUrl}/api-docs.json`);
      expect(specResponse.headers.get('content-type')).toContain(
        'application/json',
      );
      expect(await specResponse.json()).toEqual({ openapi: '3.0.0' });

      const gamesResponse = await fetch(`${baseUrl}/games`);
      expect(await gamesResponse.json()).toEqual([{ id: 1 }]);

      const swaggerResponse = await fetch(`${baseUrl}/swagger`);
      expect(await swaggerResponse.text()).toContain('Swagger UI');
    });
  });
});

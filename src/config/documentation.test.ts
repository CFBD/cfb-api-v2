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

describe('documentation preview routes', () => {
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
      '<!doctype html><title>Getting started</title>',
    );
    writeFileSync(
      path.join(fixturePath, 'assets/site.css'),
      'body { color: navy; }',
    );
  });

  afterEach(() => {
    rmSync(fixturePath, { force: true, recursive: true });
  });

  test('serves the docs index, an authored deep link, and a static file', async () => {
    const app = express();
    registerDocumentation(app, fixturePath);

    await withServer(app, async (baseUrl) => {
      const indexResponse = await fetch(`${baseUrl}/docs`);
      expect(indexResponse.status).toBe(200);
      expect(indexResponse.headers.get('content-type')).toContain('text/html');
      expect(await indexResponse.text()).toContain('Documentation index');

      const deepLinkResponse = await fetch(`${baseUrl}/docs/getting-started`);
      expect(deepLinkResponse.status).toBe(200);
      expect(await deepLinkResponse.text()).toContain('Getting started');

      const assetResponse = await fetch(`${baseUrl}/docs/assets/site.css`);
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get('content-type')).toContain('text/css');
      expect(await assetResponse.text()).toContain('color: navy');
    });
  });

  test('serves the index for an HTML HEAD request', async () => {
    const app = express();
    registerDocumentation(app, fixturePath);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/docs/unknown`, {
        headers: { Accept: 'text/html' },
        method: 'HEAD',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });
  });

  test('lets a non-HTML missing docs request fall through', async () => {
    const app = express();
    registerDocumentation(app, fixturePath);
    app.use((_req, res) => {
      res.status(418).json({ handledBy: 'fallthrough' });
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/docs/missing.json`, {
        headers: { Accept: 'application/json' },
      });

      expect(response.status).toBe(418);
      expect(await response.json()).toEqual({ handledBy: 'fallthrough' });

      const missingAssetResponse = await fetch(
        `${baseUrl}/docs/assets/missing.js`,
        { headers: { Accept: 'text/html' } },
      );
      expect(missingAssetResponse.status).toBe(418);
      expect(await missingAssetResponse.json()).toEqual({
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

  test('does not intercept OpenAPI, REST, or root Swagger routes', async () => {
    const app = express();
    app.get('/api-docs.json', (_req, res) => {
      res.json({ openapi: '3.0.0' });
    });
    app.get('/games', (_req, res) => {
      res.json([{ id: 1 }]);
    });
    registerDocumentation(app, fixturePath);
    app.use('/', (_req, res) => {
      res.type('html').send('<title>Swagger UI</title>');
    });

    await withServer(app, async (baseUrl) => {
      const specResponse = await fetch(`${baseUrl}/api-docs.json`);
      expect(specResponse.headers.get('content-type')).toContain(
        'application/json',
      );
      expect(await specResponse.json()).toEqual({ openapi: '3.0.0' });

      const gamesResponse = await fetch(`${baseUrl}/games`);
      expect(await gamesResponse.json()).toEqual([{ id: 1 }]);

      const swaggerResponse = await fetch(baseUrl);
      expect(await swaggerResponse.text()).toContain('Swagger UI');
    });
  });
});

import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import express from 'express';

import spec from '../../build/swagger.json';
import { RegisterRoutes } from '../../build/routes';
import { TeamsController } from '../app/teams/controller';
import errorHandler from './errors';

interface Operation {
  operationId?: string;
  security?: Array<Record<string, string[]>>;
}

const operationInventory = (): Array<{
  method: string;
  path: string;
  operation: Operation;
}> =>
  Object.entries(spec.paths).flatMap(([operationPath, pathItem]) =>
    Object.entries(pathItem as Record<string, Operation>)
      .filter(([, operation]) => Boolean(operation.operationId))
      .map(([method, operation]) => ({
        method: method.toUpperCase(),
        path: operationPath,
        operation,
      })),
  );

const generatedRouteBlock = (method: string, route: string): string => {
  const source = readFileSync(
    path.join(process.cwd(), 'build', 'routes.ts'),
    'utf8',
  );
  const marker = `app.${method}('${route}'`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing generated route ${method} ${route}.`);
  const nextRoute = source.indexOf('\n        app.', start + marker.length);
  const middlewareFactory = source.indexOf(
    '\n    function authenticateMiddleware',
    start + marker.length,
  );
  const candidates = [nextRoute, middlewareFactory].filter(
    (candidate) => candidate >= 0,
  );
  return source.slice(
    start,
    candidates.length ? Math.min(...candidates) : undefined,
  );
};

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

describe('generated security inventory', () => {
  test('keeps every public OpenAPI operation bearer-protected', () => {
    const operations = operationInventory();
    const anonymous = operations
      .filter(({ operation }) => operation.security?.length === 0)
      .map(({ method, path: operationPath }) => `${method} ${operationPath}`);

    expect(anonymous).toEqual([]);
    for (const { operation } of operations) {
      expect(operation.security).toEqual([{ apiKey: [] }]);
    }
  });

  test('omits authentication middleware only from the enrollment route', () => {
    expect(generatedRouteBlock('post', '/auth/key')).not.toContain(
      'authenticateMiddleware',
    );
    expect(generatedRouteBlock('get', '/teams')).toContain(
      'authenticateMiddleware',
    );
    expect(generatedRouteBlock('get', '/auth/graphql')).toContain(
      'authenticateMiddleware',
    );
  });

  test('does not construct or invoke a protected controller after auth denial', async () => {
    const controller = jest.spyOn(TeamsController.prototype, 'getTeams');
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const app = express();
    RegisterRoutes(app);
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/teams`);
      expect(response.status).toBe(401);
      expect(controller).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
      jest.restoreAllMocks();
    }
  });
});

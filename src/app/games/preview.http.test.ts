import express from 'express';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { RegisterRoutes } from '../../../build/routes';
import spec from '../../../build/swagger.json';
import errorHandler from '../../config/errors';
import { previewResponseHeaders } from '../../config/middleware/previewResponses';
import { updateQuotas } from '../../config/middleware/quotas';
import { authDb } from '../../config/database';
import { getGamePreview, getAdjustedGamePreview } from './preview';
import { getGameSchedule } from './schedule';
import { PreviewNotFound, PreviewDataError } from './previewRead';
import { game } from './fixtures/game-previews/testing';
import { getExporterOperations } from '../../config/servicePrincipals';

jest.mock('./preview', () => ({
  getGamePreview: jest.fn(),
  getAdjustedGamePreview: jest.fn(),
}));
jest.mock('./schedule', () => ({ getGameSchedule: jest.fn() }));
const lookup = jest.spyOn(authDb, 'oneOrNone'),
  metrics = jest.spyOn(authDb, 'none'),
  refund = jest.spyOn(authDb, 'one');
let revoked = false;
const users: Record<
  string,
  {
    id: number;
    patron_level: number;
    is_admin: boolean;
    blacklisted: boolean;
    remaining_calls: number;
  }
> = {
  free: {
    id: 1,
    patron_level: 0,
    is_admin: false,
    blacklisted: false,
    remaining_calls: 100,
  },
  paid: {
    id: 2,
    patron_level: 1,
    is_admin: false,
    blacklisted: false,
    remaining_calls: 100,
  },
  admin: {
    id: 3,
    patron_level: 0,
    is_admin: true,
    blacklisted: false,
    remaining_calls: 100,
  },
  page: {
    id: 901,
    patron_level: 0,
    is_admin: false,
    blacklisted: false,
    remaining_calls: 0,
  },
  exporter: {
    id: 902,
    patron_level: 0,
    is_admin: false,
    blacklisted: false,
    remaining_calls: 100,
  },
  blocked: {
    id: 4,
    patron_level: 1,
    is_admin: false,
    blacklisted: true,
    remaining_calls: 100,
  },
  exhausted: {
    id: 5,
    patron_level: 1,
    is_admin: false,
    blacklisted: false,
    remaining_calls: 0,
  },
};
const metadata = {
  assembledAt: game.statusCheckedAt,
  game,
  availability: 'metadata_only' as const,
  reason: 'game_completed' as const,
  analysis: null,
};
const withServer = async (run: (url: string) => Promise<void>) => {
  const app = express();
  app.use(previewResponseHeaders);
  app.use(updateQuotas);
  RegisterRoutes(app);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
};
beforeEach(() => {
  process.env.CFBD_PUBLIC_PAGE_SERVICE_USER_ID = '901';
  process.env.CFBD_EXPORTER_SERVICE_USER_ID = '902';
  revoked = false;
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  lookup.mockReset().mockImplementation(async (query, values) => {
    if (String(query).includes('UPDATE')) return { remaining_calls: 99 };
    const token = String(values),
      user = users[token];
    return user
      ? {
          ...user,
          patron_level: token === 'paid' && revoked ? 0 : user.patron_level,
        }
      : null;
  });
  metrics.mockReset().mockResolvedValue(null);
  refund.mockReset().mockResolvedValue({ remaining_calls: 100 });
  jest.mocked(getGamePreview).mockReset().mockResolvedValue(metadata);
  jest.mocked(getAdjustedGamePreview).mockReset().mockResolvedValue(metadata);
  jest
    .mocked(getGameSchedule)
    .mockReset()
    .mockResolvedValue({
      assembledAt: game.statusCheckedAt,
      selection: 'none',
      window: null,
      followingWindow: null,
      filters: { classification: 'fbs', conference: null },
      games: [],
    });
});
afterEach(() => {
  jest.spyOn(console, 'info').mockRestore();
  jest.spyOn(console, 'warn').mockRestore();
  jest.spyOn(console, 'error').mockRestore();
});
it('enforces the generated access matrix for exact, mixed-case, and slash paths', async () => {
  await withServer(async (url) => {
    for (const token of [
      'anonymous',
      'unknown',
      'free',
      'paid',
      'admin',
      'page',
      'exporter',
      'blocked',
      'exhausted',
    ]) {
      for (const path of [
        '/games/schedule',
        '/games/123/preview',
        '/games/123/preview/adjusted',
      ]) {
        for (const variant of [path, path.toUpperCase(), path + '/']) {
          jest.mocked(getGamePreview).mockClear();
          jest.mocked(getAdjustedGamePreview).mockClear();
          jest.mocked(getGameSchedule).mockClear();
          lookup.mockClear();
          refund.mockClear();
          const response = await fetch(url + variant, {
            headers:
              token === 'anonymous'
                ? {}
                : {
                    Authorization: `Bearer ${token}`,
                    Origin: 'https://collegefootballdata.com',
                  },
          });
          const denied =
            ['anonymous', 'unknown', 'blocked'].includes(token) ||
            (path.endsWith('adjusted') && ['free', 'exporter'].includes(token));
          const expected = denied ? 401 : token === 'exhausted' ? 429 : 200;
          expect({ token, variant, status: response.status }).toEqual({
            token,
            variant,
            status: expected,
          });
          expect(response.headers.get('cache-control')).toBe(
            'private, no-store',
          );
          const reads =
            jest.mocked(getGamePreview).mock.calls.length +
            jest.mocked(getAdjustedGamePreview).mock.calls.length +
            jest.mocked(getGameSchedule).mock.calls.length;
          expect(reads).toBe(expected === 200 ? 1 : 0);
          const reserves = lookup.mock.calls.filter(([q]) =>
            String(q).includes('UPDATE'),
          ).length;
          if (expected === 200)
            expect(reserves).toBe(['page', 'admin'].includes(token) ? 0 : 1);
          if (token === 'exporter' && denied) expect(reserves).toBe(0);
        }
      }
    }
  });
});
it.each([
  '/games/123/preview?refresh=true',
  '/games/123/preview?gameId=1',
  '/games/schedule?conference=x&conference=y',
  '/games/schedule?conference[]=x',
  '/games/schedule?conference[name]=x',
  '/games/schedule?classification=ii',
  '/games/schedule?seasonType=both',
  '/games/schedule?unknown=true',
  '/games/1.5/preview',
])('rejects malformed query/path %s before sources', async (path) => {
  await withServer(async (url) => {
    const response = await fetch(url + path, {
      headers: { Authorization: 'Bearer paid' },
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(getGamePreview).not.toHaveBeenCalled();
    expect(getGameSchedule).not.toHaveBeenCalled();
    expect(refund).toHaveBeenCalledTimes(1);
  });
});
it.each([
  [new PreviewNotFound(), 404, 'Game not found.'],
  [new PreviewDataError(), 503, 'Game preview is temporarily unavailable.'],
  [new Error('private SQL payload'), 500, 'Internal Server Error'],
] as const)(
  'sanitizes controlled/unexpected failures and refunds',
  async (error, status, message) => {
    jest.mocked(getGamePreview).mockRejectedValue(error);
    await withServer(async (url) => {
      const response = await fetch(url + '/games/123/preview', {
        headers: { Authorization: 'Bearer paid' },
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ message });
      expect(refund).toHaveBeenCalledTimes(1);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
  },
);
it('checks entitlement again after a successful adjusted request', async () => {
  await withServer(async (url) => {
    const request = () =>
      fetch(url + '/games/123/preview/adjusted', {
        headers: { Authorization: 'Bearer paid' },
      });
    expect((await request()).status).toBe(200);
    revoked = true;
    expect((await request()).status).toBe(401);
    expect(getAdjustedGamePreview).toHaveBeenCalledTimes(1);
  });
});
it('documents nullable contracts and excludes only adjusted previews from export', () => {
  expect(spec.paths['/games/schedule'].get.security).toEqual([{ apiKey: [] }]);
  expect(spec.paths['/games/{gameId}/preview'].get.responses).toHaveProperty(
    '503',
  );
  expect(
    spec.components.schemas.PreviewPlayerWepa.properties.plays,
  ).toMatchObject({ type: 'integer', nullable: true });
  expect(
    spec.components.schemas.GamePreview.properties.analysis,
  ).toHaveProperty('nullable', true);
  expect(getExporterOperations().has('GET /games/schedule')).toBe(true);
  expect(getExporterOperations().has('GET /games/{gameId}/preview')).toBe(true);
  expect(
    getExporterOperations().has('GET /games/{gameId}/preview/adjusted'),
  ).toBe(false);
});

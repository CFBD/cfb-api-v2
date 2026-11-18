import { getMockReq } from '@jest-mock/express';
import express from 'express';
import { EventEmitter, once } from 'node:events';
import { AddressInfo } from 'node:net';
import { AuthorizationError } from '../globals';

const mockRequest = (
  options?: Parameters<typeof getMockReq>[0],
  res = new EventEmitter(),
) => Object.assign(getMockReq(options), { res });

const mockOneOrNone = jest.fn();
const mockMetricInsert = jest.fn();
const mockClassifyPrincipal = jest.fn((userId: number) => {
  void userId;
  return 'individual';
});
const mockIsServiceOperationAllowed = jest.fn(
  (principalClass: string, operation: { method: string; path: string }) => {
    void principalClass;
    void operation;
    return true;
  },
);

jest.mock('./database', () => ({
  authDb: {
    oneOrNone: (...args: unknown[]) => mockOneOrNone(...args),
    none: (...args: unknown[]) => mockMetricInsert(...args),
  },
}));

jest.mock('./servicePrincipals', () => ({
  classifyPrincipal: (userId: number) => mockClassifyPrincipal(userId),
  isServiceOperationAllowed: (
    principalClass: string,
    operation: { method: string; path: string },
  ) => mockIsServiceOperationAllowed(principalClass, operation),
}));

import { expressAuthentication } from './auth';

const databaseUser = {
  id: 123,
  username: 'test@example.com',
  patron_level: 0,
  blacklisted: false,
  throttled: false,
  remaining_calls: 1000,
  is_admin: false,
};

describe('express authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    mockOneOrNone.mockReset().mockResolvedValue(databaseUser);
    mockMetricInsert.mockReset().mockResolvedValue(undefined);
    mockClassifyPrincipal.mockReturnValue('individual');
    mockIsServiceOperationAllowed.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('rejects unsupported security names', async () => {
    await expect(
      expressAuthentication(mockRequest(), 'notApiKey'),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test.each([
    undefined,
    '',
    'token',
    'bearer token',
    'Bearer',
    'Bearer ',
    'Bearer token extra',
    ' Bearer token',
  ])('rejects malformed authorization value %p', async (authorization) => {
    const request = mockRequest({
      headers: authorization === undefined ? {} : { authorization },
    });

    await expect(
      expressAuthentication(request, 'apiKey'),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mockOneOrNone).not.toHaveBeenCalled();
  });

  test.each([
    { origin: 'https://collegefootballdata.com' },
    { host: 'https://collegefootballdata.com' },
    {
      origin: 'https://collegefootballdata.com',
      host: 'https://collegefootballdata.com',
      referer: 'https://collegefootballdata.com',
      'x-forwarded-for': '127.0.0.1',
    },
  ])('browser-looking headers never authenticate', async (headers) => {
    await expect(
      expressAuthentication(mockRequest({ headers }), 'apiKey'),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('rejects unknown and blacklisted users before metrics', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer token' },
    });
    mockOneOrNone.mockResolvedValueOnce(null);
    await expect(
      expressAuthentication(request, 'apiKey'),
    ).rejects.toBeInstanceOf(AuthorizationError);

    mockOneOrNone.mockResolvedValueOnce({
      ...databaseUser,
      blacklisted: true,
    });
    await expect(
      expressAuthentication(request, 'apiKey'),
    ).rejects.toBeInstanceOf(AuthorizationError);
    request.res.emit('close');
    expect(mockMetricInsert).not.toHaveBeenCalled();
  });

  test('returns a classified non-null individual principal', async () => {
    const request = mockRequest({
      method: 'GET',
      path: '/games',
      route: { path: '/games' },
      headers: { authorization: 'Bearer token' },
    });

    await expect(expressAuthentication(request, 'apiKey')).resolves.toEqual(
      expect.objectContaining({
        id: 123,
        principalClass: 'individual',
      }),
    );
    expect(mockMetricInsert).not.toHaveBeenCalled();
  });

  test('rejects an out-of-scope service principal before metrics', async () => {
    mockClassifyPrincipal.mockReturnValueOnce('websitePage');
    mockIsServiceOperationAllowed.mockReturnValueOnce(false);
    const request = mockRequest({
      method: 'GET',
      route: { path: '/scoreboard' },
      headers: { authorization: 'Bearer page-token' },
    });

    await expect(
      expressAuthentication(request, 'apiKey'),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mockIsServiceOperationAllowed).toHaveBeenCalledWith('websitePage', {
      method: 'GET',
      path: '/scoreboard',
    });
    request.res.emit('close');
    expect(mockMetricInsert).not.toHaveBeenCalled();
  });

  test('uses the matched route rather than caller path spelling for scope', async () => {
    mockClassifyPrincipal.mockReturnValueOnce('websitePage');
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableFinished: true,
    });
    const now = jest.spyOn(performance, 'now').mockReturnValue(100);
    const request = mockRequest(
      {
        method: 'GET',
        path: '/TeAmS/',
        route: { path: '/teams' },
        headers: { authorization: 'Bearer page-token' },
      },
      res,
    );

    await expect(expressAuthentication(request, 'apiKey')).resolves.toEqual(
      expect.objectContaining({ principalClass: 'websitePage' }),
    );
    expect(mockIsServiceOperationAllowed).toHaveBeenCalledWith('websitePage', {
      method: 'GET',
      path: '/teams',
    });
    expect(mockMetricInsert).not.toHaveBeenCalled();
    now.mockReturnValue(125.7);
    res.emit('close');
    res.emit('close');
    expect(mockMetricInsert).toHaveBeenCalledTimes(1);
    expect(mockMetricInsert).toHaveBeenCalledWith(expect.any(String), [
      123,
      '/teams',
      {},
      undefined,
      '2',
      200,
      26,
    ]);
  });

  test.each([429, 503])(
    'records a completed %i response',
    async (statusCode) => {
      const res = Object.assign(new EventEmitter(), {
        statusCode,
        writableFinished: true,
      });
      const request = mockRequest(
        {
          path: '/live/plays',
          query: { gameId: '42' },
          headers: { authorization: 'Bearer token' },
          get: jest.fn().mockReturnValue('test-client'),
        },
        res,
      );

      await expressAuthentication(request, 'apiKey');
      res.emit('close');

      expect(mockMetricInsert).toHaveBeenCalledWith(
        expect.stringMatching(/status_code, duration_ms/),
        [
          123,
          '/live/plays',
          { gameId: '42' },
          'test-client',
          '2',
          statusCode,
          expect.any(Number),
        ],
      );
    },
  );

  test.each([true, false])(
    'waits for authentication if the response closes during the lookup (valid key: %s)',
    async (valid) => {
      let finishLookup!: (user: typeof databaseUser | null) => void;
      mockOneOrNone.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishLookup = resolve;
          }),
      );
      const now = jest.spyOn(performance, 'now').mockReturnValue(100);
      const res = Object.assign(new EventEmitter(), {
        statusCode: 200,
        writableFinished: false,
      });
      const request = mockRequest(
        {
          path: '/games',
          headers: { authorization: 'Bearer token' },
        },
        res,
      );

      const authenticated = expressAuthentication(request, 'apiKey');
      now.mockReturnValue(110);
      res.emit('close');
      expect(mockMetricInsert).not.toHaveBeenCalled();
      now.mockReturnValue(200);
      finishLookup(valid ? databaseUser : null);

      if (valid) {
        await authenticated;
        expect(mockMetricInsert).toHaveBeenCalledTimes(1);
        expect(mockMetricInsert).toHaveBeenCalledWith(expect.any(String), [
          123,
          '/games',
          {},
          undefined,
          '2',
          499,
          10,
        ]);
      } else {
        await expect(authenticated).rejects.toBeInstanceOf(AuthorizationError);
        expect(mockMetricInsert).not.toHaveBeenCalled();
      }
    },
  );

  test('records a disconnect after the HTTP handler starts', async () => {
    let enterHandler!: () => void;
    const handlerStarted = new Promise<void>((resolve) => {
      enterHandler = resolve;
    });
    let closeResponse!: () => void;
    const responseClosed = new Promise<void>((resolve) => {
      closeResponse = resolve;
    });
    const app = express();
    app.get(
      '/games',
      (req, _res, next) => {
        void expressAuthentication(req, 'apiKey').then(() => next(), next);
      },
      (_req, res) => {
        res.once('close', closeResponse);
        enterHandler();
      },
    );

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const abort = new AbortController();
    const response = fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/games`,
      {
        headers: { authorization: 'Bearer token' },
        signal: abort.signal,
      },
    );
    try {
      await Promise.race([
        handlerStarted,
        response.then((result) => {
          throw new Error(`Expected an open response, got ${result.status}`);
        }),
      ]);
      abort.abort();
      await expect(response).rejects.toMatchObject({ name: 'AbortError' });
      await responseClosed;
      expect(mockMetricInsert).toHaveBeenCalledTimes(1);
      expect(mockMetricInsert).toHaveBeenCalledWith(expect.any(String), [
        123,
        '/games',
        {},
        expect.any(String),
        '2',
        499,
        expect.any(Number),
      ]);
    } finally {
      abort.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('logs insert failures after close', async () => {
    const log = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockMetricInsert.mockRejectedValueOnce(new Error('database unavailable'));
    const request = mockRequest({
      path: '/games',
      headers: { authorization: 'Bearer token' },
    });

    await expect(
      expressAuthentication(request, 'apiKey'),
    ).resolves.toMatchObject({
      id: 123,
    });
    request.res.emit('close');
    await Promise.resolve();

    expect(log).toHaveBeenCalledWith('API metrics write failed.');
  });

  test('logs safe canonical auth dimensions without the bearer value', async () => {
    const request = mockRequest({
      method: 'GET',
      route: { path: '/games' },
      headers: { authorization: 'Bearer do-not-log-this' },
    });

    await expressAuthentication(request, 'apiKey');

    const logged = String(
      (console.info as jest.Mock).mock.calls.at(-1)?.[0] ?? '',
    );
    expect(JSON.parse(logged)).toEqual({
      event: 'api_request_auth',
      principalClass: 'individual',
      operation: 'GET /games',
      outcome: 'allowed',
    });
    expect(logged).not.toContain('do-not-log-this');
  });
});

jest.mock('./cbbServicePrincipals', () => ({
  isDeniedCbbWebsitePrincipal: (id: number) => [301, 302].includes(id),
}));
describe('CBB website identities', () => {
  test.each([301, 302])(
    'rejects %s before metrics or scope classification',
    async (id) => {
      jest.clearAllMocks();
      mockOneOrNone.mockResolvedValue({ ...databaseUser, id });
      await expect(
        expressAuthentication(
          mockRequest({
            headers: { authorization: 'Bearer foreign' },
            method: 'GET',
            route: { path: '/teams' },
          }),
          'apiKey',
        ),
      ).rejects.toBeInstanceOf(AuthorizationError);
      expect(mockMetricInsert).not.toHaveBeenCalled();
      expect(mockClassifyPrincipal).not.toHaveBeenCalled();
    },
  );
});

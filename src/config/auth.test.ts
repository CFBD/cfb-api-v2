import { getMockReq } from '@jest-mock/express';
import { AuthorizationError } from '../globals';

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
    mockOneOrNone.mockResolvedValue(databaseUser);
    mockMetricInsert.mockResolvedValue(undefined);
    mockClassifyPrincipal.mockReturnValue('individual');
    mockIsServiceOperationAllowed.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('rejects unsupported security names', async () => {
    await expect(
      expressAuthentication(getMockReq(), 'notApiKey'),
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
    const request = getMockReq({
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
      expressAuthentication(getMockReq({ headers }), 'apiKey'),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('rejects unknown and blacklisted users before metrics', async () => {
    const request = getMockReq({
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
    expect(mockMetricInsert).not.toHaveBeenCalled();
  });

  test('returns a classified non-null individual principal', async () => {
    const request = getMockReq({
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
    expect(mockMetricInsert).toHaveBeenCalledTimes(1);
  });

  test('rejects an out-of-scope service principal before metrics', async () => {
    mockClassifyPrincipal.mockReturnValueOnce('websitePage');
    mockIsServiceOperationAllowed.mockReturnValueOnce(false);
    const request = getMockReq({
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
    expect(mockMetricInsert).not.toHaveBeenCalled();
  });

  test('uses the matched route rather than caller path spelling for scope', async () => {
    mockClassifyPrincipal.mockReturnValueOnce('websitePage');
    const request = getMockReq({
      method: 'GET',
      path: '/TeAmS/',
      route: { path: '/teams' },
      headers: { authorization: 'Bearer page-token' },
    });

    await expect(expressAuthentication(request, 'apiKey')).resolves.toEqual(
      expect.objectContaining({ principalClass: 'websitePage' }),
    );
    expect(mockIsServiceOperationAllowed).toHaveBeenCalledWith('websitePage', {
      method: 'GET',
      path: '/teams',
    });
    expect(mockMetricInsert).toHaveBeenCalledWith(expect.any(String), [
      123,
      '/teams',
      {},
      undefined,
      '2',
    ]);
  });

  test('logs safe canonical auth dimensions without the bearer value', async () => {
    const request = getMockReq({
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

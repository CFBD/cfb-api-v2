import { getMockReq } from '@jest-mock/express';
import { ApiUser, AuthorizationError } from '../globals';

const mockDatabaseUser: Partial<any> = {
  id: 123,
  username: 'test@example.com',
  patron_level: 0,
  blacklisted: false,
  throttled: false,
  remaining_calls: 1000,
  is_admin: false,
};

jest.mock('./database', () => {
  const mock =
    jest.createMockFromModule<typeof import('./database')>('./database');

  // @ts-ignore
  mock.authDb.oneOrNone = () => Promise.resolve(mockDatabaseUser);

  return mock;
});

import { authDb } from './database';

beforeEach(() => {
  jest.resetAllMocks();
  jest.mock('./database', () => {
    const mock =
      jest.createMockFromModule<typeof import('./database')>('./database');

    // @ts-ignore
    mock.authDb.oneOrNone = () => Promise.resolve(mockDatabaseUser);

    return mock;
  });
});

import { expressAuthentication } from './auth';
const patreonLocked: string[] = [
  '/live/plays',
  '/games/weather',
  '/scoreboard',
];

describe('generic auth tests', () => {
  test('non api key auth type', async () => {
    try {
      const request = getMockReq();
      await expressAuthentication(request, 'notApiKey');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
    }
  });

  test('missing bearer prefix', async () => {
    try {
      const request = getMockReq({
        headers: {
          authorization: 'my_api_key',
        },
      });

      await expressAuthentication(request, 'apiKey');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
    }
  });

  test('unknown api key', async () => {
    try {
      // @ts-ignore
      authDb.oneOrNone = () => Promise.resolve(null);

      const request = getMockReq({
        headers: {
          authorization: 'Bearer my_api_key',
        },
      });

      await expressAuthentication(request, 'apiKey');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
    }
  });

  test('blacklisted user', async () => {
    try {
      authDb.oneOrNone = () =>
        // @ts-ignore
        Promise.resolve({
          ...mockDatabaseUser,
          blacklisted: true,
        });

      const request = getMockReq({
        headers: {
          authorization: 'Bearer my_api_key',
        },
      });

      await expressAuthentication(request, 'apiKey');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
    }
  });

  test('non-Patreon user', async () => {
    try {
      authDb.oneOrNone = () =>
        // @ts-ignore
        Promise.resolve({
          ...mockDatabaseUser,
          patron_level: 0,
        });

      const request = getMockReq({
        headers: {
          authorization: 'Bearer my_api_key',
        },
      });

      await expressAuthentication(request, 'apiKey');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
    }
  });

  test('Patreon user', async () => {
    authDb.oneOrNone = () =>
      // @ts-ignore
      Promise.resolve({
        ...mockDatabaseUser,
        patron_level: 1,
      });

    const request = getMockReq({
      headers: {
        authorization: 'Bearer my_api_key',
      },
    });

    const user = await expressAuthentication(request, 'apiKey');

    expect(user as ApiUser).toBeDefined();
  });
});

describe('CORS auth tests', () => {
  test('cors allowed for domain origin', async () => {
    const request = getMockReq({
      headers: {
        origin: 'https://collegefootballdata.com',
      },
    });

    // @ts-ignore
    request.get = (header: string) => {
      if (header === 'origin') {
        return 'https://collegefootballdata.com';
      }

      return '';
    };

    const user = await expressAuthentication(request, 'apiKey');
    expect(user).toEqual({});
  });

  test('cors allowed for domain host', async () => {
    const request = getMockReq({
      headers: {
        host: 'https://collegefootballdata.com',
      },
    });

    // @ts-ignore
    request.get = (header: string) => {
      if (header === 'host') {
        return 'https://collegefootballdata.com';
      }

      return '';
    };

    const user = await expressAuthentication(request, 'apiKey');
    expect(user).toEqual({});
  });

  test('cors not allowed for other domain', async () => {
    try {
      const request = getMockReq({
        headers: {
          host: 'https://example.com',
          origin: 'https://example.com',
        },
      });

      await expressAuthentication(request, 'apiKey');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
    }
  });

  test.each(patreonLocked)(
    'cors not allowed for Patreon locked endpoint %',
    async (path) => {
      try {
        const request = getMockReq({
          path,
        });

        await expressAuthentication(request, 'apiKey');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthorizationError);
      }
    },
  );
});

import { getMockReq } from '@jest-mock/express';

import { AuthController } from './controller';
import { AuthorizationError } from '../../globals';

describe('auth controller tests', () => {
  test('hasura auth returns 401 if no user', async () => {
    const controller = new AuthController();
    try {
      await controller.getHasuraAuth(
        getMockReq({
          user: null,
        }),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(controller.getStatus()).toBe(401);
    }
  });

  test('hasura auth returns 401 if non-Patreon', async () => {
    const controller = new AuthController();
    try {
      await controller.getHasuraAuth(
        getMockReq({
          user: { patronLevel: 0 },
        }),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(controller.getStatus()).toBe(401);
    }
  });

  test('hasura auth returns 401 if not correct tier', async () => {
    const controller = new AuthController();
    try {
      await controller.getHasuraAuth(
        getMockReq({
          user: { patronLevel: 2 },
        }),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(controller.getStatus()).toBe(401);
    }
  });

  test('hasura auth returns 200 if correct tier', async () => {
    const controller = new AuthController();
    const response = await controller.getHasuraAuth(
      getMockReq({
        user: { id: 1, patronLevel: 3 },
      }),
    );

    expect(response).toEqual({
      'X-Hasura-User-Id': '1',
      'X-Hasura-Role': 'readonly',
      'X-Hasura-Is-Owner': 'false',
      'Cache-Control': 'max-age=86400',
    });
    expect(controller.getStatus()).toBe(200);
  });

  test('hasura auth returns 200 if admin', async () => {
    const controller = new AuthController();
    const response = await controller.getHasuraAuth(
      getMockReq({
        user: { id: 1, patronLevel: 0, isAdmin: true },
      }),
    );

    expect(response).toEqual({
      'X-Hasura-User-Id': '1',
      'X-Hasura-Role': 'readonly',
      'X-Hasura-Is-Owner': 'false',
      'Cache-Control': 'max-age=86400',
    });
    expect(controller.getStatus()).toBe(200);
  });
});

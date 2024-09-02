import { Request } from 'express';

import { authDb } from './database';
import { AuthorizationError } from '../globals';

const keyPattern = /Bearer (?<token>.+)/;

export const patreonLocked: Record<string, number> = {
  '/live/plays': 1,
  '/games/weather': 1,
  '/scoreboard': 1,
};

const corsOrigin: string =
  process.env.CORS_ORIGIN || 'https://collegefootballdata.com';
const nodeEnv: string = process.env.NODE_ENV || 'production';

export const expressAuthentication = async (
  request: Request,
  securityName: string,
) => {
  if (securityName === 'apiKey') {
    if (
      !request.headers.authorization &&
      !Object.keys(patreonLocked).includes(request.path)
    ) {
      const origin = request.get('origin');
      const host = request.get('host');

      if (
        nodeEnv === 'development' ||
        corsOrigin === origin ||
        corsOrigin === host
      ) {
        return Promise.resolve({});
      }
    }

    if (
      !request.headers.authorization ||
      !keyPattern.test(request.headers.authorization)
    ) {
      return Promise.reject(
        new AuthorizationError(
          'Unauthorized. Did you forget to add "Bearer " before your key? Go to CollegeFootballData.com to register for your free API key. See the CFBD Blog for examples on usage: https://blog.collegefootballdata.com/using-api-keys-with-the-cfbd-api.',
        ),
      );
    } else {
      const token = keyPattern.exec(request.headers.authorization);
      const user = await authDb.oneOrNone(
        `SELECT * FROM "user" WHERE token = $1`,
        token?.groups?.['token'],
      );
      if (user && !user.blacklisted) {
        if (!user.patron_level) {
          return Promise.reject(
            new AuthorizationError(
              'This version of the CFBD API is in limited beta and requires a Patreon subscription. Please visit https://www.patreon.com/collegefootballdata to subscribe.',
            ),
          );
        }

        if (Object.keys(patreonLocked).includes(request.path)) {
          const requiredLevel = patreonLocked[request.path];
          if (!user.patron_level || user.patron_level < requiredLevel) {
            return Promise.reject(
              new AuthorizationError(
                `Unauthorized. This endpoint requires a Patreon subscription at Tier ${requiredLevel} or higher.`,
              ),
            );
          }
        }

        return Promise.resolve({
          id: user.id,
          username: user.username,
          patronLevel: user.patron_level,
          blacklisted: user.blacklisted,
          throttled: user.throttled,
          remainingCalls: user.remaining_calls,
          isAdmin: user.is_admin,
        });
      } else if (user?.blacklisted) {
        return Promise.reject(
          new AuthorizationError('Account has been blacklisted.'),
        );
      } else {
        return Promise.reject(new AuthorizationError('Unauthorized'));
      }
    }
  }

  return Promise.reject(new AuthorizationError('Unauthorized'));
};

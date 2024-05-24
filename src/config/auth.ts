import { Request } from 'express';

import { authDb } from './database';

const keyPattern = /Bearer (?<token>.+)/;

export class AuthorizationError extends Error {}

export const expressAuthentication = async (
  request: Request,
  securityName: string,
) => {
  if (securityName === 'apiKey') {
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
        return Promise.resolve({
          id: user.id,
          username: user.username,
          patronLevel: user.patron_level,
          blacklisted: user.blacklisted,
          throttled: user.throttled,
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

  return Promise.reject({});
};

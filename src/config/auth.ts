import { Request } from 'express';
import { isDeniedCbbWebsitePrincipal } from './cbbServicePrincipals';

import { authDb } from './database';
import { AuthorizationError } from '../globals';
import {
  classifyPrincipal,
  isServiceOperationAllowed,
} from './servicePrincipals';

const keyPattern = /^Bearer (?<token>\S+)$/;

const trackRequestMetrics = (request: Request, startedAt: number) => {
  let requestMetrics:
    | {
        userId: number;
        endpoint: string;
        query: Request['query'];
        userAgent: string | undefined;
      }
    | undefined;
  let outcome: { statusCode: number; durationMs: number } | undefined;

  const writeMetrics = async () => {
    if (!requestMetrics || !outcome) return;

    try {
      await authDb.none(
        `
          INSERT INTO metrics (
            user_id, endpoint, query, user_agent, api_version, status_code, duration_ms
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          requestMetrics.userId,
          requestMetrics.endpoint,
          requestMetrics.query,
          requestMetrics.userAgent,
          '2',
          outcome.statusCode,
          outcome.durationMs,
        ],
      );
    } catch {
      console.error('API metrics write failed.');
    }
  };

  // The response can close while the user lookup is pending.
  const res = request.res;
  res?.once('close', () => {
    outcome = {
      statusCode: res.writableFinished ? res.statusCode : 499,
      durationMs: Math.round(performance.now() - startedAt),
    };
    void writeMetrics();
  });

  return (userId: number, endpoint: string) => {
    requestMetrics = {
      userId,
      endpoint,
      query: request.query,
      userAgent: request.get('user-agent'),
    };
    void writeMetrics();
  };
};

type AuthOutcome =
  | 'allowed'
  | 'missing'
  | 'malformed'
  | 'unknown'
  | 'blacklisted'
  | 'out_of_scope';

const logAuthOutcome = (
  request: Request,
  outcome: AuthOutcome,
  principalClass: 'individual' | 'websitePage' | 'websiteExporter' | 'unknown',
): void => {
  const matchedPath =
    typeof request.route?.path === 'string' ? request.route.path : request.path;
  console.info(
    JSON.stringify({
      event: 'api_request_auth',
      principalClass,
      operation: `${request.method.toUpperCase()} ${matchedPath}`,
      outcome,
    }),
  );
};

export const expressAuthentication = async (
  request: Request,
  securityName: string,
) => {
  const startedAt = performance.now();
  if (securityName !== 'apiKey') {
    logAuthOutcome(request, 'malformed', 'unknown');
    return Promise.reject(new AuthorizationError('Unauthorized'));
  }

  const authorization = request.headers.authorization;
  const token = authorization ? keyPattern.exec(authorization) : null;
  if (!token?.groups?.['token']) {
    logAuthOutcome(
      request,
      authorization === undefined ? 'missing' : 'malformed',
      'unknown',
    );
    return Promise.reject(
      new AuthorizationError(
        'Unauthorized. Did you forget to add "Bearer " before your key? Go to CollegeFootballData.com to register for your free API key. See the CFBD Blog for examples on usage: https://blog.collegefootballdata.com/using-api-keys-with-the-cfbd-api.',
      ),
    );
  }

  const recordAuthenticatedRequest = trackRequestMetrics(request, startedAt);
  const user = await authDb.oneOrNone(
    `SELECT * FROM "user" WHERE token = $1`,
    token.groups['token'],
  );
  if (!user) {
    logAuthOutcome(request, 'unknown', 'unknown');
    return Promise.reject(new AuthorizationError('Unauthorized'));
  }
  if (user.blacklisted) {
    logAuthOutcome(request, 'blacklisted', 'unknown');
    return Promise.reject(
      new AuthorizationError('Account has been blacklisted.'),
    );
  }

  if (isDeniedCbbWebsitePrincipal(user.id)) {
    logAuthOutcome(request, 'out_of_scope', 'unknown');
    throw new AuthorizationError('Unauthorized');
  }
  const principalClass = classifyPrincipal(user.id);
  const matchedPath =
    typeof request.route?.path === 'string' ? request.route.path : undefined;
  if (
    principalClass !== 'individual' &&
    (!matchedPath ||
      !isServiceOperationAllowed(principalClass, {
        method: request.method,
        path: matchedPath,
      }))
  ) {
    logAuthOutcome(request, 'out_of_scope', principalClass);
    return Promise.reject(new AuthorizationError('Unauthorized'));
  }

  recordAuthenticatedRequest(user.id, matchedPath ?? request.path);
  logAuthOutcome(request, 'allowed', principalClass);

  return Promise.resolve({
    id: user.id,
    username: user.username,
    patronLevel: user.patron_level,
    blacklisted: user.blacklisted,
    throttled: user.throttled,
    remainingCalls: user.remaining_calls,
    isAdmin: user.is_admin,
    principalClass,
  });
};

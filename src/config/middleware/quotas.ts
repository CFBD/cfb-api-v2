import { NextFunction, Request, Response } from 'express';
import { authDb } from '../database';
import { ApiUser } from 'src/globals';

type QuotaRequest = Request & {
  quotaReserved?: boolean;
};

export const ignoredPaths = [
  // '/live/plays',
  // '/games/weather',
  '/scoreboard',
  '/auth/graphql',
  '/info',
  '/info/usage',
];

const getMatchedPath = (req: Request): string | undefined =>
  typeof req.route?.path === 'string' ? req.route.path : undefined;

const isSuccessfulResponse = (statusCode: number): boolean =>
  statusCode >= 200 && statusCode < 300;

const shouldMeterRequest = (
  req: QuotaRequest,
): req is QuotaRequest & { user: ApiUser } =>
  !!req.user &&
  !(req.user as ApiUser).isAdmin &&
  (req.user as ApiUser).principalClass !== 'websitePage' &&
  !ignoredPaths.includes(getMatchedPath(req) ?? req.path);

export const checkCallQuotas = async (
  req: QuotaRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!shouldMeterRequest(req)) {
    next();
    return;
  }

  const user = req.user;

  if (user.remainingCalls <= 0) {
    res.status(429).send({
      message: 'Monthly call quota exceeded.',
    });
    return;
  }

  try {
    const remaining = await authDb.oneOrNone(
      `
      UPDATE "user"
      SET remaining_calls = remaining_calls - 1
      WHERE id = $1
        AND remaining_calls > 0
      RETURNING remaining_calls
      `,
      [user.id],
    );

    if (!remaining) {
      user.remainingCalls = 0;
      res.status(429).send({
        message: 'Monthly call quota exceeded.',
      });
      return;
    }

    req.quotaReserved = true;
    user.remainingCalls = remaining.remaining_calls;
    next();
  } catch (error) {
    console.error('Error reserving quota', error);
    res.status(503).send({
      message: 'Unable to verify call quota. Please retry later.',
    });
  }
};

export const updateQuotas = (
  req: QuotaRequest,
  res: Response,
  next: NextFunction,
): void => {
  const send = res.send.bind(res);
  let responseStarted = false;
  let sending = false;

  const responseClosed = () =>
    res.headersSent || res.writableEnded || res.destroyed;

  const sendResponse = (body: unknown) => {
    if (responseClosed()) return res;
    if (req.user) {
      const user = req.user as ApiUser;
      res.setHeader('X-CallLimit-Remaining', user.remainingCalls);
    }

    // Express send(object) calls json(), which calls send(string) internally.
    // Permit that synchronous recursion, but reject later response attempts.
    sending = true;
    try {
      return send(body);
    } finally {
      sending = false;
    }
  };

  res.send = (body?: unknown): Response => {
    if (sending) return send(body);
    if (responseStarted || responseClosed()) return res;
    responseStarted = true;

    if (
      !isSuccessfulResponse(res.statusCode) &&
      req.user &&
      req.quotaReserved
    ) {
      req.quotaReserved = false;
      const user = req.user as ApiUser;
      const refundAndSend = async () => {
        try {
          const remaining = await authDb.one(
            `UPDATE "user" SET remaining_calls = (remaining_calls + 1) WHERE id = $1 RETURNING remaining_calls`,
            [user.id],
          );
          user.remainingCalls = remaining.remaining_calls;
        } catch (error) {
          console.error('Error refunding remaining calls', error);
        }
        sendResponse(body);
      };
      // Express does not await send(). Keep its synchronous return contract
      // and route asynchronous send failures through the error middleware.
      void refundAndSend().catch((error) => {
        responseStarted = false;
        next(error);
      });
      return res;
    }

    try {
      return sendResponse(body);
    } catch (error) {
      responseStarted = false;
      throw error;
    }
  };

  next();
};

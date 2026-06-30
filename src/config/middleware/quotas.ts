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

const isSuccessfulResponse = (statusCode: number): boolean =>
  statusCode >= 200 && statusCode < 300;

const shouldMeterRequest = (
  req: QuotaRequest,
): req is QuotaRequest & { user: ApiUser } =>
  !!req.user &&
  !(req.user as ApiUser).isAdmin &&
  !ignoredPaths.includes(req.path);

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

export const updateQuotas = async (
  req: QuotaRequest,
  res: Response,
  next: NextFunction,
) => {
  const send = res.send.bind(res);

  res.send = (async (body?: unknown) => {
    if (
      !isSuccessfulResponse(res.statusCode) &&
      req.user &&
      req.quotaReserved
    ) {
      const user = req.user as ApiUser;
      try {
        const remaining = await authDb.one(
          `UPDATE "user" SET remaining_calls = (remaining_calls + 1) WHERE id = $1 RETURNING remaining_calls`,
          [user.id],
        );
        user.remainingCalls = remaining.remaining_calls;
      } catch (error) {
        console.error('Error refunding remaining calls', error);
      }
    }

    if (req.user) {
      const user = req.user as ApiUser;
      res.setHeader('X-CallLimit-Remaining', user.remainingCalls);
    }

    return send(body);
  }) as unknown as Response['send'];

  next();
};

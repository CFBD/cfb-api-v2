import { NextFunction, Request, Response } from 'express';
import { authDb } from '../database';

const ignoredPaths = ['/live/plays', '/games/weather', '/scoreboard'];

interface ApiUser {
  id: number;
  username: string;
  patronLevel: number;
  remainingCalls: number;
}

export const checkCallQuotas = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // @ts-ignore
  if (
    req.user &&
    !ignoredPaths.includes(req.path) &&
    req.user.remainingCalls <= 0
  ) {
    res.status(429).send({
      message: 'Monthly call quota exceeded.',
    });
    return;
  }

  next();
};

export const updateQuotas = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const temp = res.send;

  // @ts-ignore
  res.send = async (body) => {
    if (
      res.statusCode === 200 &&
      req.user &&
      !ignoredPaths.includes(req.path)
    ) {
      const user = req.user as ApiUser;

      if (res.statusCode === 200) {
        try {
          const remaining = await authDb.one(
            `UPDATE "user" SET remaining_calls = (remaining_calls - 1) WHERE id = $1 RETURNING remaining_calls`,
            [user.id],
          );
          user.remainingCalls = remaining.remaining_calls;
        } catch (error) {
          console.error('Error updating remaining calls', error);
        }
      }
    }

    if (req.user) {
      // @ts-ignore
      res.setHeader('X-CallLimit-Remaining', req.user.remainingCalls);
    }

    temp.call(res, body);
  };

  next();
};

import { NextFunction, Request, Response } from 'express';
import { authDb } from '../database';

interface ApiUser {
  id: number;
  username: string;
  patronLevel: number;
  remainingCalls: number;
}

export const checkCallQuotas = async (req: Request, res: Response, next: NextFunction) => {
  // @ts-ignore
  if (req.user && req.user.remainingCalls <= 0) {
    res.status(429).send({
      message: 'Monthly call quota exceeded.',
    });
    return;
  }

  next();
};

export const updateQuotas = async (req: Request, res: Response, next: NextFunction) => {
  const temp = res.send;

  // @ts-ignore
  res.send = async (body) => {
    if (res.statusCode === 200 && req.user) {
      const user = req.user as ApiUser;

      if (res.statusCode === 200) {
        user.remainingCalls -= 1;

        try {
          await authDb.none(
            `UPDATE "user" SET remaining_calls = $1 WHERE id = $2`,
            [user.remainingCalls, user.id],
          );
        } catch (error) {
          console.error('Error updating remaining calls', error);
        }

        res.setHeader('X-CallLimit-Remaining', user.remainingCalls);
      }
    }

    temp.call(res, body);
  };

  next();
};

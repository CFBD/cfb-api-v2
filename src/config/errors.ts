import { NextFunction, Request, Response } from 'express';
import { AuthorizationError } from '../globals';
import { ValidateError } from 'tsoa';

export default function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  if (err instanceof ValidateError) {
    console.warn(`Caught Validation Error for %s:`, req.path, {
      fields: err?.fields,
      user: req.user,
    });
    return res.status(400).json({
      message: 'Validation Failed',
      details: err?.fields,
    });
  }

  if (err instanceof AuthorizationError) {
    return res.status(401).json({
      message: err.message,
    });
  }

  if (err instanceof Error) {
    // if (process.env.NODE_ENV !== 'production') {
    console.error(`${err.stack}`);
    // }

    return res.status(500).json({
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal Server Error'
          : `${err.message}\n${err.stack}`,
    });
  }

  next();
}

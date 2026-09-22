import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiUser, AuthorizationError } from '../../globals';

export const requirePatreonTier = (
  requiredLevel: 1 | 2,
  options: { allowWebsitePage?: boolean } = {},
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user as ApiUser | undefined;
    if (
      options.allowWebsitePage &&
      user?.principalClass === 'websitePage' &&
      req.method === 'GET' &&
      req.route?.path === '/wepa/team/season'
    ) {
      next();
      return;
    }
    if (user && (user.isAdmin || user.patronLevel >= requiredLevel)) {
      next();
      return;
    }

    next(
      new AuthorizationError(
        `Unauthorized. This endpoint requires a Patreon subscription at Tier ${requiredLevel} or higher.`,
      ),
    );
  };
};

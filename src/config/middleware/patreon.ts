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
      ['/wepa/team/season', '/games/:gameId/preview/adjusted'].includes(
        req.route?.path,
      )
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

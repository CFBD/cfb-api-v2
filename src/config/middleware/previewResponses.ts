import { RequestHandler } from 'express';

export const isPreviewPath = (path: string): boolean =>
  /^\/games\/(?:schedule|[^/]+\/preview(?:\/adjusted)?)\/?$/i.test(path);

export const previewResponseHeaders: RequestHandler = (req, res, next) => {
  if (isPreviewPath(req.path))
    res.setHeader('Cache-Control', 'private, no-store');
  next();
};

import { RequestHandler } from 'express';

export const rejectBadParam = (paramName = 'badParam'): RequestHandler => {
  return (req, res, next) => {
    if (Object.prototype.hasOwnProperty.call(req.query, paramName)) {
      return res.status(400).json({
        message: `Query parameter "${paramName}" is not allowed on this endpoint.`,
        code: 'BAD_QUERY_PARAM',
      });
    }
    next();
  };
};

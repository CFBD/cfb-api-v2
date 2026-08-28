import { NextFunction, Request, Response } from 'express';

import { ApiUser } from 'src/globals';

type ConcurrencyLimitRule = {
  path: string;
  methods?: string[];
  maxConcurrent: number;
  leaseMs: number;
};

const normalizePath = (path: string): string => {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }

  return path.replace(/\/$/, '');
};

const getMatchedPath = (req: Request): string =>
  normalizePath(
    typeof req.route?.path === 'string' ? req.route.path : req.path,
  );

const matchesRule = (req: Request, rule: ConcurrencyLimitRule): boolean => {
  const methodMatch =
    !rule.methods || rule.methods.includes(req.method.toUpperCase());

  return getMatchedPath(req) === normalizePath(rule.path) && methodMatch;
};

const defaultKeyGenerator = (
  req: Request,
  rule: ConcurrencyLimitRule,
): string | null => {
  const user = req.user as ApiUser | undefined;

  if (!user || typeof user.id !== 'number') {
    return null;
  }

  return `${req.method.toUpperCase()}:${normalizePath(rule.path)}:${user.id}`;
};

export const createConcurrencyLimit = (
  rules: ConcurrencyLimitRule[],
  keyGenerator: (
    req: Request,
    rule: ConcurrencyLimitRule,
  ) => string | null = defaultKeyGenerator,
) => {
  const activeRequests = new Map<string, number>();

  return (req: Request, res: Response, next: NextFunction) => {
    const rule = rules.find((candidate) => matchesRule(req, candidate));

    if (!rule) {
      next();
      return;
    }

    const key = keyGenerator(req, rule);
    if (!key) {
      next();
      return;
    }

    const active = activeRequests.get(key) ?? 0;
    if (active >= rule.maxConcurrent) {
      console.info(
        JSON.stringify({
          event: 'api_concurrency_limit',
          operation: `${req.method.toUpperCase()} ${normalizePath(rule.path)}`,
          outcome: 'rejected',
          maxConcurrent: rule.maxConcurrent,
        }),
      );
      res.setHeader('Retry-After', '1');
      res.status(429).send({
        message: 'Too many concurrent requests for this endpoint.',
      });
      return;
    }

    activeRequests.set(key, active + 1);

    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      clearTimeout(lease);

      const current = activeRequests.get(key) ?? 0;
      if (current <= 1) {
        activeRequests.delete(key);
        return;
      }

      activeRequests.set(key, current - 1);
    };
    const lease = setTimeout(release, rule.leaseMs);

    res.once('finish', release);
    next();
  };
};

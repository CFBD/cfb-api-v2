import { NextFunction, Request, Response } from 'express';

import { ApiUser } from 'src/globals';

type RateSlowdownRule = {
  path: string;
  methods?: string[];
  windowMs: number;
  delayAfter: number;
  delayMs: number;
  maxDelayMs?: number;
};

type SlowdownEntry = {
  hits: number;
  resetTime: number;
  timeout: NodeJS.Timeout;
};

const normalizePath = (path: string): string => {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }

  return path.replace(/\/$/, '');
};

const matchesRule = (req: Request, rule: RateSlowdownRule): boolean => {
  const requestPath = req.path.replace(/\/$/, '');
  const rulePath = normalizePath(rule.path);
  const methodMatch =
    !rule.methods || rule.methods.includes(req.method.toUpperCase());

  return requestPath === rulePath && methodMatch;
};

const defaultKeyGenerator = (
  req: Request,
  rule: RateSlowdownRule,
): string | null => {
  const user = req.user as ApiUser | undefined;

  if (!user || typeof user.id !== 'number') {
    return null;
  }

  return `${rule.path}:${user.id}`;
};

export const createRateSlowdown = (
  rules: RateSlowdownRule[],
  keyGenerator: (
    req: Request,
    rule: RateSlowdownRule,
  ) => string | null = defaultKeyGenerator,
) => {
  const store = new Map<string, SlowdownEntry>();

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
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || now >= entry.resetTime) {
      if (entry?.timeout) {
        clearTimeout(entry.timeout);
      }

      const timeout = setTimeout(() => {
        store.delete(key);
      }, rule.windowMs);

      entry = {
        hits: 0,
        resetTime: now + rule.windowMs,
        timeout,
      };
    }

    entry.hits += 1;
    store.set(key, entry);

    let delay = 0;

    if (entry.hits > rule.delayAfter) {
      delay = (entry.hits - rule.delayAfter) * rule.delayMs;

      if (rule.maxDelayMs) {
        delay = Math.min(delay, rule.maxDelayMs);
      }
    }

    if (!delay) {
      next();
      return;
    }

    const waitSeconds = Math.ceil((entry.resetTime - now) / 1000);
    res.setHeader('Retry-After', waitSeconds.toString());
    res.setHeader('X-RateSlowdown-Delay', delay.toString());

    setTimeout(next, delay);
  };
};

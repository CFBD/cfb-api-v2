import cluster from 'node:cluster';
import {
  ConcurrencyBackend,
  ReleaseSlot,
  localConcurrencyBackend,
  WorkerConcurrencyClient,
} from '../concurrencyCoordinator';
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

let workerBackend: ConcurrencyBackend | undefined;
const defaultBackend = (): ConcurrencyBackend => {
  if (!cluster.isWorker) return localConcurrencyBackend();
  workerBackend ??= new WorkerConcurrencyClient(process);
  return workerBackend;
};

export const createConcurrencyLimit = (
  rules: ConcurrencyLimitRule[],
  keyGenerator: (
    req: Request,
    rule: ConcurrencyLimitRule,
  ) => string | null = defaultKeyGenerator,
  backend: ConcurrencyBackend = defaultBackend(),
) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
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

    if (req.aborted || res.destroyed || res.writableEnded) return;
    let release: ReleaseSlot | null;
    try {
      release = await backend.acquire(key, rule.maxConcurrent, rule.leaseMs);
    } catch {
      // Never fall back to independent worker counts after losing coordination.
      if (!res.destroyed && !res.writableEnded) {
        res.setHeader('Retry-After', '1');
        res
          .status(503)
          .send({ message: 'Request admission unavailable. Please retry.' });
      }
      return;
    }
    if (req.aborted || res.destroyed || res.writableEnded) {
      release?.();
      return;
    }
    if (!release) {
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

    res.once('finish', release);
    next();
  };
};

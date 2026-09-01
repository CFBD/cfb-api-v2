import { EventEmitter } from 'events';
import { getMockReq } from '@jest-mock/express';
import { Response } from 'express';

import { createConcurrencyLimit } from './concurrency';
import middlewares from './index';

const rule = {
  path: '/plays/stats',
  methods: ['GET'],
  maxConcurrent: 2,
  leaseMs: 1_000,
};

const createResponse = () => {
  const res = new EventEmitter() as unknown as Response;
  const setHeader = jest.fn();
  const status = jest.fn().mockReturnValue(res);
  const send = jest.fn().mockReturnValue(res);

  Object.assign(res, { setHeader, status, send });

  return { res, setHeader, status, send };
};

const createRequest = (userId: number, path = '/plays/stats', method = 'GET') =>
  getMockReq({
    method,
    path,
    route: { path },
    user: { id: userId },
  });

describe('per-user concurrency limit middleware', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('rejects requests above the configured per-user limit', () => {
    const middleware = createConcurrencyLimit([rule]);
    const first = createResponse();
    const second = createResponse();
    const third = createResponse();
    const firstNext = jest.fn();
    const secondNext = jest.fn();
    const thirdNext = jest.fn();

    middleware(createRequest(1), first.res, firstNext);
    middleware(createRequest(1), second.res, secondNext);
    middleware(createRequest(1), third.res, thirdNext);

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).toHaveBeenCalledTimes(1);
    expect(thirdNext).not.toHaveBeenCalled();
    expect(third.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(third.status).toHaveBeenCalledWith(429);
    expect(third.send).toHaveBeenCalledWith({
      message: 'Too many concurrent requests for this endpoint.',
    });
  });

  test('tracks each user independently', () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const second = createResponse();
    const firstNext = jest.fn();
    const secondNext = jest.fn();

    middleware(createRequest(1), first.res, firstNext);
    middleware(createRequest(2), second.res, secondNext);

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).toHaveBeenCalledTimes(1);
  });

  test('skips unmatched paths, methods, and unauthenticated requests', () => {
    const middleware = createConcurrencyLimit([rule]);
    const requests = [
      createRequest(1, '/games'),
      createRequest(1, '/plays/stats', 'POST'),
      getMockReq({ method: 'GET', path: '/plays/stats' }),
    ];

    for (const req of requests) {
      const response = createResponse();
      const next = jest.fn();

      middleware(req, response.res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.status).not.toHaveBeenCalled();
    }
  });

  test('uses the canonical matched route for path comparison', () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const second = createResponse();
    const request = createRequest(1, '/PlAyS/StAtS/');
    request.route = { path: '/plays/stats' };

    middleware(request, first.res, jest.fn());
    middleware(request, second.res, jest.fn());

    expect(second.status).toHaveBeenCalledWith(429);
  });

  test('releases a slot when the response finishes', () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const blocked = createResponse();
    const admitted = createResponse();
    const admittedNext = jest.fn();

    middleware(createRequest(1), first.res, jest.fn());
    middleware(createRequest(1), blocked.res, jest.fn());
    first.res.emit('finish');
    middleware(createRequest(1), admitted.res, admittedNext);

    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(admittedNext).toHaveBeenCalledTimes(1);
  });

  test('releases each request at most once', () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const second = createResponse();
    const blocked = createResponse();

    middleware(createRequest(1), first.res, jest.fn());
    first.res.emit('finish');
    middleware(createRequest(1), second.res, jest.fn());
    first.res.emit('finish');
    middleware(createRequest(1), blocked.res, jest.fn());

    expect(blocked.status).toHaveBeenCalledWith(429);
  });

  test('retains an abandoned slot until its safety lease expires', () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const blocked = createResponse();
    const admitted = createResponse();
    const admittedNext = jest.fn();

    middleware(createRequest(1), first.res, jest.fn());
    first.res.emit('close');
    middleware(createRequest(1), blocked.res, jest.fn());
    jest.advanceTimersByTime(rule.leaseMs);
    middleware(createRequest(1), admitted.res, admittedNext);

    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(admittedNext).toHaveBeenCalledTimes(1);
  });

  test.each([
    '/stats/player/season',
    '/stats/season/advanced',
    '/stats/game/advanced',
    '/stats/player/success/game',
  ])('limits concurrent requests to %s', (path) => {
    const first = createResponse();
    const second = createResponse();
    const third = createResponse();
    const firstNext = jest.fn();
    const secondNext = jest.fn();
    const thirdNext = jest.fn();

    middlewares.concurrencyLimit(createRequest(1, path), first.res, firstNext);
    middlewares.concurrencyLimit(
      createRequest(1, path),
      second.res,
      secondNext,
    );
    middlewares.concurrencyLimit(createRequest(1, path), third.res, thirdNext);

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).toHaveBeenCalledTimes(1);
    expect(thirdNext).not.toHaveBeenCalled();
    expect(third.status).toHaveBeenCalledWith(429);

    first.res.emit('finish');
    second.res.emit('finish');
  });

  test('runs before quota reservation in the standard middleware chain', () => {
    expect(middlewares.standard).toEqual([
      middlewares.rateSlowdown,
      middlewares.concurrencyLimit,
      middlewares.checkCallQuotas,
    ]);
  });
});

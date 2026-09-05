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

  test('rejects requests above the configured per-user limit', async () => {
    const middleware = createConcurrencyLimit([rule]);
    const first = createResponse();
    const second = createResponse();
    const third = createResponse();
    const firstNext = jest.fn();
    const secondNext = jest.fn();
    const thirdNext = jest.fn();

    await middleware(createRequest(1), first.res, firstNext);
    await middleware(createRequest(1), second.res, secondNext);
    await middleware(createRequest(1), third.res, thirdNext);

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).toHaveBeenCalledTimes(1);
    expect(thirdNext).not.toHaveBeenCalled();
    expect(third.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(third.status).toHaveBeenCalledWith(429);
    expect(third.send).toHaveBeenCalledWith({
      message: 'Too many concurrent requests for this endpoint.',
    });
  });

  test('tracks each user independently', async () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const second = createResponse();
    const firstNext = jest.fn();
    const secondNext = jest.fn();

    await middleware(createRequest(1), first.res, firstNext);
    await middleware(createRequest(2), second.res, secondNext);

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).toHaveBeenCalledTimes(1);
  });

  test('skips unmatched paths, methods, and unauthenticated requests', async () => {
    const middleware = createConcurrencyLimit([rule]);
    const requests = [
      createRequest(1, '/games'),
      createRequest(1, '/plays/stats', 'POST'),
      getMockReq({ method: 'GET', path: '/plays/stats' }),
    ];

    for (const req of requests) {
      const response = createResponse();
      const next = jest.fn();

      await middleware(req, response.res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.status).not.toHaveBeenCalled();
    }
  });

  test('uses the canonical matched route for path comparison', async () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const second = createResponse();
    const request = createRequest(1, '/PlAyS/StAtS/');
    request.route = { path: '/plays/stats' };

    await middleware(request, first.res, jest.fn());
    await middleware(request, second.res, jest.fn());

    expect(second.status).toHaveBeenCalledWith(429);
  });

  test('releases a slot when the response finishes', async () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const blocked = createResponse();
    const admitted = createResponse();
    const admittedNext = jest.fn();

    await middleware(createRequest(1), first.res, jest.fn());
    await middleware(createRequest(1), blocked.res, jest.fn());
    first.res.emit('finish');
    await middleware(createRequest(1), admitted.res, admittedNext);

    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(admittedNext).toHaveBeenCalledTimes(1);
  });

  test('releases each request at most once', async () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const second = createResponse();
    const blocked = createResponse();

    await middleware(createRequest(1), first.res, jest.fn());
    first.res.emit('finish');
    await middleware(createRequest(1), second.res, jest.fn());
    first.res.emit('finish');
    await middleware(createRequest(1), blocked.res, jest.fn());

    expect(blocked.status).toHaveBeenCalledWith(429);
  });

  test('retains an abandoned slot until its safety lease expires', async () => {
    const middleware = createConcurrencyLimit([{ ...rule, maxConcurrent: 1 }]);
    const first = createResponse();
    const blocked = createResponse();
    const admitted = createResponse();
    const admittedNext = jest.fn();

    await middleware(createRequest(1), first.res, jest.fn());
    first.res.emit('close');
    await middleware(createRequest(1), blocked.res, jest.fn());
    jest.advanceTimersByTime(rule.leaseMs);
    await middleware(createRequest(1), admitted.res, admittedNext);

    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(admittedNext).toHaveBeenCalledTimes(1);
  });

  test.each([
    '/live/plays',
    '/stats/player/season',
    '/stats/season/advanced',
    '/stats/game/advanced',
    '/stats/player/success/game',
  ])('limits concurrent requests to %s', async (path) => {
    const first = createResponse();
    const second = createResponse();
    const third = createResponse();
    const firstNext = jest.fn();
    const secondNext = jest.fn();
    const thirdNext = jest.fn();

    await middlewares.concurrencyLimit(
      createRequest(1, path),
      first.res,
      firstNext,
    );
    await middlewares.concurrencyLimit(
      createRequest(1, path),
      second.res,
      secondNext,
    );
    await middlewares.concurrencyLimit(
      createRequest(1, path),
      third.res,
      thirdNext,
    );

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).toHaveBeenCalledTimes(1);
    expect(thirdNext).not.toHaveBeenCalled();
    expect(third.status).toHaveBeenCalledWith(429);

    first.res.emit('finish');
    second.res.emit('finish');
  });

  test('shares live-play slots across games and route variants, independently per user', async () => {
    const responses = Array.from({ length: 5 }, createResponse);
    const next = responses.map(() => jest.fn());
    const requests = [1, 1, 1, 2, 1].map((userId, index) => {
      const req = createRequest(userId, '/LiVe/PlAyS/');
      req.route = { path: '/live/plays' };
      req.query = { gameId: String(index + 1) };
      return req;
    });

    for (let index = 0; index < 4; index += 1) {
      await middlewares.concurrencyLimit(
        requests[index],
        responses[index].res,
        next[index],
      );
    }

    expect(next[0]).toHaveBeenCalledTimes(1);
    expect(next[1]).toHaveBeenCalledTimes(1);
    expect(next[2]).not.toHaveBeenCalled();
    expect(responses[2].status).toHaveBeenCalledWith(429);
    expect(responses[2].setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(next[3]).toHaveBeenCalledTimes(1);

    responses[0].res.emit('finish');
    await middlewares.concurrencyLimit(requests[4], responses[4].res, next[4]);
    expect(next[4]).toHaveBeenCalledTimes(1);

    responses.forEach(({ res }) => res.emit('finish'));
  });

  test('returns 503 without running the endpoint when admission is unavailable', async () => {
    const backend = {
      acquire: jest.fn().mockRejectedValue(new Error('IPC unavailable')),
    };
    const middleware = createConcurrencyLimit([rule], undefined, backend);
    const response = createResponse();
    const next = jest.fn();
    await middleware(createRequest(1), response.res, next);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(next).not.toHaveBeenCalled();
  });

  test('releases admission if the request disconnected while waiting', async () => {
    const release = jest.fn();
    let grant!: (value: typeof release) => void;
    const backend = {
      acquire: jest.fn(
        () =>
          new Promise<typeof release>((resolve) => {
            grant = resolve;
          }),
      ),
    };
    const middleware = createConcurrencyLimit([rule], undefined, backend);
    const response = createResponse();
    const next = jest.fn();
    const req = createRequest(1);
    const admission = middleware(req, response.res, next);
    req.aborted = true;
    grant(release);
    await admission;
    expect(release).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  test('runs before quota reservation in the standard middleware chain', () => {
    expect(middlewares.standard).toEqual([
      middlewares.rateSlowdown,
      middlewares.concurrencyLimit,
      middlewares.checkCallQuotas,
    ]);
  });
});

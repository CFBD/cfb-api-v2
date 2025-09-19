import { getMockReq, getMockRes } from '@jest-mock/express';

import { createRateSlowdown } from './slowdown';

describe('rate slowdown middleware', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('skips when path does not match', () => {
    const middleware = createRateSlowdown([
      {
        path: '/stats/player/season',
        methods: ['GET'],
        windowMs: 1_000,
        delayAfter: 1,
        delayMs: 100,
      },
    ]);

    const req = getMockReq({
      path: '/other',
      method: 'GET',
      user: { id: 1, remainingCalls: 10, isAdmin: false },
    });
    const { res, next } = getMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('skips when request has no user', () => {
    const middleware = createRateSlowdown([
      {
        path: '/stats/player/season',
        methods: ['GET'],
        windowMs: 1_000,
        delayAfter: 1,
        delayMs: 100,
      },
    ]);

    const req = getMockReq({ path: '/stats/player/season', method: 'GET' });
    const { res, next } = getMockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('delays calls past the threshold', () => {
    const middleware = createRateSlowdown([
      {
        path: '/stats/player/season',
        methods: ['GET'],
        windowMs: 1_000,
        delayAfter: 2,
        delayMs: 100,
        maxDelayMs: 150,
      },
    ]);

    const requestFactory = () =>
      getMockReq({
        path: '/stats/player/season',
        method: 'GET',
        user: { id: 1, remainingCalls: 10, isAdmin: false },
      });

    const first = getMockRes();
    middleware(requestFactory(), first.res, first.next);
    expect(first.next).toHaveBeenCalledTimes(1);

    const second = getMockRes();
    middleware(requestFactory(), second.res, second.next);
    expect(second.next).toHaveBeenCalledTimes(1);

    const third = getMockRes();
    middleware(requestFactory(), third.res, third.next);
    expect(third.next).not.toHaveBeenCalled();
    expect(third.res.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(third.res.setHeader).toHaveBeenCalledWith(
      'X-RateSlowdown-Delay',
      '100',
    );

    jest.advanceTimersByTime(100);
    expect(third.next).toHaveBeenCalledTimes(1);

    const fourth = getMockRes();
    middleware(requestFactory(), fourth.res, fourth.next);
    expect(fourth.next).not.toHaveBeenCalled();
    expect(fourth.res.setHeader).toHaveBeenCalledWith(
      'X-RateSlowdown-Delay',
      '150',
    );

    jest.advanceTimersByTime(150);
    expect(fourth.next).toHaveBeenCalledTimes(1);
  });

  test('resets window after timeout', () => {
    const middleware = createRateSlowdown([
      {
        path: '/stats/player/season',
        methods: ['GET'],
        windowMs: 1_000,
        delayAfter: 1,
        delayMs: 100,
      },
    ]);

    const requestFactory = () =>
      getMockReq({
        path: '/stats/player/season',
        method: 'GET',
        user: { id: 2, remainingCalls: 10, isAdmin: false },
      });

    const first = getMockRes();
    middleware(requestFactory(), first.res, first.next);
    expect(first.next).toHaveBeenCalledTimes(1);

    const second = getMockRes();
    middleware(requestFactory(), second.res, second.next);
    expect(second.next).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);

    const third = getMockRes();
    middleware(requestFactory(), third.res, third.next);
    expect(third.next).toHaveBeenCalledTimes(1);
  });
});

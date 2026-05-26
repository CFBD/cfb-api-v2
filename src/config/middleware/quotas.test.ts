import { getMockReq, getMockRes } from '@jest-mock/express';
import { Request } from 'express';

import { authDb } from '../database';
import { ApiUser } from '../../globals';

type QuotaTestRequest = Request & {
  quotaReserved?: boolean;
  user?: ApiUser;
};

const refundSpy = jest.spyOn(authDb, 'one');
const reserveSpy = jest.spyOn(authDb, 'oneOrNone');

refundSpy.mockImplementation(() => Promise.resolve({ remaining_calls: 1000 }));
reserveSpy.mockImplementation(() => Promise.resolve({ remaining_calls: 999 }));

beforeEach(() => {
  jest.resetAllMocks();
  refundSpy.mockImplementation(() =>
    Promise.resolve({ remaining_calls: 1000 }),
  );
  reserveSpy.mockImplementation(() =>
    Promise.resolve({ remaining_calls: 999 }),
  );
});

import { ignoredPaths, checkCallQuotas, updateQuotas } from './quotas';

describe('check quotas tests', () => {
  test('calls next if no user', async () => {
    const req = getMockReq({ user: null });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(authDb.oneOrNone).not.toHaveBeenCalled();
  });

  test('calls next if user is admin', async () => {
    const req = getMockReq({
      user: { isAdmin: true, remainingCalls: 0 },
    });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(authDb.oneOrNone).not.toHaveBeenCalled();
  });

  test.each(ignoredPaths)('calls next if path is %s', async (path) => {
    const req = getMockReq({ user: { remainingCalls: 0 }, path });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(authDb.oneOrNone).not.toHaveBeenCalled();
  });

  test('reserves a call if user has calls remaining', async () => {
    const req = getMockReq({
      user: { id: 1, isAdmin: false, remainingCalls: 1 },
      path: '/plays',
    });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(authDb.oneOrNone).toHaveBeenCalledWith(
      expect.stringContaining('remaining_calls = remaining_calls - 1'),
      [1],
    );
    const quotaReq = req as QuotaTestRequest;

    expect(quotaReq.quotaReserved).toEqual(true);
    expect(quotaReq.user?.remainingCalls).toEqual(999);
    expect(next).toHaveBeenCalled();
  });

  test('returns 429 if user has no calls remaining', async () => {
    const req = getMockReq({
      user: { id: 1, isAdmin: false, remainingCalls: 0 },
      path: '/plays',
    });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(authDb.oneOrNone).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Monthly call quota exceeded.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 429 if atomic quota reservation finds no calls remaining', async () => {
    reserveSpy.mockImplementation(() => Promise.resolve(null));
    const req = getMockReq({
      user: { id: 1, isAdmin: false, remainingCalls: 1 },
      path: '/plays',
    });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Monthly call quota exceeded.',
    });
    const quotaReq = req as QuotaTestRequest;

    expect(quotaReq.user?.remainingCalls).toEqual(0);
    expect(quotaReq.quotaReserved).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 503 if quota reservation fails', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    reserveSpy.mockImplementation(() => Promise.reject(new Error('locked')));
    const req = getMockReq({
      user: { id: 1, isAdmin: false, remainingCalls: 1 },
      path: '/plays',
    });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Unable to verify call quota. Please retry later.',
    });
    expect(next).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('update quotas tests', () => {
  test('calls not refunded if no user', async () => {
    const req = getMockReq({ user: null });
    const { res, next } = getMockRes({ statusCode: 500 });

    await updateQuotas(req, res, next);
    await res.send({});

    expect(authDb.one).not.toHaveBeenCalled();
  });

  test('calls not refunded if quota was not reserved', async () => {
    const req = getMockReq({ user: { id: 1 } });
    const { res, next } = getMockRes({ statusCode: 500 });

    await updateQuotas(req, res, next);
    await res.send({});

    expect(authDb.one).not.toHaveBeenCalled();
  });

  test('calls not refunded if response is successful', async () => {
    const req = getMockReq({
      user: { id: 1, remainingCalls: 999 },
      quotaReserved: true,
    });
    const { res, next } = getMockRes({ statusCode: 200 });

    await updateQuotas(req, res, next);
    await res.send({});

    expect(authDb.one).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-CallLimit-Remaining', 999);
  });

  test('refunds reserved calls if response is unsuccessful', async () => {
    const req = getMockReq({
      user: { id: 1, remainingCalls: 999 },
      quotaReserved: true,
    });
    const { res, next } = getMockRes({ statusCode: 500 });

    await updateQuotas(req, res, next);
    await res.send({});

    expect(authDb.one).toHaveBeenCalledWith(
      expect.stringContaining('remaining_calls = (remaining_calls + 1)'),
      [1],
    );
    const quotaReq = req as QuotaTestRequest;

    expect(quotaReq.user?.remainingCalls).toEqual(1000);
    expect(res.setHeader).toHaveBeenCalledWith('X-CallLimit-Remaining', 1000);
  });
});

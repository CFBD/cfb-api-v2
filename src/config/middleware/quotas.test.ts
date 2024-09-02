import { getMockReq, getMockRes } from '@jest-mock/express';

import { authDb } from '../database';

const dbSpy = jest.spyOn(authDb, 'one');
dbSpy.mockImplementation(() => Promise.resolve({ remaining_calls: 1000 }));

beforeEach(() => {
  jest.resetAllMocks();
  dbSpy.mockImplementation(() => Promise.resolve({ remaining_calls: 1000 }));
});

import { ignoredPaths, checkCallQuotas, updateQuotas } from './quotas';

describe('check quotas tests', () => {
  test('calls next if no user', async () => {
    const req = getMockReq({ user: null });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('calls next if user is admin', async () => {
    const req = getMockReq({
      user: { isAdmin: true, remainingCalls: 0 },
    });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test.each(ignoredPaths)('calls next if path is %s', async (path) => {
    const req = getMockReq({ user: { remainingCalls: 0 }, path });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('calls next if user has calls remaining', async () => {
    const req = getMockReq({ user: { remainingCalls: 1 } });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('returns 429 if user has no calls remaining', async () => {
    const req = getMockReq({ user: { remainingCalls: 0 } });
    const { res, next } = getMockRes();

    await checkCallQuotas(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Monthly call quota exceeded.',
    });
  });
});

describe('update quotas tests', () => {
  test('calls not updated if no user', async () => {
    const req = getMockReq({ user: null });
    const { res, next } = getMockRes({ statusCode: 200 });

    await updateQuotas(req, res, next);
    res.send({});

    expect(authDb.one).not.toHaveBeenCalled();
  });

  test('calls not updated if unsuccessful response', async () => {
    const req = getMockReq({ user: { id: 1 } });
    const { res, next } = getMockRes({ statusCode: 500 });

    await updateQuotas(req, res, next);
    res.send({});

    expect(authDb.one).not.toHaveBeenCalled();
  });

  test.each(ignoredPaths)('calls not updated if path is %s', async (path) => {
    const req = getMockReq({ user: { id: 1 }, path });
    const { res, next } = getMockRes({ statusCode: 200 });

    await updateQuotas(req, res, next);
    res.send({});

    expect(authDb.one).not.toHaveBeenCalled();
  });

  test('calls not updated if successful response', async () => {
    const req = getMockReq({
      user: { id: 1, remainingCalls: 1000 },
      path: '/plays',
    });
    const { res, next } = getMockRes({ statusCode: 200 });

    await updateQuotas(req, res, next);
    res.send({});

    expect(authDb.one).toHaveBeenCalled();
  });

  test('calls remaining header if user exists', async () => {
    const req = getMockReq({
      user: { id: 1, remainingCalls: 1000 },
      path: '/plays',
    });
    const { res, next } = getMockRes({ statusCode: 200 });

    await updateQuotas(req, res, next);
    await res.send({});

    expect(res.setHeader).toHaveBeenCalledWith('X-CallLimit-Remaining', 1000);
  });
});

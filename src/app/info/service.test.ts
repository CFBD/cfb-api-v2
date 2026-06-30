import { ValidateError } from 'tsoa';

import { ApiUser } from '../../globals';

jest.mock('../../config/database', () => ({
  authDb: {
    oneOrNone: jest.fn(),
    manyOrNone: jest.fn(),
  },
}));

import { authDb } from '../../config/database';
import { getUserInfo, getUserUsage } from './service';
import { UserUsageApi } from './types';

const mockAuthDb = authDb as unknown as {
  oneOrNone: jest.Mock;
  manyOrNone: jest.Mock;
};

const now = new Date('2026-06-30T12:00:00.000Z');

const buildUser = (overrides: Partial<ApiUser> = {}): ApiUser => ({
  id: 123,
  username: 'test@example.com',
  patronLevel: 0,
  remainingCalls: 800,
  isAdmin: false,
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getUserInfo', () => {
  test('returns free account info for non-paying non-edu users', () => {
    const info = getUserInfo(buildUser(), now);

    expect(info).toEqual({
      patronLevel: 0,
      tierName: 'Free',
      monthlyLimit: 1000,
      remainingCalls: 800,
      usedCalls: 200,
      resetAt: '2026-07-01T00:00:00.000Z',
      sharedPool: true,
      products: ['cfb', 'cbb'],
      features: {
        adjustedMetrics: false,
        weather: false,
        scoreboard: false,
        livePlayByPlay: false,
        graphQl: false,
      },
    });
  });

  test('returns academic tier info for non-paying edu users', () => {
    const info = getUserInfo(
      buildUser({ username: 'student@school.edu', remainingCalls: 2500 }),
      now,
    );

    expect(info.tierName).toEqual('Academic');
    expect(info.monthlyLimit).toEqual(3000);
    expect(info.usedCalls).toEqual(500);
  });

  test('paid users take their Patreon tier even with edu email', () => {
    const info = getUserInfo(
      buildUser({
        username: 'student@school.edu',
        patronLevel: 2,
        remainingCalls: 12000,
      }),
      now,
    );

    expect(info.tierName).toEqual('Tier 2');
    expect(info.monthlyLimit).toEqual(30000);
    expect(info.features.livePlayByPlay).toEqual(true);
    expect(info.features.graphQl).toEqual(false);
  });

  test('admin users have unlimited quota and all features', () => {
    const info = getUserInfo(buildUser({ isAdmin: true }), now);

    expect(info.tierName).toEqual('Admin');
    expect(info.monthlyLimit).toBeNull();
    expect(info.remainingCalls).toBeNull();
    expect(info.usedCalls).toBeNull();
    expect(info.features).toEqual({
      adjustedMetrics: true,
      weather: true,
      scoreboard: true,
      livePlayByPlay: true,
      graphQl: true,
    });
  });
});

describe('getUserUsage', () => {
  test('returns bounded shared usage for all API calls by default', async () => {
    mockAuthDb.oneOrNone.mockResolvedValue({
      requests: 3,
      cfb_requests: 2,
      cbb_requests: 1,
      unique_endpoints: 2,
    });
    mockAuthDb.manyOrNone
      .mockResolvedValueOnce([
        {
          api_version: '2',
          endpoint: '/games',
          requests: 2,
          last_used_at: new Date('2026-06-30T11:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          api_version: 'cbb',
          endpoint: '/games',
          requested_at: new Date('2026-06-30T11:30:00.000Z'),
        },
      ]);

    const usage = await getUserUsage(
      buildUser(),
      undefined,
      undefined,
      undefined,
      now,
    );

    expect(usage).toEqual({
      window: {
        start: '2026-06-23T12:00:00.000Z',
        end: '2026-06-30T12:00:00.000Z',
      },
      api: UserUsageApi.All,
      totals: {
        requests: 3,
        cfbRequests: 2,
        cbbRequests: 1,
        uniqueEndpoints: 2,
      },
      topEndpoints: [
        {
          api: UserUsageApi.Cfb,
          endpoint: '/games',
          requests: 2,
          lastUsedAt: '2026-06-30T11:00:00.000Z',
        },
      ],
      recentRequests: [
        {
          api: UserUsageApi.Cbb,
          endpoint: '/games',
          requestedAt: '2026-06-30T11:30:00.000Z',
        },
      ],
    });
    expect(mockAuthDb.oneOrNone.mock.calls[0][1]).toEqual([
      123,
      '2026-06-23 12:00:00.000',
      '2026-06-30 12:00:00.000',
    ]);
    expect(mockAuthDb.manyOrNone.mock.calls[0][1]).toEqual([
      123,
      '2026-06-23 12:00:00.000',
      '2026-06-30 12:00:00.000',
      10,
    ]);
  });

  test('adds cbb api filter and bounded limit', async () => {
    mockAuthDb.oneOrNone.mockResolvedValue(null);
    mockAuthDb.manyOrNone.mockResolvedValue([]);

    await getUserUsage(buildUser(), 3, 25, UserUsageApi.Cbb, now);

    expect(mockAuthDb.oneOrNone.mock.calls[0][0]).toContain(
      "lower(trim(coalesce(api_version, ''))) = $4",
    );
    expect(mockAuthDb.oneOrNone.mock.calls[0][1]).toEqual([
      123,
      '2026-06-27 12:00:00.000',
      '2026-06-30 12:00:00.000',
      'cbb',
    ]);
    expect(mockAuthDb.manyOrNone.mock.calls[0][1]).toEqual([
      123,
      '2026-06-27 12:00:00.000',
      '2026-06-30 12:00:00.000',
      'cbb',
      25,
    ]);
  });

  test('rejects unbounded usage windows', async () => {
    await expect(getUserUsage(buildUser(), 32, 10)).rejects.toBeInstanceOf(
      ValidateError,
    );
  });
});

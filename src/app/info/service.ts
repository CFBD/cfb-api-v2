import { ValidateError } from 'tsoa';

import { authDb } from '../../config/database';
import { ApiUser } from '../../globals';
import {
  UserFeatureAccess,
  UserInfo,
  UserUsage,
  UserUsageApi,
  UserUsageEndpoint,
  UserUsageRecentRequest,
  UserUsageTotals,
} from './types';

type ApiTier = {
  name: string;
  monthlyLimit: number;
  featureLevel: number;
};

type UsageTotalsRow = {
  requests: number | string | null;
  cfb_requests: number | string | null;
  cbb_requests: number | string | null;
  unique_endpoints: number | string | null;
};

type UsageEndpointRow = {
  api_version: string | null;
  endpoint: string;
  requests: number | string;
  last_used_at: Date | string;
};

type UsageRecentRequestRow = {
  api_version: string | null;
  endpoint: string;
  requested_at: Date | string;
};

const freeTier: ApiTier = {
  name: 'Free',
  monthlyLimit: 1000,
  featureLevel: 0,
};

const academicTier: ApiTier = {
  name: 'Academic',
  monthlyLimit: 3000,
  featureLevel: 0,
};

const paidTiers: Record<number, ApiTier> = {
  1: { name: 'Tier 1', monthlyLimit: 5000, featureLevel: 1 },
  2: { name: 'Tier 2', monthlyLimit: 30000, featureLevel: 2 },
  3: { name: 'Tier 3', monthlyLimit: 75000, featureLevel: 3 },
  4: { name: 'Tier 4', monthlyLimit: 125000, featureLevel: 4 },
  5: { name: 'Tier 5', monthlyLimit: 200000, featureLevel: 5 },
  6: { name: 'Tier 6', monthlyLimit: 500000, featureLevel: 6 },
};

const defaultUsageDays = 7;
const maxUsageDays = 31;
const defaultUsageLimit = 10;
const maxUsageLimit = 50;

const products = ['cfb', 'cbb'];

const isEduEmail = (username: string): boolean => {
  const domain = username.trim().toLowerCase().split('@')[1];

  return !!domain && domain.endsWith('.edu');
};

const getTier = (user: ApiUser): ApiTier => {
  if (user.patronLevel > 0) {
    return (
      paidTiers[user.patronLevel] ?? {
        name: `Tier ${user.patronLevel}`,
        monthlyLimit: paidTiers[6].monthlyLimit,
        featureLevel: user.patronLevel,
      }
    );
  }

  if (isEduEmail(user.username)) {
    return academicTier;
  }

  return freeTier;
};

const getResetAt = (now = new Date()): string =>
  new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  ).toISOString();

const getFeatureAccess = (featureLevel: number): UserFeatureAccess => ({
  adjustedMetrics: featureLevel >= 1,
  weather: featureLevel >= 1,
  scoreboard: featureLevel >= 1,
  livePlayByPlay: featureLevel >= 2,
  graphQl: featureLevel >= 3,
});

const getAdminFeatureAccess = (): UserFeatureAccess => ({
  adjustedMetrics: true,
  weather: true,
  scoreboard: true,
  livePlayByPlay: true,
  graphQl: true,
});

export const getUserInfo = (user: ApiUser, now = new Date()): UserInfo => {
  if (user.isAdmin) {
    return {
      patronLevel: user.patronLevel,
      tierName: 'Admin',
      monthlyLimit: null,
      remainingCalls: null,
      usedCalls: null,
      resetAt: getResetAt(now),
      sharedPool: true,
      products,
      features: getAdminFeatureAccess(),
    };
  }

  const tier = getTier(user);

  return {
    patronLevel: user.patronLevel,
    tierName: tier.name,
    monthlyLimit: tier.monthlyLimit,
    remainingCalls: user.remainingCalls,
    usedCalls: Math.max(tier.monthlyLimit - user.remainingCalls, 0),
    resetAt: getResetAt(now),
    sharedPool: true,
    products,
    features: getFeatureAccess(tier.featureLevel),
  };
};

const validateIntegerRange = (
  field: string,
  value: number,
  min: number,
  max: number,
): void => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidateError(
      {
        [field]: {
          value,
          message: `${field} must be an integer between ${min} and ${max}`,
        },
      },
      'Validation error',
    );
  }
};

const normalizeUsageApi = (api?: UserUsageApi): UserUsageApi => {
  if (!api) {
    return UserUsageApi.All;
  }

  if (
    api !== UserUsageApi.All &&
    api !== UserUsageApi.Cfb &&
    api !== UserUsageApi.Cbb
  ) {
    throw new ValidateError(
      {
        api: {
          value: api,
          message: 'api must be one of all, cfb, or cbb',
        },
      },
      'Validation error',
    );
  }

  return api;
};

const resolveUsageWindow = (
  days: number,
  now = new Date(),
): { start: Date; end: Date } => {
  const end = now;
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  return { start, end };
};

const formatUtcTimestamp = (date: Date): string => date.toISOString();

const formatDbTimestamp = (date: Date): string =>
  date.toISOString().replace('T', ' ').replace('Z', '');

const getApiFilter = (
  api: UserUsageApi,
): { clause: string; value?: string } => {
  if (api === UserUsageApi.Cfb) {
    return { clause: "and trim(coalesce(api_version, '')) = $4", value: '2' };
  }

  if (api === UserUsageApi.Cbb) {
    return {
      clause: "and lower(trim(coalesce(api_version, ''))) = $4",
      value: 'cbb',
    };
  }

  return { clause: '' };
};

const mapApiVersion = (apiVersion: string | null): UserUsageApi => {
  const normalized = apiVersion?.trim().toLowerCase();

  if (normalized === 'cbb') {
    return UserUsageApi.Cbb;
  }

  return UserUsageApi.Cfb;
};

const mapTotals = (row?: UsageTotalsRow): UserUsageTotals => ({
  requests: Number(row?.requests ?? 0),
  cfbRequests: Number(row?.cfb_requests ?? 0),
  cbbRequests: Number(row?.cbb_requests ?? 0),
  uniqueEndpoints: Number(row?.unique_endpoints ?? 0),
});

const mapTopEndpoint = (row: UsageEndpointRow): UserUsageEndpoint => ({
  api: mapApiVersion(row.api_version),
  endpoint: row.endpoint,
  requests: Number(row.requests),
  lastUsedAt: formatUtcTimestamp(new Date(row.last_used_at)),
});

const mapRecentRequest = (
  row: UsageRecentRequestRow,
): UserUsageRecentRequest => ({
  api: mapApiVersion(row.api_version),
  endpoint: row.endpoint,
  requestedAt: formatUtcTimestamp(new Date(row.requested_at)),
});

export const getUserUsage = async (
  user: ApiUser,
  days = defaultUsageDays,
  limit = defaultUsageLimit,
  api?: UserUsageApi,
  now = new Date(),
): Promise<UserUsage> => {
  validateIntegerRange('days', days, 1, maxUsageDays);
  validateIntegerRange('limit', limit, 1, maxUsageLimit);

  const usageApi = normalizeUsageApi(api);
  const window = resolveUsageWindow(days, now);
  const apiFilter = getApiFilter(usageApi);
  const params: unknown[] = [
    user.id,
    formatDbTimestamp(window.start),
    formatDbTimestamp(window.end),
  ];

  if (apiFilter.value) {
    params.push(apiFilter.value);
  }

  const totals = await authDb.oneOrNone<UsageTotalsRow>(
    `
    SELECT
      COUNT(*)::int AS requests,
      SUM(CASE WHEN trim(coalesce(api_version, '')) = '2' THEN 1 ELSE 0 END)::int AS cfb_requests,
      SUM(CASE WHEN lower(trim(coalesce(api_version, ''))) = 'cbb' THEN 1 ELSE 0 END)::int AS cbb_requests,
      COUNT(DISTINCT endpoint)::int AS unique_endpoints
    FROM metrics
    WHERE user_id = $1
      AND "timestamp" >= $2::timestamp
      AND "timestamp" < $3::timestamp
      ${apiFilter.clause}
    `,
    params,
  );

  const topEndpoints = await authDb.manyOrNone<UsageEndpointRow>(
    `
    SELECT
      CASE
        WHEN lower(trim(coalesce(api_version, ''))) = 'cbb' THEN 'cbb'
        ELSE '2'
      END AS api_version,
      endpoint,
      COUNT(*)::int AS requests,
      MAX("timestamp") AS last_used_at
    FROM metrics
    WHERE user_id = $1
      AND "timestamp" >= $2::timestamp
      AND "timestamp" < $3::timestamp
      ${apiFilter.clause}
    GROUP BY 1, 2
    ORDER BY requests DESC, last_used_at DESC
    LIMIT $${params.length + 1}
    `,
    [...params, limit],
  );

  const recentRequests = await authDb.manyOrNone<UsageRecentRequestRow>(
    `
    SELECT
      CASE
        WHEN lower(trim(coalesce(api_version, ''))) = 'cbb' THEN 'cbb'
        ELSE '2'
      END AS api_version,
      endpoint,
      "timestamp" AS requested_at
    FROM metrics
    WHERE user_id = $1
      AND "timestamp" >= $2::timestamp
      AND "timestamp" < $3::timestamp
      ${apiFilter.clause}
    ORDER BY "timestamp" DESC
    LIMIT $${params.length + 1}
    `,
    [...params, limit],
  );

  return {
    window: {
      start: formatUtcTimestamp(window.start),
      end: formatUtcTimestamp(window.end),
    },
    api: usageApi,
    totals: mapTotals(totals ?? undefined),
    topEndpoints: topEndpoints.map(mapTopEndpoint),
    recentRequests: recentRequests.map(mapRecentRequest),
  };
};

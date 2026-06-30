export interface UserInfo {
  patronLevel: number;
  tierName: string;
  monthlyLimit: number | null;
  remainingCalls: number | null;
  usedCalls: number | null;
  resetAt: string;
  sharedPool: boolean;
  products: string[];
  features: UserFeatureAccess;
}

export interface UserFeatureAccess {
  adjustedMetrics: boolean;
  weather: boolean;
  scoreboard: boolean;
  livePlayByPlay: boolean;
  graphQl: boolean;
}

export enum UserUsageApi {
  All = 'all',
  Cfb = 'cfb',
  Cbb = 'cbb',
}

export interface UserUsageWindow {
  start: string;
  end: string;
}

export interface UserUsageTotals {
  requests: number;
  cfbRequests: number;
  cbbRequests: number;
  uniqueEndpoints: number;
}

export interface UserUsageEndpoint {
  api: UserUsageApi;
  endpoint: string;
  requests: number;
  lastUsedAt: string;
}

export interface UserUsageRecentRequest {
  api: UserUsageApi;
  endpoint: string;
  requestedAt: string;
}

export interface UserUsage {
  window: UserUsageWindow;
  api: UserUsageApi;
  totals: UserUsageTotals;
  topEndpoints: UserUsageEndpoint[];
  recentRequests: UserUsageRecentRequest[];
}

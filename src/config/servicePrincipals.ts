import spec from '../../build/swagger.json';
import { ApiPrincipalClass } from '../globals';

export interface ServicePrincipalIds {
  websitePage?: number;
  websiteExporter?: number;
}

export interface ApiOperation {
  method: string;
  path: string;
}

const pageOperations = new Set([
  'GET /teams',
  'GET /conferences',
  'GET /games',
  'GET /player/search',
  'GET /plays/types',
  'GET /plays/stats/types',
  'GET /ppa/predicted',
  'GET /teams/matchup',
  'GET /stats/season/advanced',
  'GET /player/usage',
  'GET /ppa/players/season',
  'GET /player/ppa/passing',
  'GET /ratings/sp',
  'GET /ratings/sp/conferences',
  'GET /metrics/wp',
  'GET /game/box/advanced',
]);

export const exporterDeniedPaths = new Set([
  '/games/weather',
  '/scoreboard',
  '/live/plays',
  '/game/box/advanced',
  '/wepa/team/season',
  '/wepa/players/passing',
  '/wepa/players/rushing',
  '/wepa/players/kicking',
  '/info',
]);

const parseId = (
  name: string,
  value: string | undefined,
): number | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
};

export const parseServicePrincipalIds = (
  env: NodeJS.ProcessEnv,
): ServicePrincipalIds => {
  const websitePage = parseId(
    'CFBD_PUBLIC_PAGE_SERVICE_USER_ID',
    env.CFBD_PUBLIC_PAGE_SERVICE_USER_ID,
  );
  const websiteExporter = parseId(
    'CFBD_EXPORTER_SERVICE_USER_ID',
    env.CFBD_EXPORTER_SERVICE_USER_ID,
  );

  if ((websitePage === undefined) !== (websiteExporter === undefined)) {
    throw new Error('Both CFBD website service user IDs must be configured.');
  }
  if (websitePage !== undefined && websitePage === websiteExporter) {
    throw new Error('CFBD website service user IDs must be distinct.');
  }
  if (
    env.NODE_ENV === 'production' &&
    (websitePage === undefined || websiteExporter === undefined)
  ) {
    throw new Error(
      'CFBD website service user IDs are required in production.',
    );
  }

  return { websitePage, websiteExporter };
};

let configuredIds: ServicePrincipalIds | undefined;

export const getServicePrincipalIds = (): ServicePrincipalIds => {
  configuredIds ??= parseServicePrincipalIds(process.env);
  return configuredIds;
};

export const validateServicePrincipalConfiguration = (): void => {
  getServicePrincipalIds();
};

export const classifyPrincipal = (
  userId: number,
  ids: ServicePrincipalIds = getServicePrincipalIds(),
): ApiPrincipalClass => {
  if (userId === ids.websitePage) {
    return 'websitePage';
  }
  if (userId === ids.websiteExporter) {
    return 'websiteExporter';
  }
  return 'individual';
};

interface OpenApiOperation {
  operationId?: unknown;
}

interface OpenApiDocument {
  paths?: Record<string, { get?: OpenApiOperation; [method: string]: unknown }>;
}

export const buildExporterOperations = (
  document: OpenApiDocument,
): Set<string> => {
  if (!document.paths || typeof document.paths !== 'object') {
    throw new Error('Generated OpenAPI document has no paths.');
  }

  const operationIds = new Set<string>();
  const operations = new Set<string>();
  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.startsWith('/') || path.includes('://') || path.includes('?')) {
      throw new Error(`Invalid OpenAPI path: ${path}`);
    }
    if (!item?.get) {
      continue;
    }
    if (
      typeof item.get.operationId !== 'string' ||
      item.get.operationId.trim() === '' ||
      operationIds.has(item.get.operationId)
    ) {
      throw new Error(`Invalid or duplicate GET operation ID for ${path}.`);
    }

    operationIds.add(item.get.operationId);
    if (!exporterDeniedPaths.has(path)) {
      operations.add(`GET ${path}`);
    }
  }

  return operations;
};

const exporterOperations = buildExporterOperations(spec);

export const isServiceOperationAllowed = (
  principalClass: ApiPrincipalClass,
  operation: ApiOperation,
): boolean => {
  if (principalClass === 'individual') {
    return true;
  }

  const key = `${operation.method.toUpperCase()} ${operation.path}`;
  return principalClass === 'websitePage'
    ? pageOperations.has(key)
    : exporterOperations.has(key);
};

export const getPageOperations = (): ReadonlySet<string> => pageOperations;
export const getExporterOperations = (): ReadonlySet<string> =>
  exporterOperations;

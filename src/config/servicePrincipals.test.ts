import {
  buildExporterOperations,
  classifyPrincipal,
  exporterDeniedPaths,
  getExporterOperations,
  getPageOperations,
  isServiceOperationAllowed,
  parseServicePrincipalIds,
} from './servicePrincipals';
import spec from '../../build/swagger.json';

describe('service principal configuration', () => {
  const configured = {
    NODE_ENV: 'production',
    CFBD_PUBLIC_PAGE_SERVICE_USER_ID: '101',
    CFBD_EXPORTER_SERVICE_USER_ID: '202',
  } as NodeJS.ProcessEnv;

  test('classifies configured IDs only', () => {
    const ids = parseServicePrincipalIds(configured);
    expect(classifyPrincipal(101, ids)).toBe('websitePage');
    expect(classifyPrincipal(202, ids)).toBe('websiteExporter');
    expect(classifyPrincipal(303, ids)).toBe('individual');
  });

  test.each([
    { ...configured, CFBD_EXPORTER_SERVICE_USER_ID: undefined },
    { ...configured, CFBD_EXPORTER_SERVICE_USER_ID: '101' },
    { ...configured, CFBD_EXPORTER_SERVICE_USER_ID: '0' },
    { ...configured, CFBD_EXPORTER_SERVICE_USER_ID: '1.5' },
    { NODE_ENV: 'production' },
  ] as NodeJS.ProcessEnv[])(
    'rejects invalid production configuration',
    (env) => {
      expect(() => parseServicePrincipalIds(env)).toThrow();
    },
  );
});

describe('service principal operation policy', () => {
  test('allows the exact public page operation set', () => {
    expect([...getPageOperations()].sort()).toEqual(
      [
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
      ].sort(),
    );
    expect(
      isServiceOperationAllowed('websitePage', {
        method: 'GET',
        path: '/teams',
      }),
    ).toBe(true);
    expect(
      isServiceOperationAllowed('websitePage', {
        method: 'GET',
        path: '/scoreboard',
      }),
    ).toBe(false);
    expect(
      isServiceOperationAllowed('websitePage', {
        method: 'POST',
        path: '/teams',
      }),
    ).toBe(false);
  });

  test('derives exporter GET scope and subtracts every explicit denial', () => {
    expect(getExporterOperations()).toContain('GET /games');
    expect(getExporterOperations()).toContain('GET /info/usage');
    for (const path of exporterDeniedPaths) {
      expect(getExporterOperations()).not.toContain(`GET ${path}`);
    }
    expect(getExporterOperations()).not.toContain('GET /player/ppa/passing');
    expect(
      isServiceOperationAllowed('websiteExporter', {
        method: 'POST',
        path: '/games',
      }),
    ).toBe(false);
    expect(
      isServiceOperationAllowed('websiteExporter', {
        method: 'GET',
        path: '/not-documented',
      }),
    ).toBe(false);
    expect(
      isServiceOperationAllowed('individual', {
        method: 'POST',
        path: '/not-documented',
      }),
    ).toBe(true);
  });

  test('matches every generated operation against the reviewed policies', () => {
    const generated = Object.entries(spec.paths).flatMap(([path, item]) =>
      Object.keys(item)
        .filter((method) =>
          ['get', 'post', 'put', 'patch', 'delete'].includes(method),
        )
        .map((method) => ({ method: method.toUpperCase(), path })),
    );
    const pageOperations = getPageOperations();
    const exporterOperations = getExporterOperations();

    for (const operation of generated) {
      const key = `${operation.method} ${operation.path}`;
      expect(isServiceOperationAllowed('websitePage', operation)).toBe(
        pageOperations.has(key),
      );
      expect(isServiceOperationAllowed('websiteExporter', operation)).toBe(
        exporterOperations.has(key),
      );
    }

    expect(generated).toHaveLength(74);
  });

  test('fails closed for malformed or duplicate OpenAPI operation metadata', () => {
    expect(() => buildExporterOperations({})).toThrow();
    expect(() =>
      buildExporterOperations({
        paths: {
          '/one': { get: { operationId: 'Duplicate' } },
          '/two': { get: { operationId: 'Duplicate' } },
        },
      }),
    ).toThrow();
  });
});

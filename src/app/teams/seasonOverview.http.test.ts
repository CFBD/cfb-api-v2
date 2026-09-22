import express from 'express';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { RegisterRoutes } from '../../../build/routes';
import spec from '../../../build/swagger.json';
import errorHandler from '../../config/errors';
import { getTeamSeasonOverview } from './seasonOverview';
import { isTeamSeasonSnapshotPayload } from './seasonOverviewPayload';
import fixture from './fixtures/team-season-snapshots/contract.json';
import { updateQuotas } from '../../config/middleware/quotas';
import { authDb } from '../../config/database';

jest.mock('./seasonOverview', () => ({ getTeamSeasonOverview: jest.fn() }));
jest.mock('../../config/auth', () => ({
  expressAuthentication: jest.fn(async () => ({ id: 1, remainingCalls: 999 })),
}));
jest.mock('../../config/middleware', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('../../config/middleware').default,
    standard: [],
  },
}));
const refund = jest.spyOn(authDb, 'one');
const payload = (() => {
  if (!isTeamSeasonSnapshotPayload(fixture, 2025, 'Michigan'))
    throw new Error('invalid fixture');
  return fixture;
})();
const withServer = async (run: (url: string) => Promise<void>) => {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      user: { id: 1, remainingCalls: 999 },
      quotaReserved: true,
    });
    next();
  });
  app.use(updateQuotas);
  RegisterRoutes(app);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};
beforeEach(() => {
  jest.mocked(getTeamSeasonOverview).mockReset();
  refund.mockReset();
  refund.mockResolvedValue({ remaining_calls: 1000 });
});
it('generated route serves the single overview object and preserves successful quota charge', async () => {
  const overview = {
    ...payload,
    teamId: 130,
    team: 'Michigan',
    season: 2025,
    record: { games: 13, wins: 9, losses: 4, ties: 0 },
    ratings: {
      core: {
        overall: { rating: 12.34, rank: 20 },
        offense: { rating: 8.12, rank: 15 },
        defense: { rating: 4.22, rank: 30 },
      },
      fpi: null,
      elo: 1625,
      srs: null,
      sp: null,
    },
  };
  jest
    .mocked(getTeamSeasonOverview)
    .mockResolvedValue({ status: 'found', overview });
  await withServer(async (url) => {
    const response = await fetch(
      `${url}/teams/season/overview?year=2025&team=Michigan`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(overview);
    expect(refund).not.toHaveBeenCalled();
  });
});
it.each([
  ['not-found', 404, 'Team season overview not found.'],
  ['unavailable', 503, 'Team season overview is temporarily unavailable.'],
] as const)(
  'maps %s through typed responders with no-store and quota refunds',
  async (status, code, message) => {
    jest.mocked(getTeamSeasonOverview).mockResolvedValue({ status });
    await withServer(async (url) => {
      const response = await fetch(
        `${url}/teams/season/overview?year=2025&team=Michigan`,
      );
      expect(response.status).toBe(code);
      expect(await response.json()).toEqual({ message });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(refund).toHaveBeenCalledTimes(1);
    });
  },
);
it.each([
  'year=2025&team=Michigan&refresh=true',
  'year=2025&team=Michigan&team=Texas',
  'year=2025&team[]=Michigan',
  'year=2025&team[name]=Michigan',
  'year=2025&year=2024&team=Michigan',
  'team=Michigan',
  'year=2025',
  'year=2.5&team=Michigan',
])(
  'rejects unsupported or malformed query %s before the reader',
  async (query) => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/teams/season/overview?${query}`);
      expect(response.status).toBe(400);
      expect(getTeamSeasonOverview).not.toHaveBeenCalled();
    });
  },
);
it('documents required input, nullable sections, the success model and unavailable responses', () => {
  expect(
    spec.components.schemas.TeamSeasonRankedRating.properties.rank,
  ).toMatchObject({ type: 'integer', nullable: true });
  expect(
    spec.components.schemas.TeamSeasonOverview.properties.ratings,
  ).toHaveProperty('properties.fpi');
  const operation = spec.paths['/teams/season/overview'].get;
  expect(operation.security).toEqual([{ apiKey: [] }]);
  expect(operation.parameters.map((p) => [p.name, p.required])).toEqual([
    ['year', true],
    ['team', true],
  ]);
  expect(operation.responses).toHaveProperty('200');
  expect(operation.responses).toHaveProperty('404');
  expect(operation.responses).toHaveProperty('503');
  expect(operation.responses['200']).toMatchObject({
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/TeamSeasonOverview' },
      },
    },
  });
});

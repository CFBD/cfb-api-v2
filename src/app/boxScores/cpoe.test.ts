import {
  CamelCasePlugin,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { DB } from '../../config/types/db';
import {
  getPlayerPassingForGame,
  getTeamPassingForGame,
} from '../passing/service';
import {
  mapCpoeProduction,
  isOptionalCpoeProduction,
  unavailableCpoe,
} from './cpoe';

jest.mock('../../config/database', () => ({ kdb: {} }));

it('documents one required CPOE contract without stored-snapshot schemas in generated OpenAPI', () => {
  const document = JSON.parse(
    readFileSync(join(process.cwd(), 'build/swagger.json'), 'utf8'),
  );
  const schemas = document.components.schemas;
  expect(
    Object.keys(schemas).filter((name) => /Snapshot.*Passing/.test(name)),
  ).toEqual([]);
  const production = schemas.PassingProduction;
  for (const key of ['cpoe', 'expectedCompletions', 'expectedCompletionRate']) {
    expect(production.properties[key].nullable).toBe(true);
    expect(production.required).toContain(key);
  }
  expect(production.properties.cpoeAttemptsAvailable.type).toBe('integer');
  for (const name of ['TeamSeasonOverview', 'PreviewTeamStatistics']) {
    expect(JSON.stringify(schemas[name].properties.passing)).toContain(
      '#/components/schemas/TeamPassingSeason',
    );
  }
});

it('matches snapshot scored-subset math, including zero/one probabilities and missing coverage', () => {
  const row = {
    attempts: 20,
    cpoeAttemptsAvailable: 3,
    cpoeCompletions: 2,
    expectedCompletions: 1.23456,
    cpoeVersions: 1,
    cpoeModelVersion: 'v1',
  };
  expect(mapCpoeProduction(row)).toEqual({
    cpoeAttemptsAvailable: 3,
    cpoeCompletions: 2,
    expectedCompletions: 1.235,
    expectedCompletionRate: 0.412,
    cpoe: 25.51,
  });
  for (const expectedCompletions of [0, 1]) {
    expect(
      mapCpoeProduction({
        ...row,
        cpoeAttemptsAvailable: 1,
        cpoeCompletions: 1,
        expectedCompletions,
      }).cpoe,
    ).toBe(100 * (1 - expectedCompletions));
  }
  expect(mapCpoeProduction({})).toEqual(unavailableCpoe());
  expect(mapCpoeProduction({ ...row, cpoeVersions: 2 })).toEqual(
    unavailableCpoe(),
  );
  expect(isOptionalCpoeProduction({ attempts: 20 })).toBe(true);
  expect(isOptionalCpoeProduction({ attempts: 20, cpoe: 0 })).toBe(false);
  const projected = { attempts: 20, ...mapCpoeProduction(row) };
  expect(isOptionalCpoeProduction(projected)).toBe(true);
  expect(
    isOptionalCpoeProduction({ ...projected, cpoeModelVersion: 'v1' }),
  ).toBe(true);
  expect(
    isOptionalCpoeProduction({ ...projected, cpoeModelVersion: ' ' }),
  ).toBe(false);
  expect(
    isOptionalCpoeProduction({
      attempts: 20,
      ...unavailableCpoe(),
      cpoeModelVersion: 'v1',
    }),
  ).toBe(false);
});

it('fallback calculators use the current prediction view for team and player passing', async () => {
  const queries: string[] = [];
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
    log: (event) => {
      if (event.level === 'query') queries.push(event.query.sql);
    },
  });
  await getPlayerPassingForGame(db, 123);
  await getTeamPassingForGame(db, 123);
  expect(queries).toHaveLength(2);
  for (const query of queries) {
    expect(query.match(/join "pass_play_cpoe_current"/g)).toHaveLength(1);
    expect(query).toContain('"cpoe_predictions" as materialized');
    expect(query).toContain('sum("cp"."completion_probability")');
    expect(query).toContain('"cp"."game_id" = "game"."id"');
    expect(query).toContain('"game"."id" =');
  }
  expect(queries[1]).toContain('as "defense_cpoe_attempts_available"');
  await db.destroy();
});
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CamelCasePlugin,
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import { DB } from '../../config/types/db';
import { SeasonType } from '../enums';
import { getElo } from './service';

jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: { with: jest.fn() },
}));

const compiledQueries: CompiledQuery<unknown>[] = [];
const database = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  plugins: [new CamelCasePlugin()],
  log: (event) => {
    if (event.level === 'query') compiledQueries.push(event.query);
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  compiledQueries.length = 0;
  (kdb.with as jest.Mock).mockImplementation(database.with.bind(database));
});

afterAll(async () => {
  await database.destroy();
});

test('preseason selects the opener before excluding missing ratings', async () => {
  await expect(
    getElo(2026, undefined, undefined, undefined, undefined, true),
  ).resolves.toEqual([]);

  const { sql, parameters } = compiledQueries[0];
  expect(sql).toContain(
    'row_number() over(partition by "game"."season", "team"."id" order by "game"."start_date" asc, "game"."id" asc)',
  );
  expect(sql).toContain('"game_team"."start_elo" as "elo"');
  expect(sql).not.toContain('"game"."status"');
  expect(sql).not.toContain('"game"."week"');
  expect(sql).not.toContain('"game_team"."end_elo"');
  expect(sql).not.toContain('"game_team"."start_elo" is not null');
  expect(sql).toMatch(
    /from "elos" where "row_num" = \$\d+ and "elo" is not null$/,
  );
  expect(parameters).toEqual(['regular', 2026, 1]);
});

test('preseason retains historical team and season-specific conference filters', async () => {
  await getElo(undefined, undefined, undefined, 'Ohio State', 'B1G', true);

  const { sql, parameters } = compiledQueries[0];
  expect(sql).toContain('"conference_team"."start_year" <= "game"."season"');
  expect(sql).toContain('"conference_team"."end_year" is null');
  expect(sql).toContain('"conference_team"."end_year" >= "game"."season"');
  expect(sql).toContain('lower("team"."school")');
  expect(sql).toContain('lower("conference"."abbreviation")');
  expect(parameters).toEqual(['regular', 'ohio state', 'b1g', 1]);
});

test.each([undefined, SeasonType.Regular, SeasonType.Both])(
  'preseason accepts season type %s',
  async (seasonType) => {
    await getElo(2026, undefined, seasonType, undefined, undefined, true);
    expect(compiledQueries).toHaveLength(1);
    expect(compiledQueries[0].parameters).toContain('regular');
  },
);

test.each([0, 1, 3])(
  'preseason rejects week %s before querying',
  async (week) => {
    await expect(
      getElo(2026, week, undefined, undefined, undefined, true),
    ).rejects.toBeInstanceOf(ValidateError);
    expect(kdb.with).not.toHaveBeenCalled();
  },
);

test.each([
  SeasonType.Postseason,
  SeasonType.AllStar,
  SeasonType.SpringRegular,
  SeasonType.SpringPostseason,
])('preseason rejects incompatible season type %s', async (seasonType) => {
  await expect(
    getElo(2026, undefined, seasonType, undefined, undefined, true),
  ).rejects.toMatchObject({
    status: 400,
    fields: { seasonType: { value: seasonType } },
  });
  expect(kdb.with).not.toHaveBeenCalled();
});

test('omitted and false preseason retain the latest completed postgame query', async () => {
  await getElo(2026);
  await getElo(2026, undefined, undefined, undefined, undefined, false);

  expect(compiledQueries[0]).toMatchObject({
    sql: compiledQueries[1].sql,
    parameters: compiledQueries[1].parameters,
  });
  const { sql, parameters } = compiledQueries[0];
  expect(sql).toContain('"game_team"."end_elo" as "elo"');
  expect(sql).toContain('"game_team"."end_elo" is not null');
  expect(sql).toContain('"game"."status" =');
  expect(sql).toContain(
    'rank() over(partition by "game"."season", "team"."school" order by "game"."start_date" desc)',
  );
  expect(parameters).toEqual(['completed', 2026, 1]);
});

test('postgame week requests retain the regular-season cutoff', async () => {
  await getElo(2026, 3);
  expect(compiledQueries[0].sql).toContain('"game"."week" <=');
  expect(compiledQueries[0].parameters).toEqual([
    'completed',
    2026,
    3,
    'regular',
    1,
  ]);
});

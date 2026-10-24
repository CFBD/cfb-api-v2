import {
  CamelCasePlugin,
  CompiledQuery,
  DatabaseConnection,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  QueryResult,
} from 'kysely';

import { DB } from '../../config/types/db';
import { mapCpoeProduction, unavailableCpoe } from '../boxScores/cpoe';
import { DivisionClassification } from '../enums';
import fixture from '../teams/fixtures/team-season-snapshots/contract.json';
import {
  readTeamPassingSeasonSnapshots,
  teamPassingSeasonSnapshotQuery,
  unsnapshottedPassingQuery,
} from './teamSeasonSnapshots';

jest.mock('../../config/database', () => ({ kdb: {} }));

const isProbe = (sql: string) => sql.includes('inner join "pass_play"');

function database(snapshots: unknown[], passing: unknown[] = []) {
  const queries: CompiledQuery[] = [];
  class FixtureDriver extends DummyDriver {
    async acquireConnection(): Promise<DatabaseConnection> {
      return {
        async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
          queries.push(query);
          // Test-only rows for the real typed query compiler; no PostgreSQL I/O.
          const rows = isProbe(query.sql) ? passing : snapshots;
          return { rows: rows as R[] };
        },
        async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
          yield { rows: [] };
        },
      };
    }
  }
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new FixtureDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
  return { db, queries };
}

const scored = mapCpoeProduction({
  cpoeAttemptsAvailable: 3,
  cpoeCompletions: 2,
  expectedCompletions: 1.23456,
  cpoeVersions: 1,
  cpoeModelVersion: 'accepted-v1',
});
const storedPassing = () => {
  const passing = structuredClone(fixture.passing);
  Object.assign(passing.offense, scored, { cpoeModelVersion: 'accepted-v1' });
  Object.assign(passing.defense, scored, { cpoeModelVersion: 'accepted-v1' });
  return passing;
};
const snapshotRow = (overrides: Record<string, unknown> = {}) => ({
  season: 2025,
  team_id: 130,
  school: 'Michigan',
  conference: 'B1G',
  snapshot_team_id: 130,
  format_version: 1,
  passing: storedPassing(),
  selected_cpoe_model_version: 'accepted-v1',
  ...overrides,
});
const fbs = DivisionClassification.FBS;

describe('team-season passing snapshot query', () => {
  it('reads only stored passing for a season scope', async () => {
    const { db } = database([]);
    const { sql, parameters } = teamPassingSeasonSnapshotQuery(db, {
      year: 2026,
      classification: fbs,
    }).compile();
    expect(sql).toContain('"snapshot"."payload" -> \'passing\' as "passing"');
    expect(sql).toMatch(/"game"\."season" = \$\d+/);
    expect(sql).toMatch(/"ct"\."start_year" <= \$\d+/);
    expect(sql).toContain('"conference"."division" =');
    expect(sql).toContain(
      'order by "participant"."season" desc, "participant"."school"',
    );
    expect(sql).not.toContain('"play"');
    expect(sql).not.toContain('pass_play_cpoe');
    expect(parameters).toEqual(expect.arrayContaining([2026, fbs]));
    expect(parameters).not.toContain(undefined);
    await db.destroy();
  });

  it('uses each participant season and the team/conference filters', async () => {
    const { db } = database([]);
    const { sql, parameters } = teamPassingSeasonSnapshotQuery(db, {
      team: 'Michigan',
      conference: 'B1G',
      classification: DivisionClassification.FCS,
    }).compile();
    expect(sql).toContain('"ct"."start_year" <= "participant"."season"');
    expect(sql).toContain('"ct"."end_year" >= "participant"."season"');
    expect(sql).not.toContain('"game"."season" =');
    expect(sql).toContain('lower("team"."school") =');
    expect(sql).toContain('lower("team"."abbreviation") =');
    expect(sql).toContain('lower("conference"."name") =');
    expect(parameters).toEqual(
      expect.arrayContaining(['michigan', 'b1g', DivisionClassification.FCS]),
    );
    await db.destroy();
  });

  it('probes only the listed team-seasons and stops at the first pass', async () => {
    const { db } = database([]);
    const { sql, parameters } = unsnapshottedPassingQuery(db, [
      { teamId: 130, season: 2010 },
      { teamId: 194, season: 2011 },
    ]).compile();
    expect(sql).toMatch(
      /\("gt"\."team_id", "game"\."season"\) in \(\(\$\d+, \$\d+\), \(\$\d+, \$\d+\)\)/,
    );
    expect(sql).toContain('"play"."offense_id" = "gt"."team_id"');
    expect(sql).toContain('"play"."defense_id" = "gt"."team_id"');
    expect(sql).toMatch(/limit \$\d+$/);
    expect(parameters).toEqual([130, 2010, 194, 2011, 1]);
    await db.destroy();
  });
});

describe('readTeamPassingSeasonSnapshots', () => {
  it.each([
    ['accepted-v1', scored],
    ['replacement-v2', unavailableCpoe()],
    [null, unavailableCpoe()],
  ])(
    'projects stored CPOE through the selected model (%s)',
    async (selected, expected) => {
      const { db, queries } = database([
        snapshotRow({ selected_cpoe_model_version: selected }),
      ]);
      const result = await readTeamPassingSeasonSnapshots(db, {
        year: 2025,
        classification: fbs,
      });
      expect(result.status).toBe('found');
      if (result.status !== 'found') throw new Error('Expected rows');
      const [row] = result.rows;
      expect(Object.keys(row)).toEqual([
        'season',
        'team',
        'conference',
        'offense',
        'defense',
      ]);
      expect(row).toMatchObject({
        season: 2025,
        team: 'Michigan',
        conference: 'B1G',
        offense: { ...fixture.passing.offense, ...expected },
        defense: { ...fixture.passing.defense, ...expected },
      });
      expect(row.offense).not.toHaveProperty('cpoeModelVersion');
      expect(row.defense).not.toHaveProperty('cpoeModelVersion');
      // Nested location keys survive the result plugin unchanged.
      expect(row.offense.locations).toEqual(fixture.passing.offense.locations);
      expect(queries).toHaveLength(1);
      await db.destroy();
    },
  );

  it('omits stored seasons without passing and skips the probe when complete', async () => {
    const { db, queries } = database([
      snapshotRow({ season: 2026, passing: null }),
      snapshotRow(),
    ]);
    const result = await readTeamPassingSeasonSnapshots(db, {
      team: 'Michigan',
      classification: fbs,
    });
    expect(result).toMatchObject({
      status: 'found',
      rows: [{ season: 2025 }],
    });
    expect(queries).toHaveLength(1);
    await db.destroy();
  });

  it('omits unsnapshotted team-seasons that have no pass plays', async () => {
    const { db, queries } = database([
      snapshotRow(),
      snapshotRow({
        season: 2010,
        snapshot_team_id: null,
        format_version: null,
        passing: null,
      }),
    ]);
    const result = await readTeamPassingSeasonSnapshots(db, {
      team: 'Michigan',
      classification: fbs,
    });
    expect(result).toMatchObject({ status: 'found', rows: [{ season: 2025 }] });
    expect(queries).toHaveLength(2);
    expect(isProbe(queries[1].sql)).toBe(true);
    expect(queries[1].parameters).toEqual([130, 2010, 1]);
    await db.destroy();
  });

  it('reports an unsnapshotted team-season with pass plays', async () => {
    const { db } = database(
      [
        snapshotRow({
          team_id: 2,
          school: 'Abilene Christian',
          snapshot_team_id: null,
          format_version: null,
          passing: null,
        }),
      ],
      [{ team_id: 2, season: 2025 }],
    );
    await expect(
      readTeamPassingSeasonSnapshots(db, {
        year: 2025,
        classification: DivisionClassification.FCS,
      }),
    ).resolves.toEqual({
      status: 'incomplete',
      reason: 'missing-snapshot',
      season: 2025,
      teamId: 2,
    });
    await db.destroy();
  });

  it.each([
    ['unsupported-format', { format_version: 2 }],
    ['invalid-payload', { passing: { ...storedPassing(), offense: {} } }],
    ['invalid-payload', { passing: { ...storedPassing(), season: 2024 } }],
    ['invalid-payload', { school: 'Michigan State' }],
    ['conference-mismatch', { conference: 'Big Ten' }],
  ])('reports %s without returning partial rows', async (reason, overrides) => {
    const { db, queries } = database([snapshotRow(), snapshotRow(overrides)]);
    await expect(
      readTeamPassingSeasonSnapshots(db, { year: 2025, classification: fbs }),
    ).resolves.toEqual({
      status: 'incomplete',
      reason,
      season: 2025,
      teamId: 130,
    });
    expect(queries).toHaveLength(1);
    await db.destroy();
  });
});

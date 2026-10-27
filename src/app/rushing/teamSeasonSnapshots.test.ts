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
import { DivisionClassification } from '../enums';
import fixture from '../teams/fixtures/team-season-snapshots/contract.json';
import {
  readTeamRushingSeasonSnapshots,
  teamRushingSeasonSnapshotQuery,
  unsnapshottedRushingQuery,
} from './teamSeasonSnapshots';

jest.mock('../../config/database', () => ({ kdb: {} }));

const isProbe = (sql: string) => sql.includes('inner join "rush_play"');

function database(snapshots: unknown[], rushing: unknown[] = []) {
  const queries: CompiledQuery[] = [];
  class FixtureDriver extends DummyDriver {
    async acquireConnection(): Promise<DatabaseConnection> {
      return {
        async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
          queries.push(query);
          // Test-only rows for the real typed query compiler; no PostgreSQL I/O.
          const rows = isProbe(query.sql) ? rushing : snapshots;
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

const snapshotRow = (overrides: Record<string, unknown> = {}) => ({
  season: 2025,
  team_id: 130,
  school: 'Michigan',
  conference: 'B1G',
  snapshot_team_id: 130,
  format_version: 1,
  rushing: structuredClone(fixture.rushing),
  ...overrides,
});
const fbs = DivisionClassification.FBS;

describe('team-season rushing snapshot query', () => {
  it('reads only stored rushing for a season scope', async () => {
    const { db } = database([]);
    const { sql, parameters } = teamRushingSeasonSnapshotQuery(db, {
      year: 2026,
      classification: fbs,
    }).compile();
    expect(sql).toContain('"snapshot"."payload" -> \'rushing\' as "rushing"');
    expect(sql).toMatch(/"game"\."season" = \$\d+/);
    expect(sql).toMatch(/"ct"\."start_year" <= \$\d+/);
    expect(sql).toContain('"conference"."division" =');
    expect(sql).toContain(
      'order by "participant"."season" desc, "participant"."school"',
    );
    expect(sql).not.toContain('"play"');
    expect(parameters).toEqual(expect.arrayContaining([2026, fbs]));
    expect(parameters).not.toContain(undefined);
    await db.destroy();
  });

  it('uses each participant season and the team/conference filters', async () => {
    const { db } = database([]);
    const { sql, parameters } = teamRushingSeasonSnapshotQuery(db, {
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

  it('probes only the listed team-seasons and stops at the first rush', async () => {
    const { db } = database([]);
    const { sql, parameters } = unsnapshottedRushingQuery(db, [
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

describe('readTeamRushingSeasonSnapshots', () => {
  it('serves the stored row with the participant identity', async () => {
    const { db, queries } = database([snapshotRow()]);
    const result = await readTeamRushingSeasonSnapshots(db, {
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
    expect(row).toEqual({
      season: 2025,
      team: 'Michigan',
      conference: 'B1G',
      offense: fixture.rushing.offense,
      defense: fixture.rushing.defense,
    });
    // Nested direction keys survive the result plugin unchanged.
    expect(row.offense.directions).toEqual(fixture.rushing.offense.directions);
    expect(queries).toHaveLength(1);
    await db.destroy();
  });

  it('omits stored seasons without rushing and skips the probe when complete', async () => {
    const { db, queries } = database([
      snapshotRow({ season: 2026, rushing: null }),
      snapshotRow(),
    ]);
    const result = await readTeamRushingSeasonSnapshots(db, {
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

  it('omits unsnapshotted team-seasons that have no rush plays', async () => {
    const { db, queries } = database([
      snapshotRow(),
      snapshotRow({
        season: 2010,
        snapshot_team_id: null,
        format_version: null,
        rushing: null,
      }),
    ]);
    const result = await readTeamRushingSeasonSnapshots(db, {
      team: 'Michigan',
      classification: fbs,
    });
    expect(result).toMatchObject({ status: 'found', rows: [{ season: 2025 }] });
    expect(queries).toHaveLength(2);
    expect(isProbe(queries[1].sql)).toBe(true);
    expect(queries[1].parameters).toEqual([130, 2010, 1]);
    await db.destroy();
  });

  it('reports an unsnapshotted team-season with rush plays', async () => {
    const { db } = database(
      [
        snapshotRow({
          team_id: 2,
          school: 'Abilene Christian',
          snapshot_team_id: null,
          format_version: null,
          rushing: null,
        }),
      ],
      [{ team_id: 2, season: 2025 }],
    );
    await expect(
      readTeamRushingSeasonSnapshots(db, {
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
    [
      'invalid-payload',
      { rushing: { ...structuredClone(fixture.rushing), offense: {} } },
    ],
    [
      'invalid-payload',
      { rushing: { ...structuredClone(fixture.rushing), season: 2024 } },
    ],
    ['invalid-payload', { school: 'Michigan State' }],
    ['conference-mismatch', { conference: 'Big Ten' }],
  ])('reports %s without returning partial rows', async (reason, overrides) => {
    const { db, queries } = database([snapshotRow(), snapshotRow(overrides)]);
    await expect(
      readTeamRushingSeasonSnapshots(db, { year: 2025, classification: fbs }),
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

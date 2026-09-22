// Invoked only by the services manual comparison runner; never by Jest/startup.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { DivisionClassification } from '../src/app/enums';
import { isTeamSeasonSnapshotPayload } from '../src/app/teams/seasonOverviewPayload';

async function main() {
  if (!process.env.PGOPTIONS?.includes('default_transaction_read_only=on'))
    throw new Error('Read-only PostgreSQL settings required');
  const input: unknown = JSON.parse(readFileSync(0, 'utf8'));
  if (
    typeof input !== 'object' ||
    !input ||
    !('season' in input) ||
    typeof input.season !== 'number' ||
    !Number.isSafeInteger(input.season) ||
    input.season <= 0 ||
    !('team' in input) ||
    typeof input.team !== 'string' ||
    !('division' in input) ||
    !('payload' in input) ||
    !isTeamSeasonSnapshotPayload(input.payload, input.season, input.team)
  )
    throw new Error('Invalid comparison input');
  const division = Object.values(DivisionClassification).find(
    (v) => v === input.division,
  );
  if (!division) throw new Error('Unsupported classification');
  const { closeDatabaseConnections } = await import('../src/config/database');
  try {
    const { getAdvancedStats } = await import('../src/app/stats/service');
    const { getPredictedPointsAddedByPlayerSeason } = await import(
      '../src/app/metrics/service'
    );
    const { getPlayerUsage } = await import('../src/app/players/service');
    const { getTeamPassingBySeason } = await import(
      '../src/app/passing/service'
    );
    const { getTeamRushingBySeason } = await import(
      '../src/app/rushing/service'
    );
    const single = <T>(rows: T[]): T | null => {
      if (rows.length > 1) throw new Error('Ambiguous baseline team-season');
      return rows[0] ?? null;
    };
    const players = <
      T extends { id: string; name: string | null; position: string | null },
    >(
      rows: T[],
    ) => {
      const compare = (a: string | null, b: string | null) =>
        a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
      return [...rows].sort(
        (a, b) =>
          compare(a.id, b.id) ||
          compare(a.name, b.name) ||
          compare(a.position, b.position),
      );
    };
    const check = async (
      section: string,
      expected: unknown,
      calculate: () => Promise<unknown>,
    ) => {
      console.log('Comparing', section);
      const started = performance.now();
      // Compare the JSON wire values: legacy NaN/Infinity serialize to null.
      const actual: unknown = JSON.parse(JSON.stringify(await calculate()));
      const differences: string[] = [];
      const walk = (a: unknown, b: unknown, path: string): void => {
        if (isDeepStrictEqual(a, b)) return;
        if (
          a &&
          b &&
          typeof a === 'object' &&
          typeof b === 'object' &&
          Array.isArray(a) === Array.isArray(b)
        ) {
          const left = new Map(Object.entries(a));
          const right = new Map(Object.entries(b));
          for (const key of new Set([...left.keys(), ...right.keys()])) {
            if (!left.has(key) || !right.has(key))
              differences.push(`${path}.${key}`);
            else walk(left.get(key), right.get(key), `${path}.${key}`);
          }
        } else differences.push(path);
      };
      walk(expected, actual, section);
      console.log({
        section,
        match: differences.length === 0,
        baselineMs: Math.round(performance.now() - started),
        differenceCount: differences.length,
        paths: differences.slice(0, 30),
      });
      if (differences.length) process.exitCode = 1;
    };
    const { season, team, payload } = input;
    await check('advanced', payload.advanced, async () =>
      single(
        await getAdvancedStats(
          season,
          team,
          false,
          undefined,
          undefined,
          division,
        ),
      ),
    );
    await check('players.ppa', players(payload.players.ppa), async () =>
      players(
        await getPredictedPointsAddedByPlayerSeason(season, undefined, team),
      ),
    );
    await check('players.usage', players(payload.players.usage), async () =>
      players(await getPlayerUsage(season, undefined, undefined, team)),
    );
    await check('passing', payload.passing, async () =>
      single(
        await getTeamPassingBySeason(
          season,
          undefined,
          team,
          undefined,
          division,
        ),
      ),
    );
    await check('rushing', payload.rushing, async () =>
      single(
        await getTeamRushingBySeason(
          season,
          undefined,
          team,
          undefined,
          division,
        ),
      ),
    );
  } finally {
    await closeDatabaseConnections();
  }
}
main().catch((error: unknown) => {
  console.error(
    'Baseline error code',
    typeof error === 'object' &&
      error &&
      'code' in error &&
      typeof error.code === 'string' &&
      /^[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : 'CALCULATION_FAILED',
  );
  console.error(
    'Baseline comparison failed. Check database access and query timeout. No snapshots were written.',
  );
  process.exitCode = 1;
});

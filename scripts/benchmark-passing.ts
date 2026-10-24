// Opt-in read-only endpoint benchmark. Never imported by API startup or Jest.
import { performance } from 'node:perf_hooks';

import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import type { DB } from '../src/config/types/db';
import { DivisionClassification, SeasonType } from '../src/app/enums';

async function main(): Promise<void> {
  const options = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    if (argument === '--help') {
      console.log(
        'pnpm benchmark:passing --years=2025,2026 --season-types=regular,postseason,both --samples=1',
      );
      return;
    }
    const match = /^--(years|season-types|samples)=(.+)$/.exec(argument);
    if (!match || options.has(match[1])) throw new Error('Invalid arguments');
    options.set(match[1], match[2]);
  }
  const years = (options.get('years') ?? '2025,2026').split(',').map(Number);
  const seasonTypes = (options.get('season-types') ?? 'regular').split(',');
  const samples = Number(options.get('samples') ?? 1);
  if (
    years.length > 5 ||
    years.some(
      (year) => !Number.isSafeInteger(year) || year < 1 || year > 32767,
    ) ||
    !Number.isSafeInteger(samples) ||
    samples < 1 ||
    samples > 10 ||
    seasonTypes.some(
      (value) => !Object.values(SeasonType).some((type) => type === value),
    )
  )
    throw new Error('Invalid years, season types or sample count');

  await import('dotenv/config');
  const { getDatabaseConnectionConfigs } = await import(
    '../src/config/databaseConfig'
  );
  const { closeDatabaseConnections } = await import('../src/config/database');
  const { getTeamPassingBySeason } = await import('../src/app/passing/service');
  const { primary } = getDatabaseConnectionConfigs();
  let queryMs: number[] = [];
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        ...primary,
        port: Number(primary.port),
        max: 1,
        connectionTimeoutMillis: 5000,
        options:
          '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=1000',
        application_name: 'passing-season-readonly-benchmark',
      }),
    }),
    plugins: [new CamelCasePlugin()],
    log: (event) => {
      if (event.level === 'query' && /^(select|with) /i.test(event.query.sql))
        queryMs.push(Math.round(event.queryDurationMillis));
    },
  });
  try {
    const safety = await db
      .selectNoFrom((eb) =>
        eb
          .fn<string>('current_setting', [
            eb.val('default_transaction_read_only'),
          ])
          .as('readOnly'),
      )
      .executeTakeFirstOrThrow();
    if (safety.readOnly !== 'on')
      throw new Error('Read-only connection required');
    for (const year of years) {
      for (const value of seasonTypes) {
        const seasonType = Object.values(SeasonType).find(
          (type) => type === value,
        );
        if (!seasonType) throw new Error('Unsupported season type');
        for (let sample = 1; sample <= samples; sample++) {
          queryMs = [];
          const started = performance.now();
          try {
            const rows = await getTeamPassingBySeason(
              year,
              seasonType,
              undefined,
              undefined,
              DivisionClassification.FBS,
              db,
            );
            const response = JSON.stringify(rows);
            console.log(
              JSON.stringify({
                year,
                seasonType,
                sample,
                rows: rows.length,
                elapsedMs: Math.round(performance.now() - started),
                queryMs,
                responseBytes: Buffer.byteLength(response),
                scoredOffense: rows.reduce(
                  (sum, row) => sum + row.offense.cpoeAttemptsAvailable,
                  0,
                ),
                scoredDefense: rows.reduce(
                  (sum, row) => sum + row.defense.cpoeAttemptsAvailable,
                  0,
                ),
              }),
            );
          } catch (error) {
            console.log(
              JSON.stringify({
                year,
                seasonType,
                sample,
                elapsedMs: Math.round(performance.now() - started),
                queryMs,
                error: error instanceof Error ? error.message : 'Query failed',
              }),
            );
            process.exitCode = 1;
          }
        }
      }
    }
  } finally {
    await db.destroy();
    await closeDatabaseConnections();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Benchmark failed');
  process.exitCode = 1;
});

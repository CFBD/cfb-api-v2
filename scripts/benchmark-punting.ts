// Opt-in uncached reader benchmark; never imported by API startup or Jest.
import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';

import { Pool } from 'pg';
import {
  CamelCasePlugin,
  Kysely,
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  PostgresDialect,
  UnknownRow,
} from 'kysely';

import type { DB } from '../src/config/types/db';

interface Sample {
  rows: number;
  bytes: number;
  queries: number;
  databaseMs: number;
  queryMs: number[];
  projectionMs: number;
  responseMs: number;
  rssBytes: number;
}

const p95 = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
const round = (value: number) => Number(value.toFixed(2));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'pnpm benchmark:punting --year=2025 --week=9 --team=Michigan [--samples=30]',
    );
    return;
  }
  const options = new Map<string, string>();
  for (const arg of args) {
    const match = /^--(year|week|team|samples)=(.+)$/.exec(arg);
    if (!match || options.has(match[1]))
      throw new Error(
        'Expected unique --year, --week, --team and optional --samples values',
      );
    options.set(match[1], match[2]);
  }
  const year = Number(options.get('year')),
    week = Number(options.get('week'));
  const team = options.get('team')?.trim(),
    samples = Number(options.get('samples') ?? 30);
  if (
    !Number.isSafeInteger(year) ||
    year < 1 ||
    !Number.isSafeInteger(week) ||
    week < 0 ||
    !team ||
    !Number.isSafeInteger(samples) ||
    samples < 30
  )
    throw new Error(
      'Supply a positive year, nonnegative week, team and at least 30 samples',
    );
  // Validate CLI before loading local configuration. All feature reads use
  // read-only repeatable-read transactions; no HTTP/auth/quota writes occur.
  await import('dotenv/config');
  const { closeDatabaseConnections } = await import('../src/config/database');
  const { getDatabaseConnectionConfigs } = await import(
    '../src/config/databaseConfig'
  );
  const { primary } = getDatabaseConnectionConfigs();
  const kdb = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        ...primary,
        port: Number(primary.port),
        max: 5,
        connectionTimeoutMillis: 10_000,
        options:
          '-c default_transaction_read_only=on -c statement_timeout=15000',
      }),
    }),
    plugins: [new CamelCasePlugin()],
  });
  const { getPuntingPlays, getPlayerPuntingBySeason, getTeamPuntingBySeason } =
    await import('../src/app/punting/service');
  const cases = [
    {
      name: 'nationwide-week-plays',
      read: getPuntingPlays,
      query: { year, week },
      budgetMs: 1000,
    },
    {
      name: 'team-season-plays',
      read: getPuntingPlays,
      query: { year, team },
      budgetMs: 1000,
    },
    {
      name: 'season-players',
      read: getPlayerPuntingBySeason,
      query: { year },
      budgetMs: 2000,
    },
    {
      name: 'season-teams',
      read: getTeamPuntingBySeason,
      query: { year },
      budgetMs: 2000,
    },
  ];
  console.log(
    JSON.stringify({
      dataset: { year, week, team },
      samples,
      environment: {
        node: process.version,
        arch: process.arch,
        cpus: cpus().length,
        cpu: cpus()[0]?.model,
        memoryBytes: totalmem(),
        workers: 1,
      },
      mode: 'uncached in-process readers, primary DB, read-only transactions, including serialization',
    }),
  );
  try {
    const safety = await kdb
      .selectNoFrom((eb) =>
        eb
          .fn<string>('current_setting', [
            eb.val('default_transaction_read_only'),
          ])
          .as('readOnly'),
      )
      .executeTakeFirstOrThrow();
    if (safety.readOnly !== 'on')
      throw new Error('Benchmark requires read-only connections');
    console.log(JSON.stringify({ connectionReadOnly: safety.readOnly }));
    for (const scenario of cases) {
      const run = async (): Promise<Sample> => {
        let queries = 0,
          databaseMs = 0,
          projectionMs = 0;
        const queryMs: number[] = [];
        const starts = new Map<object, { at: number; index: number }>();
        const plugin: KyselyPlugin = {
          transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
            starts.set(args.queryId, {
              at: performance.now(),
              index: queries++,
            });
            return args.node;
          },
          async transformResult(
            args: PluginTransformResultArgs,
          ): Promise<QueryResult<UnknownRow>> {
            const start = starts.get(args.queryId)!;
            const elapsed = performance.now() - start.at;
            databaseMs += elapsed;
            queryMs[start.index] = elapsed;
            starts.delete(args.queryId);
            return args.result;
          },
        };
        const started = performance.now();
        const rows = await scenario.read(
          scenario.query,
          kdb.withPlugin(plugin),
          (ms) => {
            projectionMs = ms;
          },
        );
        const bytes = Buffer.byteLength(JSON.stringify(rows));
        return {
          rows: rows.length,
          bytes,
          queries,
          databaseMs,
          queryMs,
          projectionMs,
          responseMs: performance.now() - started,
          rssBytes: process.memoryUsage().rss,
        };
      };
      for (const concurrency of [1, 4]) {
        const measured: Sample[] = [];
        while (measured.length < samples)
          measured.push(
            ...(await Promise.all(
              Array.from(
                { length: Math.min(concurrency, samples - measured.length) },
                run,
              ),
            )),
          );
        const latency = p95(measured.map((sample) => sample.responseMs));
        const passed =
          measured.every((sample) => sample.rows > 0 && sample.queries <= 3) &&
          latency <= scenario.budgetMs * (concurrency === 4 ? 2 : 1);
        console.log(
          JSON.stringify({
            case: scenario.name,
            concurrency,
            samples: measured.length,
            rows: Math.max(...measured.map((s) => s.rows)),
            responseBytes: Math.max(...measured.map((s) => s.bytes)),
            selectQueries: Math.max(...measured.map((s) => s.queries)),
            databaseP95Ms: round(p95(measured.map((s) => s.databaseMs))),
            selectP95Ms: measured[0].queryMs.map((_, index) =>
              round(p95(measured.map((s) => s.queryMs[index]))),
            ),
            projectionP95Ms: round(p95(measured.map((s) => s.projectionMs))),
            responseP95Ms: round(latency),
            rssFirstBytes: measured[0].rssBytes,
            rssPeakBytes: Math.max(...measured.map((s) => s.rssBytes)),
            passed,
          }),
        );
        if (!passed) process.exitCode = 1;
      }
    }
  } finally {
    await Promise.all([kdb.destroy(), closeDatabaseConnections()]);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message.replace(
          /\b(?:postgres(?:ql)?|https?):\/\/\S+/gi,
          '[redacted URL]',
        )
      : 'Punting benchmark failed',
  );
  process.exitCode = 1;
});

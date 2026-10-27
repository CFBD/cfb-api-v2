# Passing team-season performance

Verified October 20, 2026. API deployment has not been performed.

## Snapshot read (October 23)

Whole-season requests (no season type, or `both`) now read stored passing from
`team_season_snapshot`, which services builds with the same aggregate
expressions. The live read below remains for `regular`/`postseason` and for any
scope where an in-scope team-season with pass plays lacks a valid snapshot.
Since October 26 only FBS requests read snapshots; other divisions read live,
because non-FBS snapshots are not rebuilt daily. The 2025 FCS snapshots then
dated from September 22.

Read-only observations through the actual service, from a workstation about
35 ms from the database; times include JSON transfer:

| Scope                         | Snapshot path         | Live path (same scope) |
| ----------------------------- | --------------------- | ---------------------- |
| 2025 FBS, all teams           | 0.44–0.74 s (3 runs)  | 13.9–14.1 s with `010` |
| 2026 FBS, all teams           | 0.41–0.49 s (3 runs)  | 11.9–14.4 s with `010` |
| Michigan 2026 / Ohio St. 2025 | 0.12 s / 0.11 s       | 0.82 s / 0.92 s        |
| Michigan, every season        | 0.57 s (incl. probe)  | 2.3 s                  |
| 2010 FBS (no pass plays)      | 1.7 s (absence probe) | not measured           |

The snapshot SELECT estimates far below `jit_above_cost`, so it needs no JIT
setting or transaction. Proving that unsnapshotted team-seasons have no pass
plays scans their games' plays; that probe only runs when such participants
exist (historical seasons, or real gaps such as 34 FCS teams in 2025, which
fall back to live).

Michigan 2026 and Ohio State 2025 matched the live read exactly. Michigan 2025
did not: its October 7 snapshot counts 135 offensive CPOE attempts, but only 71
of those stored predictions still match their game's current source
fingerprint. Across 2025, 92 of 360 games with predictions had source changes
after scoring, touching 88 teams; 2025 FBS snapshots hold 21,611 scored
attempts per side against 15,662 current. Those 92 games were rescored on
October 23 (services exec plan 33); afterwards every 2025 prediction was
current, 2025 FBS snapshots summed to the 21,611 stored predictions per side,
and snapshot and live reads matched for Michigan across all seasons. The 75
stale 2026 games were rescored the same day; 2026 FBS snapshots then summed to
all 23,222 stored predictions per side, and snapshot and live reads matched
for teams in the rescored games.

## Query change

The previous team-season query left-joined a materialized CPOE prediction set
to every passing attempt. The live planner estimated one outer row for a 2026
regular-season scope containing 53,885 team/pass rows. An analyzed Michigan
sample scanned 303 predictions 308 times. The all-team query exceeded a
30-second diagnostic statement limit. Current-view evaluation additionally
scans stored predictions per game; materializing its output alone did not fix
the season-wide join.

The endpoint now reads participants, ordinary aggregates and current predictions
separately within one read-only, repeatable-read transaction. Participant scope
is established before joining plays. Stored prediction keys narrow the game set
before invoking the current view; no probability is read from the raw storage
table. CPOE is matched to game participants and accumulated by season, school,
conference and side in memory. Ordinary SQL aggregate expressions and public
response fields are unchanged. The existing CPOE mapper still suppresses mixed
models and rounds only the final scored-subset totals/rates.

All three reads use the same snapshot. A failed prediction read fails the
request. The follow-up optimization disables JIT within this transaction using
`set_config('jit', 'off', true)`; commit or rollback restores the pooled
connection's prior setting. It adds no cache, index, background job, model
selection, production data write or timeout increase. The companion services
migration `010-current-read-performance-up.sql` optimizes the current view;
that migration is prepared and tested but has not been applied to production.

## Initial full-season observations

The opt-in benchmark called the actual service against the locally configured
primary database with read-only connections, a 30-second limit per statement,
and a one-second lock timeout. It included projection and JSON serialization,
but not HTTP authentication, gateway overhead or concurrent load. Samples were
sequential, with no simultaneous live measurements. These are observations,
not latency percentiles or an SLA; cache warmth and database load vary.

All requests used the default FBS classification and no team/conference filter.

| Year | Season type | Teams |  Elapsed | Scored attempts per side |
| ---- | ----------- | ----: | -------: | -----------------------: |
| 2025 | regular     |   136 | 31.609 s |                   14,260 |
| 2025 | postseason  |    82 |  2.489 s |                    1,572 |
| 2025 | both        |   136 | 25.108 s |                   15,832 |
| 2026 | regular     |   138 | 28.606 s |                   18,374 |
| 2026 | postseason  |     0 |  0.412 s |                        0 |
| 2026 | both        |   138 | 27.306 s |                   18,374 |

The 2026 postseason was empty at verification time. Scored counts reflect
current valid predictions, not complete scoring coverage. These initial
observations preceded the current-view and transaction-local JIT optimizations.

## Optimized-view observations

The companion services migration bounds play access to each game, validates
both participants' FBS affiliations once per game, and probes stored predictions
by play primary key. It preserves the exact source-v2 fingerprint, publication
policy and eligibility checks. The service also avoids JIT compilation inside
its transaction. Production schema and deployments remain unchanged.

Read-only benchmarks expanded the migration's exact SELECT inside the actual
service queries. These include projection/serialization but exclude transaction
begin/commit and HTTP/gateway overhead. Regular and both-season entries use
three sequential samples; postseason uses one. The first sample follows an
existing-view baseline read in the same repeatable-read snapshot, so cache
warmth and live load affect these observations.

| Year | Season type | Teams | Median total | Total range     | Median CPOE read |
| ---- | ----------- | ----: | -----------: | --------------- | ---------------: |
| 2025 | regular     |   136 |     13.863 s | 12.942–16.150 s |          5.132 s |
| 2025 | both        |   136 |     13.951 s | 13.885–14.075 s |          4.947 s |
| 2025 | postseason  |    82 |      1.727 s | single sample   |          0.809 s |
| 2026 | regular     |   138 |     10.947 s | 10.680–12.644 s |          5.757 s |
| 2026 | both        |   138 |     13.021 s | 11.857–14.443 s |          6.459 s |
| 2026 | postseason  |     0 |      0.260 s | single sample   |          0.060 s |

Scored attempts per side match the initial table. All six first-sample responses
matched the existing-view responses exactly, including every CPOE and ordinary
field. Repeated samples measure timing only. The benchmark also verified that
all eight current-view columns match for 15,832 predictions in 2025 and 18,374
in 2026, and the transaction-local JIT setting resets on the pooled connection. Ordinary
aggregates now consume much of the remaining time; deployed HTTP/load checks
are still needed after the operator applies the view migration and deploys.

## Correctness and local checks

Read-only repeatable-read comparisons passed for all 136 teams in the 2025
regular season and all 138 teams in 2026. Every ordinary field, including
location and advanced metrics, matched the pre-change calculation with its
prediction lookup disabled. Independent PostgreSQL aggregation of the canonical
current predictions and season-valid participants matched all five public CPOE
fields for both sides of every team.

Michigan's 2025 and 2026 both-season responses, plus its team-only cross-season
response, matched the original endpoint in full on the same snapshot. These
checks included 157, 303 and 460 current predictions respectively. No database
data, model policy, schema or persistent settings were changed.

All 659 tests across 51 suites pass. The API/documentation build, documentation
checks, type checking, changed-file lint and formatting pass. Repository-wide
lint retains 73 errors outside the changed
files. Regression coverage includes all three query scopes, historical
affiliations, FCS, nullable conferences, duplicate membership multiplicity,
scored-subset weighting, zero probabilities, defensive sign, mixed-model
suppression, read-only repeatable-read configuration and prediction failures.

Raw comparison summaries are in `/tmp/passing-parity-*.json`.
Local checks used `pnpm_config_verify_deps_before_run=false` to avoid an
unavailable pnpm store. The docs build used `ZUDOKU_DISABLE_UPDATE_CHECK=1` to
avoid the CLI's unwritable global update-check cache; documentation generation
and verification still ran in full.

## Reproduce

Use the configured primary connection and run outside Jest:

```sh
pnpm benchmark:passing --years=2025,2026 --season-types=regular,postseason,both --samples=1
```

The benchmark explicitly enforces read-only connections, allows at most five
years and ten samples, reports query timings/row counts/response bytes, and
fails on query errors. `--help` does not load credentials. It does not deploy,
change data or alter persistent database settings. If pnpm's local dependency
verification cannot access its store, use the installed binary directly:

```sh
node_modules/.bin/ts-node scripts/benchmark-passing.ts --years=2025,2026 --season-types=regular,postseason,both --samples=1
```

Raw benchmark observations are saved in `/tmp/passing-final-benchmark.jsonl`.
The earlier investigation is in
`/tmp/passing-timeout-investigation-20261020/findings.md`.

The follow-up view comparison is run from the sibling `cfbd-services` checkout:

```sh
CPOE_API_ROOT=/absolute/path/to/cfb-api-v2 CPOE_BENCHMARK_SAMPLES=3 \
  node packages/games/test/cpoe-current-view-benchmark.cjs --confirm-read-only-benchmark
```

That opt-in harness expands the exact proposed view SELECT inside actual API
queries, compares complete responses on one repeatable-read snapshot and
verifies transaction-local JIT configuration does not leak. It also compares
all current prediction columns for both seasons. It performs no production DDL.
The services migration guide documents the synthetic regression fixture,
manual application and view-only rollback. Raw follow-up observations are in
`/tmp/cpoe-view-benchmark.jsonl`.

## Player-season read (October 26)

Full-season `GET /passing/players/season` requests (`year`, default `fbs`
classification) ran longer than 300 seconds and failed at the role's 60-second
statement timeout. The CPOE left join to the materialized current predictions
was estimated at 420 rows (about 26,000 actual) against about 1,900 attempts
(tens of thousands actual), so PostgreSQL chose a nested loop over every pair.
The same plan appears with the view definition before services migration `018`.
Since October 25, at most about 10% of these requests completed.

The read now aggregates CPOE separately from the predictions outward (see
[`ARCHITECTURE.md`](../../ARCHITECTURE.md#passing-player-seasons)). Read-only
observations through the actual service, from the same workstation:

| Scope                          | Before            | After             |
| ------------------------------ | ----------------- | ----------------- |
| 2026 FBS, all passers          | over 300 s        | 5.9–6.3 s         |
| 2025 FBS, all passers          | not completed     | 7.2 s             |
| SEC 2026 / B1G 2025 / MAC 2026 | 7.8 / 7.3 / 6.1 s | 7.5 / 9.1 / 2.8 s |
| Wyoming / Stanford 2026        | 0.7 / 0.7 s       | 1.1 / 1.8 s       |
| FCS 2026, all passers          | 4.6 s             | 6.4 s             |

Complete responses were identical between the two implementations for ten
scopes: four single teams and four conferences (one of each regular season
only), one passer without a year and the 2026 FCS season. Single-team
scopes pay about 0.5–1 second for the extra reads. A first attempt that joined
team before aggregating rescanned all resolved predictions once per team
(about 50 million comparisons, 13.7 seconds), so aggregation happens per team
ID and model version before any dimension join.

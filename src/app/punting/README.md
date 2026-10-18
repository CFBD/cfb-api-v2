# Punting

Read-only punting routes for the services repository's
`docs/prd/punting-data-api.md`. Dated benchmark and backfill evidence lives in
`cfbd-services/docs/references/punting-phase6-read-only-audit.md`.

## Routes

```text
/punting/plays?year=2026&week=0
/punting/plays?year=2026&team=Michigan
/punting/players/season?year=2026&playerId=4685151
/punting/players/games?year=2026&team=Michigan
/punting/teams/season?year=2026&conference=B1G
/punting/teams/games?year=2026&week=1
```

Routes follow the passing and rushing shape: plays, player season/game rows,
and team season/game rows with `punting` and `returning` objects. Plays require
`gameId`, or `year` with a week, a team filter, `punterId` or `returnerId`.
Aggregates require `year`. Defaults are FBS and regular plus postseason.

Play filters (`team`, `conference`, `classification`) match either participant;
`puntingTeam` and `receivingTeam` match one side. Aggregate filters match the
represented team. Players group by event-time team, never a current roster.
Aggregates omit games without play-by-play.

## Read model

Punts are normalized and attributed at write time by the services punting
writer (live post-processing and `utils/backfill-punting`), which stores one
row per punt in `punt_play`. No-play and non-punt candidates are not stored.
A season is available only after it has been backfilled.

`service.ts` validates scope and uses three bulk SELECTs in one read-only
repeatable-read transaction: game participants (with a stored-punt existence
check), season affiliations, and stored punts by `punt_play.game_id`. Plays
join play, drive, play type and athlete names for detail. Player aggregates
read `punt_play` plus athlete names; team aggregates read `punt_play` alone.
Aggregates omit games without stored punts, so seasons that have not been
backfilled return no rows rather than zeros. Empty scopes stop early. No text
parsing, role reads or provider calls occur at request time.

For aggregates, `readPunts` returns internal `PuntEvent` rows: the stored facts
`aggregate.ts` reduces plus player-credit and possession fields. Those internal
fields are intentionally not part of the API contract.

Reads are capped at 10,000 stored punts and serialization at 48 MiB. Overflow
returns a 400 asking for a narrower filter, never a prefix.

## Definitions

Kick and end yard lines run from the punting goal (0) to the receiving goal
(100). Net punt yards are gross minus credited team returns minus a 20-yard
touchback deduction, not final field-position change. Signed zero and negative
yards remain meaningful. Yardage totals are null when no value is known, and
each average uses its own `*Available` denominator, rounded to one decimal.
`inside20` requires final receiving possession strictly above 80 and no
touchback; it is not the provider `In 20`.

On team rows, `returning` describes opponent punts and the team's returns.
Player `punting` requires individual punt credit for yardage, though a blocked
kicker can still report `blocked`. Player `returning` includes only individual
return allocation plus fielding and block outcomes.

## Generated core

`core/` is generated from `cfbd-services/packages/punting/src/` and shared JSON
fixtures. Do not edit these copies. The API no longer uses it at request time;
tests use it to build `punt_play` fixture rows the way the services writer
does. To update, change the services source, then run there:

```bash
node scripts/sync-punting-core.js --api-dir ../cfb-api-v2
node scripts/sync-punting-core.js --api-dir ../cfb-api-v2 --check
```

`core/provenance.json` pins the revision, parser version and content hashes.
Normal API builds and tests need no sibling checkout:

```bash
pnpm test src/app/punting
pnpm typecheck
pnpm build
```

## Read-only benchmark

```bash
pnpm benchmark:punting --help
pnpm benchmark:punting --year=2026 --week=1 --team=Michigan --samples=30
```

The opt-in runner loads local DB configuration after argument validation and
invokes uncached readers in read-only transactions, with no HTTP, auth, quota
or provider calls. Cases cover nationwide week plays, team season plays, season
players and season teams, each at concurrency one and four. A dedicated
five-connection pool enforces read-only mode, a 15-second statement timeout and
a ten-second connection timeout. NDJSON output records row and byte counts,
SELECT count, per-query, projection and response P95, and RSS. Empty samples
or more than three SELECTs fail verification. `selectP95Ms` follows the
three-query order above; per-query percentiles are independent and should not
be summed. Per-query times are measured in the client, so they include
network round trips, result transfer and event-loop delay, not only database
execution. `projectionP95Ms` is play projection for plays and the aggregate
reduction for players and teams.

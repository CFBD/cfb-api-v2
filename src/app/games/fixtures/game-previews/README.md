# Schedule and preview verification

Verified: 2026-09-25, working tree based on `518e620`, Node 22.22.1.
No production writes, source rebuilds, or deployment.

`calendar-source.json` contains selected original ESPN calendar rows from the
existing import URL for 2002, 2024, and 2026. Adjacent windows end at :59 and
start at :00; the normalized exclusive end adds one minute. Fixtures cover DST
and January postseason. Production calendar rows span 2002–2026, with no
non-minute regular/postseason boundaries. The known 2024 overlap remains an
unavailable default selection, not a data repair. Current upstream dates can
differ from stored dates; selection uses storage.

The owner identified `dbhub_cfb` source `default` as production. Read-only checks
confirmed DraftKings 888888, Bovada 999999, calendar and provider-row uniqueness,
and snapshot format 1. The sample contained 238 current-season snapshots and
154 current-season kicking rows, with no passing/rushing adjusted rows.
Connector SELECT grants were verified; application-role privileges were not
inferred from that account.

Tests reuse the complete existing team snapshot contract fixture. Player cases
cover receiving backs, rushing QBs, independent PPA/usage sources, zero/null
participation, conflicts, caps, and previous-season exclusion. No fixture claims
current roster membership or complete historical source coverage.

## Local checks

Disposable PostgreSQL 16 verified typed UTC text reads and timestamp bindings
under both UTC and America/New_York. A five-second `pg_sleep` was canceled by
the feature's three-second transaction-local timeout at 3,004 ms in both runs.
The connection returned idle, and a request expiring while queued never started
its source callback. Jest remains database-free.

Actual readers also ran against synthetic local tables: independent full-cohort
ratings worked without an away snapshot, free enriched buckets were preserved,
and current kicking survived absent adjusted team/passing/rushing data.

Generated HTTP tests exercise real auth, tier, quota/refund, and service-policy
middleware with mocked storage. They cover canonical/mixed-case/trailing-slash
paths, denial before source work, entitlement changes, invalid queries,
metadata-only success, private headers, and sanitized failures. Cache tests use
two independent worker states and shared fake Redis, including lease loss,
malformed entries, hung connections, queued work, and late query settlement.

## Synthetic two-process measurements

Two local Node processes used disposable PostgreSQL 16 and Redis 7, each with
the existing five-connection pool budget. Requests used real generated HTTP
routes and synthetic auth/quota storage. The slate had 81 scheduled games for
one repeated team pair; one team had the complete synthetic snapshot and the
other had none. Only one current kicker had adjusted data. This tests serving
shape and cache reuse, not realistic league-wide data volume or auth latency.

Each concurrent workload below ran once, after the preceding workload, without
additional warm-up. Times are milliseconds; counts exclude transaction setup
and `set_config`. All 81 requests returned 200; no timeout/503 occurred.

| Workload                     | Requests | HTTP p50 / p95 | Data SELECTs, both workers | Payload bytes |
| ---------------------------- | -------: | -------------: | -------------------------: | ------------: |
| Cold schedule                |        1 |    74.6 / 74.6 |                          4 |        62,598 |
| Warm schedule                |       20 |    45.3 / 50.9 |                          0 |        62,598 |
| Cold same-game base/adjusted |       20 |    82.6 / 83.5 |                         14 |  1,813–17,990 |
| Warm same-game base/adjusted |       20 |      8.5 / 9.8 |                          0 |  1,813–17,990 |
| Distinct base previews       |       20 |  126.2 / 139.5 |                        140 |        17,882 |

Pool sampling every two milliseconds observed at most four active connections
per process and no pool waiters. Source-only single-request observations were
19.4 ms schedule, 28.6 ms base, and 14.6 ms adjusted. These are smoke measurements,
not latency SLOs or production capacity claims. Disposable JSON EXPLAIN plans
confirmed window ranking and bounded recent-result output; the tiny fixture
uses sequential scans and is not evidence for production index changes.
Use representative FBS/FCS cohorts, real auth latency, and longer mixed-load
runs before website adoption. No production load test was run.

With disposable Redis stopped, the same 81-request sequence returned 200
through bounded source fallback. Schedule p95 was 584 ms, same-game preview
p95 was 1,293 ms, and distinct-preview p95 was 1,325 ms. Local coalescing kept
the repeated same-game wave to nine base and six adjusted SELECTs across the
two workers. Peak pool usage remained four per process with no observed waiters.

The full database-free suite passed (443 tests), as did typecheck, the API/docs
build, documentation checks, and lint on changed files. Repository-wide lint
still reports unrelated existing errors in legacy modules.

## Recent-results query verification

Recent results now use a lateral query over each requested team's indexed
participation, with season/status/kickoff filters and a five-game limit before
metadata joins. Ordering remains kickoff descending, then game ID descending.
The production EXPLAIN for teams 130/194 in 2026 uses
`ix_game_team_team_id`, primary-key game lookups, and indexed metadata joins;
the previous parallel scan of the roughly 225,350-row `game_team` table is gone.
No index changes or production query execution were needed.

A disposable PostgreSQL 16 check used 112,690 games and 225,380 participation
rows, including roughly 1,400 historical games per requested team. It verified
five results per team, same-time ID ordering, neutral sites, null scores, and
exclusion of other seasons, unfinished/future games, the target game, and games
at the exact cutoff. After correctness and EXPLAIN ANALYZE checks, 100 query
executions at concurrency four measured 2.0 ms p50 and 2.6 ms p95. This synthetic
query-only check does not measure HTTP/auth/cache misses or production capacity.
Representative staging cache-miss testing was not run: no staging database
is available.

## Cold-preview orchestration verification

Verified 2026-09-26. Base previews now start independent component cache reads
together, while retaining the worker's two active refresh jobs and sixteen-key
queue. Adjusted previews batch passing, rushing, and kicking into one query,
ranking separately by team and metric type. Team metrics and their conditional
previous-season fallback run alongside that query. This removes two source
transactions per adjusted cache miss, including their timeout setup and commit
round trips. Each refresh still uses at most two source connections, so two
active refreshes consume at most four connections per worker.

The player query retains position filters, season-membership attribution,
null-last play ordering, lexical athlete-ID tie breaks, and 2/3/1 category caps.
Category absence and payload validation remain independent. A database failure
in the shared player query marks all three player categories unavailable;
team metrics remain independent. Cache identities, TTLs, and kickoff checks are
unchanged.

Production EXPLAIN-only checks for the 2026 Michigan/Ohio State pair confirmed
that the combined query retains the year index on adjusted metrics and indexed
athlete/membership lookups. No indexes or production data were changed. A
disposable PGlite PostgreSQL fixture with 216 metric rows returned exactly the
same 12 selected player rows as the three original queries, covering category
caps, positions, null play counts, season filtering, duplicate/conflicting
affiliations, duplicate memberships, and same-season transfers.

A controlled local comparison ran the actual old/new readers and cache code
with empty optional sources, an 80 ms delay per source read, and a 10 ms delay
per fake Redis command. Each endpoint ran five times with its cache cleared
before every request. Counts include core metadata and previous-season absence
checks, but exclude transaction setup statements.

| Endpoint | Before p50 / p95 (ms) | After p50 / p95 (ms) | Source reads before / after |
| -------- | --------------------: | -------------------: | --------------------------: |
| Base     |             771 / 781 |            488 / 496 |                       9 / 9 |
| Adjusted |             406 / 407 |            325 / 328 |                       6 / 4 |

These simulated-delay measurements demonstrate reduced serial waiting, not
production HTTP latency or database execution speed. Authentication, real
network variability, populated-source transfer costs, and burst capacity are
not measured. Production end-to-end cache-miss timings still need verification
after deployment. Jest covers overlapping base sources, the four-connection
bound, batched category isolation, and conditional team fallback.

## Consumer notes

Free player lists use pass/rush involvement with conservative position filters;
zero-only empty sums and unknown positions do not establish participation.
Adjusted player metrics retain season-membership attribution for transfers.
Previous-season fallback applies to team metrics only. Unknown source update
times remain null, and snapshot publication is not a games-through cutoff.

Website session/tier enforcement, adjusted exporter catalog exclusion, and
completed-game box-score links remain downstream work. Deployment uses the
existing separately authorized release process.

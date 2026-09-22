# Team season overview ranking query cost

## Decision

This initial evaluation preceded implementation of ranking fields. Live CORE/SRS/SP+ ranks have
modest incremental cost in this sample. The straightforward live Elo ranking
adds substantially more work and should be optimized or explicitly accepted as
an additional latency cost before being included. No index, migration, cache or
precomputation change is justified solely by this experiment.

## Method

Executed read-only against the locally configured API primary database using
one connection, a ten-second statement timeout and a one-second lock timeout.
No data, indexes, database settings or endpoint code were changed. The only
session settings were read-only mode, timeouts and an application name.

Compared the existing overview SELECT (including its live record and ratings)
with two isolated candidate queries:

1. Add season CORE overall/offense/defense, SRS and SP+
   overall/offense/defense/special-teams ranks.
2. Add the above plus the latest completed-game Elo rank.

Candidates rank the full season cohort before joining the selected snapshot.
They partition by season-appropriate conference division, use competition ranks
on unrounded values, put missing SP+ special teams last and return its rank as
null, and rank SP+ defense ascending. The original cost prototype incorrectly
ranked CORE defense descending; both the implementation and diagnostic now
rank CORE defense ascending (lower points allowed is better). Other metrics
rank descending. Timings below were captured before this direction correction. Elo picks
the latest non-null postgame value by game start date and game ID, with no
fallback to a different season. This is a cost prototype, not a final feature
implementation or an exhaustive correctness audit.

Five measured SELECTs per variant and scope, after one warmup pass, with query
order rotated each pass. Timings include the application/database round trip
and result transfer; they exclude HTTP/auth and are not an endpoint load test.
EXPLAIN ANALYZE BUFFERS with node timing disabled was also executed once per
variant and scope. No concurrent load or deliberate cold-cache run was performed.

## Measured SELECT timings

Median milliseconds; five measured samples per cell:

| Team/season             | Existing query | + CORE/SRS/SP+ ranks | + all ranks, including Elo |
| ----------------------- | -------------: | -------------------: | -------------------------: |
| Michigan 2025           |          63.55 |                79.50 |                     206.14 |
| Michigan 2026           |          62.91 |                75.16 |                     176.91 |
| North Dakota State 2025 |          50.17 |                61.96 |                     177.93 |

Season-rating ranks added 11.79–15.95 ms to the median. Including Elo added
114.00–142.59 ms over the existing query. The Elo increment over season-rating
ranks alone was 101.75–126.64 ms. These differences are observations, not a
latency guarantee or an invented serving SLO.

## Server-side evidence

Single EXPLAIN ANALYZE execution times, milliseconds:

| Team/season             | Existing query | + season-rating ranks | + all ranks |
| ----------------------- | -------------: | --------------------: | ----------: |
| Michigan 2025           |         35.635 |                30.292 |     151.694 |
| Michigan 2026           |         20.459 |                22.208 |     132.233 |
| North Dakota State 2025 |          8.585 |                21.032 |     132.645 |

The one-pass baseline/annual variation illustrates why these are not used as
precise incremental estimates. Repeated client medians above are more stable.

The Michigan 2025 all-ranks plan scanned all 225,350 `game_team` rows, retaining
134,211 non-null Elo rows and rejecting 91,139. It then joined the requested
season, sorted 1,741 eligible rows, selected latest team values and ranked 136
teams. This historical scan is the main additional work; sorting the final
rating cohort is small. All observed sorts stayed in memory (largest reported
sort 130 kB), with zero temporary blocks and zero shared-block reads in all
nine analyzed plans. These were warm-cache executions.

CORE and SP+ already have `(year, team_id)` unique indexes; game has a season
index and game_team has both game-ID and team-ID indexes. SRS has a team-ID
index but no year-leading index in the inspected catalog. Its season rank
scanned 14,445 rows in the Michigan 2025 plan; that small scan alone does not
justify a migration. No indexes were modified.

## Reproduction

From the API checkout with its normal local database environment:

```bash
# Inspect indexes and estimated plans only.
node --require ts-node/register scripts/evaluate-season-rank-cost.ts

# Execute a warmup and five rotated measured reads for each variant/scope.
node --require ts-node/register scripts/evaluate-season-rank-cost.ts --execute

# Execute each query once with server-side plan/buffer measurements.
node --require ts-node/register scripts/evaluate-season-rank-cost.ts --analyze
```

The script is independent of API startup and leaves the endpoint unchanged.
It prints plans and timings, not credentials or snapshot payloads. The selected
scopes must already have snapshots for the measured SELECT run. TypeScript and
targeted lint checks cover this diagnostic script; no live database Jest test
was introduced.

## Approved implementation with FPI efficiencies

The implemented query includes CORE/SRS/SP+ ranks plus all four FPI efficiency
values and ranks. Elo remains rating-only. A follow-up read-only run of the
actual query, with one warmup and five measured SELECTs per scope, produced:

| Team/season             | Median round trip |  Observed range |
| ----------------------- | ----------------: | --------------: |
| Michigan 2025           |          78.54 ms |  78.03–96.51 ms |
| Michigan 2026           |          79.68 ms | 77.56–116.44 ms |
| North Dakota State 2025 |          67.48 ms |  65.20–68.03 ms |

These remain close to the earlier season-rating-only measurements. They are
separate runs, not a controlled estimate of FPI's isolated incremental cost.
No additional index or cache was introduced. Use `--current-only` on the
benchmark script to measure the implemented query. The script retains a frozen
pre-ranking SELECT for reproduction of the original baseline.

A separate disposable PostgreSQL fixture verified competition ties, ranking on
unrounded values, independent nullable metric cohorts, zero efficiencies,
SP+ defense ascending, FCS separation, historical affiliation, duplicate and
ambiguous affiliations, season isolation and filtering the team after ranking.
No fixture writes targeted the configured API database.

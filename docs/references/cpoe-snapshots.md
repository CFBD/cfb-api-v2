# CPOE response contract

## Public fields

Overall passing production returns `cpoeAttemptsAvailable`, `cpoeCompletions`,
`expectedCompletions`, `expectedCompletionRate`, and `cpoe`. Passing plays
return `completionProbability` and `cpoe`. Location buckets have no CPOE
fields. The same `PassingProduction` schema is used by `/passing`, advanced box
scores, team season overviews, and game previews.

Model versions and source-eligibility flags are internal and are not returned.

## Calculation

CPOE is 100 × (completions − expected completions) / scored attempts, in
percentage points to two decimals. Every term uses the same scored subset, so
`attempts` can exceed `cpoeAttemptsAvailable`. Expected completions and the
0–1 expected rate are rounded to three decimals after aggregation. Defensive
values keep the opposing passer's sign. Mixed model versions in one aggregate
return unavailable CPOE (zero counts, null metrics) without hiding base stats.

## Stored snapshots

`cfbd-services` writes the fields plus `cpoeModelVersion` into box-score and
team-season snapshot JSONB (format version 1) from `pass_play_cpoe_current`.
Readers compare the stored version with the season's `cpoe_season_model` row,
return CPOE only on a match, and always strip the version
(`currentSnapshotCpoe`). This covers box scores, season overviews, and game
previews; preview cache keys carry a `cpoe1` suffix for the projected shape.
Legacy payloads without the fields normalize to unavailable CPOE; partially
present fields fail validation. Source corrections require a snapshot rebuild.

The box-score fallback and `/passing` aggregates read `pass_play_cpoe_current`
directly. Join it by both game ID and play ID, and materialize predictions only
for the distinct games that survive the original filters; a play-ID-only join
expands source checks across unrelated games.

`/passing/teams/season` for whole seasons (no season type, or `both`) returns
stored team-season passing with the same model-version projection, falling back
to the live read when any in-scope team-season with pass plays lacks a valid
snapshot. Like season overviews, it serves stored CPOE until services rebuilds
the snapshot, so source corrections that invalidate predictions need a rescore
or snapshot rebuild before the endpoint reflects them.

The live team-season read uses three bulk reads in a read-only, repeatable-read
transaction: season-valid game participants, ordinary passing aggregates, and
current predictions with their canonical play sides/outcomes. It combines CPOE
in memory by season, school, conference and side, retaining full probability
precision until the existing response mapper rounds it. This avoids scanning
a season-wide prediction CTE for every passing attempt. Raw stored prediction
rows only identify candidate games; public probabilities still come exclusively
from the current view. Missing predictions leave ordinary production intact;
query failures fail the request rather than silently dropping CPOE. JIT is
disabled only within that transaction to avoid compilation overhead. The
companion services migration `010` bounds per-game play and affiliation work
without changing current-view validity or source fingerprints. See the
[full-season performance verification](passing-season-performance.md).

Services own model packaging, activation, scoring, snapshot publication, and
recovery. See the [passing CPOE PRD](../prd/passing-cpoe-api.md) and
[integration plan](../plans/passing-cpoe-integration.md) for history and
benchmarks.

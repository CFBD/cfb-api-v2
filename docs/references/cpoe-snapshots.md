# CPOE snapshot response contract

October 6, 2026: implemented locally in team-season overviews and advanced box
scores. No deployment or production prediction backfill was performed.

October 7 publication amendment: the owner approved release
`cpoe-fbs-2025-2026-v2` for all supported 2025/2026 games, including training
games scored in-sample with the same accepted estimator. Date/game-ID research
exclusions no longer restrict that release's publication. FBS-versus-FBS and
valid-input requirements remain. This does not change the response fields or
scored-subset formula. The original forward validation is unchanged; historical
numbers are not additional out-of-sample validation. Deployment/activation and
population follow `cfbd-services/docs/exec-plans/cpoe-model-and-operations/31-retrospective-publication.md`.

Overall passing production now exposes optional additive fields
`cpoeAttemptsAvailable`, `cpoeCompletions`, `expectedCompletions`,
`expectedCompletionRate`, `cpoe`, and `cpoeModelVersion`. These occur in team
snapshot `passing.offense/defense`, box-score `teams.passing[].offense/defense`,
and box-score `players.passing[]`. Location buckets retain their existing fields.

CPOE is 100 × (actual completions − expected completions) / scored attempts,
in percentage points to two decimals. Both numerator terms use exactly the
same current scored subset. Expected completions and expected rate are rounded
to three decimals after deriving metrics from full-precision probabilities;
expected rate uses a 0–1 scale. Defensive values keep the opposing passer's
sign. Existing overall passing attempts can exceed scored attempts.

The generators in `cfbd-services` populate these JSONB fields from
`pass_play_cpoe_current`. Both tables retain format version 1. Old documents
without the fields are accepted and normalized to zero scored counts and null
metrics/version. If some fields are present, the entire projection must be
valid. Mixed model versions or invalid calculated aggregates yield unavailable
CPOE without discarding base passing statistics.

Snapshot queries retain one bounded data statement and join the season's
selected model. If selection is absent or differs from the stored version, the
reader suppresses only CPOE, immediately handling withdrawal or replacement.
This does not verify per-play source freshness on GET: source corrections
require the existing snapshot rebuild flow. The box-score fallback calculates
from the current-prediction view within its existing read-only transaction.
No model calls, writes, or scheduling occur in the API.

October 7 performance pass: the fallback joins current predictions by both
game ID and play ID. The matching services migration evaluates the source
fingerprint once per game. Keep this join scope when changing passing queries;
a play-ID-only join can expand source checks across unrelated games. Normal
snapshot hits do not query fingerprint views. Synthetic PostgreSQL 17 benchmark
evidence and the reproducible fixture live in
`cfbd-services/docs/exec-plans/cpoe-model-and-operations/30-performance-pass.md`.

Standalone `/passing` endpoints were outside the original snapshot change.
The October 8 follow-up implements their CPOE fields and eligibility filter
while preserving the optional snapshot payload fields through snapshot types.
The broader [passing CPOE PRD](../prd/passing-cpoe-api.md) and
[integration plan](../plans/passing-cpoe-integration.md) were reconciled
October 8 and are implemented locally. October 9 bounded live verification
confirmed the aggregate query fix; deployment remains pending. They use the same three-decimal
rate precision, require explicit standalone fields, and preserve this snapshot
storage contract without adding source-eligibility fields or location splits.

The October 6 inspection found zero prediction rows and zero selected models;
that is historical evidence, not current rollout status. The October 7 services
publication record subsequently reports v2 activation and a 2026 backfill.
See `cfbd-services/docs/exec-plans/cpoe-model-and-operations/31-retrospective-publication.md`
for the updated operator history and rollout sequence. This documentation
reconciliation performs no fresh production verification and does not establish
complete 2025 coverage or API deployment. Services own model packaging,
activation, scoring catch-up, snapshot publication, and recovery.

October 9 aggregate query fix: standalone aggregate handlers and internal
box-score passing calculators materialize current predictions only for the
distinct games surviving their original filters. Live analyzed plans confirmed
one source fingerprint per scoped game. Snapshot hits retain the existing
selected-model check and do not scan the prediction view. See the integration
plan for timings, data reconciliation, and sample limits.

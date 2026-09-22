# Format 1 contract fixture

API reference revision: `4ea126d76c8db0869ba27800ab6fe3572618a8f5`. Scope: exact canonical team and season,
no week, season-type, garbage-time, or threshold filters.

`contract.json` is a synthetic wire contract fixture, not a captured Michigan
season or evidence of database calculation parity. Advanced/player values are
hand-authored to exercise required fields, legacy nulls, spelling/casing, and
nullable player names/positions. Enriched production objects reuse the existing
captured `401752677` box score fixture; identity is changed for the contract test.
Both repositories intentionally keep identical JSON.

Real source parity, historical FBS/FCS coverage, and performance measurements
remain a development database validation step; do not infer them from this file.

`advanced-mapping.json` contains synthetic aggregate source rows and the actual
legacy API mapper's JSON output at the recorded revision. Both repositories
check this baseline. It covers offense/defense zero/null differences, missing
scoring opportunities, rounding inputs, non-finite havoc wire nulls, and the
legacy defensive open-field alias quirk. This proves mapping parity on these
inputs, not SQL population parity against a real season.

`player-mapping.json` contains synthetic player aggregate rows and the existing
API mappers' serialized output. Both repositories check usage/PPA denominators,
negative rounding, zero/null behavior and nullable labels. Services additionally
checks deterministic ordering and exact canonical team/season query bounds.
This is mapper evidence, not a real transferred-player season capture.

`observed-advanced.json` is the advanced section of the owner-supplied Michigan
2025 Insomnia response, captured during this implementation. It verifies
response rounding for already-published full-precision snapshots.

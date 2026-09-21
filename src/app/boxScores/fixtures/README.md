# Advanced box score parity fixtures

Captured read-only on 2026-09-14, before replacing the legacy service. Baseline
responses were serialized through JSON. Enriched oracles used the existing
season/week/type endpoints for FBS and FCS and selected the exact game from
those results. Production calculations use exact game-ID predicates instead.

| Game      | Coverage                                                       |
| --------- | -------------------------------------------------------------- |
| 401752677 | 2025 Texas at Ohio State; enriched production                  |
| 401754518 | 2025 Fordham at Boston College; both FCS/FBS participants      |
| 401762432 | 2025 Tarleton State at Army; overtime and mixed division       |
| 401628455 | 2024 Akron at Ohio State; no enriched rows                     |
| 400852731 | 2015 Houston vs. Florida State; older postseason data          |
| 282430194 | 2008 Youngstown State at Ohio State; historical mixed division |

`<id>.json` contains the independent legacy and enriched oracle responses.
`<id>-rows.json` contains the database rows used for isolated legacy mapper
tests. `<id>-payload.json` contains the expanded result checked against the
oracle. The services producer keeps the same corpus; neither runtime imports
source from the other repository. Unordered legacy arrays are compared by full
row identity, preserving multiplicity; enriched endpoint ordering is retained.

Read-only validation passed for all six full expanded payloads and PostgreSQL
JSONB round trips. The Docker integration exercise also passed on PostgreSQL
16, including concurrent publication and rollback. HTTP latency and production
rollout verification remain separate release gates.

# Repository Knowledge Base

Last reviewed: 2026-07-06

## Navigation

- `../README.md`: human-oriented setup, command, and contribution overview.
- `../AGENTS.md`: always-loaded agent instructions and required commands.
- `../ARCHITECTURE.md`: system map, request flow, data access, generated
  outputs, testing, and release/deploy behavior.
- `QUALITY_SCORE.md`: current documentation quality snapshot and doc gardening
  queue.
- `plans/index.md`: where to put active or completed implementation plans.
- `references/index.md`: generated artifacts, config files, and stable
  reference material.

## Task Routing

| Task                                    | Start With           | Also Check                                                                                   |
| --------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| Add or change an endpoint               | `../ARCHITECTURE.md` | `src/app/<domain>/controller.ts`, `src/app/<domain>/service.ts`, `src/app/<domain>/types.ts` |
| Change auth, quotas, or gated endpoints | `../ARCHITECTURE.md` | `src/config/auth.ts`, `src/config/middleware/quotas.ts`                                      |
| Change OpenAPI output                   | `../ARCHITECTURE.md` | `tsoa.json`, `src/**/controller.ts`                                                          |
| Change database query behavior          | `../ARCHITECTURE.md` | `src/config/database.ts`, `src/config/types/db.d.ts`                                         |
| Prepare a release-impacting change      | `../ARCHITECTURE.md` | `.github/workflows/release.yml`, `CHANGELOG.md`                                              |
| Clean up documentation                  | `QUALITY_SCORE.md`   | `AGENTS.md`, `README.md`, this index                                                         |

## Freshness

Run `pnpm docs:check` after changing Markdown links, the doc structure, or
`AGENTS.md`. Run `pnpm build` after changing controllers, response types, or
`tsoa.json` so generated routes and OpenAPI output still compile.

Docs with `Last reviewed` dates should be refreshed when their source files or
workflow assumptions change. If a new document becomes a durable source of
truth, add it to this index in the same change.

# Quality Score

Last reviewed: 2026-07-06

This is a lightweight documentation-system snapshot, not a full code audit.

## Summary

| Area                 | Status   | Evidence                                                                                                         | Next Action                                                                      |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Architecture docs    | Improved | `ARCHITECTURE.md` now documents request flow, data access, auth, generated outputs, tests, and release flow.     | Refresh when server composition, auth, quotas, TSOA, or deploy behavior changes. |
| Agent navigation     | Improved | `AGENTS.md` is under 100 lines and points to durable docs.                                                       | Keep it as a map, not a long-form guide.                                         |
| Documentation checks | Improved | `pnpm docs:check` verifies required docs, local Markdown links, and `AGENTS.md` length.                          | Consider running it in every PR if a general CI workflow is added.               |
| Tests                | Partial  | Jest tests are co-located in `src/**/*.test.ts` and cover auth, middleware, info, and selected players behavior. | Add focused service tests when endpoint behavior changes.                        |
| Generated references | Partial  | TSOA and Kysely generated outputs have documented refresh commands.                                              | Re-run generation after controller/spec or database schema changes.              |
| Security             | Partial  | CodeQL runs for JavaScript on push, PR, and weekly schedule.                                                     | Revisit if auth, quota, deployment, or secret-handling behavior changes.         |

## Doc Gardening Queue

- [ ] Add endpoint-specific notes when an endpoint has non-obvious parameter
      combinations, customer-visible gating, or unusual query behavior.
- [ ] Add a PR CI workflow for `pnpm docs:check`, `pnpm lint`, and `pnpm test`
      if the repo wants validation before merge rather than only on `main`.
- [ ] Split any future long-form release, operations, or database runbooks into
      `docs/references/` and link them from `docs/index.md`.
- [ ] Revisit `.github/CONTRIBUTING.md` for current project contact channels
      and issue guidance before broad contributor-facing changes.

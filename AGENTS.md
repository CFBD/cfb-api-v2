# AGENTS.md - CFB API v2

## Purpose

This repo contains the TypeScript/Express REST API for CollegeFootballData.
Agents should preserve the existing TSOA controller, service, and Kysely data
access patterns unless a task explicitly calls for a different shape.

## Start Here

- Repo guide: `README.md`
- Knowledge base: `docs/index.md`
- Architecture and request flow: `ARCHITECTURE.md`
- Quality and documentation debt: `docs/QUALITY_SCORE.md`

## Required Commands

- Install dependencies: `pnpm install`
- Build API spec/routes and TypeScript: `pnpm build`
- Run all tests: `pnpm test`
- Run one test file: `pnpm test <filename>`
- Lint: `pnpm lint`
- Format: `pnpm prettify`
- Check documentation structure and links: `pnpm docs:check`
- Start local dev server with regenerated TSOA routes: `pnpm dev`

## Working Rules

- Keep edits scoped to the requested endpoint, middleware, or doc area.
- Read `ARCHITECTURE.md` before changing request flow, auth, quotas, database
  access, generated route/spec behavior, or release/deploy behavior.
- Follow the feature folder pattern under `src/app/<domain>/`:
  `controller.ts`, `service.ts`, and `types.ts`.
- Use TSOA decorators in controllers and keep business/query logic in services.
- Use `ValidateError` for request validation failures that should return 400.
- Use `kdb` from `src/config/database.ts` for Kysely queries unless existing
  code in the touched area still relies on `pg-promise`.
- Add or update co-located Jest tests for changed behavior where practical.
- Update docs and generated references when behavior, commands, or source of
  truth changes.

## Style

- TypeScript strict mode is enabled; use explicit types and avoid implicit `any`.
- Prettier uses single quotes, trailing commas, and an 80 character line limit.
- Use camelCase for values/functions and PascalCase for classes/types.

## Safety

- Do not commit secrets, API keys, database credentials, or generated local
  artifacts.
- Do not run destructive database, deployment, or production-affecting commands
  without explicit approval.
- Preserve unrelated user changes in the working tree.

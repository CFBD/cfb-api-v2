# CFBD API v2

This is the repository for the CFBD API v2, hosted at
[api.CollegeFootballData.com](https://api.collegefootballdata.com). The API is
built with Node.js, TypeScript, Express, TSOA, and PostgreSQL.

## Getting Started

This repo uses `pnpm` for dependency management.

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the API with hot reload and regenerates TSOA routes/specs as
controller files change. To work on the documentation site at the same time,
run `pnpm docs:dev` in a second terminal.

## Common Commands

```bash
pnpm start         # run the compiled API with up to two workers
pnpm build         # generate TSOA routes/specs and compile TypeScript
pnpm docs:build    # generate OpenAPI and build the Zudoku site
pnpm docs:dev      # generate OpenAPI and start the Zudoku dev server
pnpm test          # run all Jest tests
pnpm lint          # run ESLint
pnpm prettify      # format code with Prettier
pnpm docs:check    # verify required docs, AGENTS.md size, and local doc links
pnpm build:db      # regenerate Kysely database types
```

## Production Workers

After `pnpm build`, `pnpm start` runs two Node workers sharing the existing
`PORT` (one worker when only one CPU is available). The Docker image starts
the same launcher directly so it receives stop signals. No proxy, port, or
required environment changes are needed. Set `API_WORKERS=1` to opt into one
worker. Development with `pnpm dev` remains a single process.

The primary process coordinates per-user concurrency across its workers and
replaces workers that exit unexpectedly. Database pools split their existing
total connection budget between workers. Workers drain active HTTP requests
and close database/Redis connections on shutdown, with an eight-second worker
deadline and a nine-second primary deadline. See
[ARCHITECTURE.md](ARCHITECTURE.md) for cache and admission behavior.

## Documentation Map

The deployed [Zudoku documentation](https://api.collegefootballdata.com/) is
the primary API reference. The [legacy Swagger
UI](https://api.collegefootballdata.com/swagger) remains available during the
transition.

- [AGENTS.md](AGENTS.md): short operating guide for Codex and other agents.
- [ARCHITECTURE.md](ARCHITECTURE.md): request flow, source layout, data access,
  auth/quotas, generated outputs, tests, and release/deploy behavior.
- [docs/index.md](docs/index.md): repository knowledge-base index.
- [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md): documentation quality
  snapshot and cleanup queue.

## Project Architecture

This project uses [TSOA](https://tsoa-community.github.io/docs/) to generate
OpenAPI documentation and Express routes from TypeScript controllers. Data
access is primarily implemented with [Kysely](https://kysely.dev/), with
existing `pg-promise` usage for auth and legacy paths.

Feature code lives under `src/app/<domain>/` and follows a
`controller.ts`, `service.ts`, `types.ts` pattern. See
[ARCHITECTURE.md](ARCHITECTURE.md) before changing request flow, authentication,
quota behavior, generated OpenAPI output, or deployment behavior.

## Releases

Semantic versioning is handled by
[semantic-release](https://github.com/semantic-release/semantic-release) based
on conventional commit messages. [commitlint](https://commitlint.js.org/) is
used in the release workflow to enforce commit message formatting.

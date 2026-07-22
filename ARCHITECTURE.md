# CFB API v2 Architecture

Last reviewed: 2026-07-06

## System Purpose

CFB API v2 is a Node.js, TypeScript, Express, and TSOA REST API for
CollegeFootballData. It serves college football data from PostgreSQL, exposes
OpenAPI documentation generated from controller annotations, and deploys as a
Docker image through GitHub Actions.

## Request Flow

1. `src/app.ts` loads environment variables, creates an Express application,
   and delegates setup to `configureServer`.
2. `src/config/express.ts` configures proxy trust, Sentry, Helmet, cookie and
   body parsing, CORS, quota refund handling, generated TSOA routes, the shared
   error handler, `/api-docs.json`, and Swagger UI at `/`.
3. TSOA registers routes generated from `src/**/controller.ts` into
   `build/routes`.
4. Controllers receive and document request parameters with TSOA decorators,
   then call named service functions.
5. Services validate cross-field requirements, build database queries, and map
   database rows into API response types.
6. `src/config/errors.ts` maps `ValidateError` to 400, `AuthorizationError` to
   401, `UserMessageError` to 400, and unexpected errors to 500.

## Source Layout

- `src/app.ts`: application entrypoint.
- `src/config/express.ts`: Express server composition and Swagger exposure.
- `src/config/auth.ts`: TSOA bearer authentication and Patreon-gated endpoint
  checks.
- `src/config/database.ts`: PostgreSQL connection setup for both `pg-promise`
  and Kysely.
- `src/config/middleware/`: CORS, quota metering/refunds, bad parameter
  rejection, and per-user slowdown middleware.
- `src/config/types/db.d.ts`: generated Kysely database type definitions.
- `src/globals/`: shared constants, API user shape, and custom error classes.
- `src/app/<domain>/`: endpoint domains. Use `controller.ts`, `service.ts`,
  and `types.ts` for each feature area.

## Endpoint Pattern

Controllers are the public API contract:

- Decorate classes with `@Route`, `@Tags`, and usually
  `@Middlewares(middlewares.standard)`.
- Decorate handlers with TSOA HTTP method decorators such as `@Get`.
- Document query parameters in JSDoc so generated OpenAPI output stays useful.
- Keep handlers thin; they should collect parameters and call service
  functions.

Services are the behavior boundary:

- Export named async functions.
- Validate required parameter combinations with `ValidateError`.
- Prefer `kdb` from `src/config/database.ts` for typed Kysely queries.
- Map raw query results into response types declared in `types.ts`.

## Authentication, Quotas, And Slowdown

TSOA uses `expressAuthentication` from `src/config/auth.ts` for the `apiKey`
security definition in `tsoa.json`. Requests normally need an
`Authorization: Bearer <token>` header, with development and configured CORS
origin exceptions for non-Patreon-locked paths.

`patreonLocked` in `src/config/auth.ts` maps gated paths to required Patreon
tiers. Keep this map aligned with endpoint behavior and customer-facing docs
when changing gated endpoints.

Quota behavior lives in `src/config/middleware/quotas.ts`:

- `checkCallQuotas` reserves one monthly call for authenticated, non-admin
  users unless the path is ignored.
- `updateQuotas` refunds a reserved call for non-2xx responses and writes
  `X-CallLimit-Remaining`.

Per-user slowdown rules are composed in `src/config/middleware/index.ts` with
`createRateSlowdown`.

## Data Access

The primary API database and auth database are configured from environment
variables in `src/config/database.ts`.

- Use `kdb` for new Kysely query work.
- `db` and `authDb` remain available for existing `pg-promise` paths and auth
  database queries.
- Refresh generated database types with `pnpm build:db` when schema changes are
  available to the local environment.

## Generated Outputs

`pnpm build` runs `tsoa spec-and-routes`, TypeScript compilation, and an HTTP
smoke check that verifies the served OpenAPI document has no Swagger 2 `host`
or CommonJS `default` wrapper. TSOA uses `tsoa.json` to:

- scan `src/**/controller.ts`,
- generate routes into `build/routes`, and
- generate the OpenAPI spec into `build/swagger.json`.

Do not edit generated files by hand. Change controllers, types, or `tsoa.json`,
then regenerate.

## Testing

Jest tests are co-located with the source under `src/**/*.test.ts`. Existing
coverage focuses on auth, middleware, and selected service behavior. When
changing endpoint behavior, add focused service tests when the logic can be
tested without a live database; mock `src/config/database.ts` as current tests
do.

## Release And Deployment

`.github/workflows/release.yml` runs on pushes to `main`. It installs
dependencies, checks documentation, validates the commit message with
commitlint, runs tests, publishes a semantic-release release, builds and signs a
Docker image, deploys over SSH, announces to Discord, and regenerates the Python
client from the deployed OpenAPI spec.

`.github/workflows/codeql-analysis.yml` runs CodeQL for JavaScript on pushes,
pull requests to `main`, and a weekly schedule.

## Change Boundaries

- Keep public response shapes stable unless the task is explicitly a breaking
  API change.
- Keep controller annotations, response types, and service return values in
  sync so OpenAPI output matches runtime behavior.
- Keep quota, Patreon gating, and API usage telemetry changes coordinated
  across `auth.ts`, quota middleware, and relevant endpoint docs.
- Update `docs/index.md` when adding a durable source of truth.

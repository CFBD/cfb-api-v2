# CFB API v2 Architecture

Last reviewed: 2026-09-01

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
   error handler, `/api-docs.json`, Swagger UI at `/swagger`, and Zudoku
   documentation at `/`.
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
- `src/config/documentation.ts`: Zudoku static files, GA redirects, and the
  allowlisted HTML fallback.
- `src/config/auth.ts`: strict TSOA bearer authentication and service-principal
  scope enforcement.
- `src/config/servicePrincipals.ts`: page/exporter identity classification and
  exact operation policy.
- `src/config/redis.ts`: optional Redis connection used by the scoreboard
  snapshot.
- `src/config/database.ts`: PostgreSQL connection setup for both `pg-promise`
  and Kysely.
- `src/config/middleware/`: CORS, quota metering/refunds, bad parameter
  rejection, and per-user slowdown middleware.
- `src/config/types/db.d.ts`: generated Kysely database type definitions.
- `src/globals/`: shared constants, API user shape, and custom error classes.
- `src/app/<domain>/`: endpoint domains. Use `controller.ts`, `service.ts`,
  and `types.ts` for each feature area.
- `docs-site/`: authored Zudoku configuration, pages, styles, and public
  assets.

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
security definition in `tsoa.json`. Data requests require the exact
`Authorization: Bearer <token>` form. Browser `Origin` and `Host` values are not
authentication. `POST /auth/key` is explicitly anonymous through TSOA's
`@NoSecurity()` decorator.

Two non-admin website service users are classified by configured numeric user
ID. The page user can call only the explicit public-page operation set. The
exporter user can call documented GET operations except the reviewed deny set.
Scope denial happens before successful metrics, quota, controller, or database
work.

Production requires these private configuration values:

| Variable                           | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `CFBD_PUBLIC_PAGE_SERVICE_USER_ID` | Positive numeric auth-user ID for curated website page traffic |
| `CFBD_EXPORTER_SERVICE_USER_ID`    | Distinct positive numeric auth-user ID for exporter traffic    |
| `REDIS_URL`                        | Scoreboard Redis endpoint                                      |
| `REDIS_PASSWORD`                   | Redis password when required by the endpoint                   |

The IDs classify already authenticated users; they are not credentials. Both
users must be non-admin, unblacklisted, and have no Patreon tier. The page
service is limited to these GET operations:

- `/teams`
- `/conferences`
- `/games`
- `/player/search`
- `/plays/types`
- `/plays/stats/types`
- `/ppa/predicted`
- `/teams/matchup`
- `/stats/season/advanced`
- `/player/usage`
- `/ppa/players/season`
- `/player/ppa/passing`
- `/ratings/sp`
- `/ratings/sp/conferences`
- `/metrics/wp`
- `/game/box/advanced`

The exporter service can call generated, documented GET operations except:

- `/games/weather`
- `/scoreboard`
- `/live/plays`
- `/game/box/advanced`
- `/wepa/team/season`
- `/wepa/players/passing`
- `/wepa/players/rushing`
- `/wepa/players/kicking`
- `/info`

Patreon checks are operation-bound middleware on the seven existing paid
handlers. This keeps tier enforcement consistent for canonical, mixed-case,
and trailing-slash requests without changing the existing tiers.

Quota behavior lives in `src/config/middleware/quotas.ts`:

- `checkCallQuotas` reserves one monthly call for authenticated, non-admin
  users unless the matched operation is ignored. The page service is not hard
  metered; the exporter uses the normal atomic quota path.
- `updateQuotas` refunds a reserved call for non-2xx responses and writes
  `X-CallLimit-Remaining`.

Per-user slowdown rules are composed in `src/config/middleware/index.ts` with
`createRateSlowdown`.

## Scoreboard Cache

`GET /scoreboard` remains Tier 1 and quota-exempt. Its service reads a
versioned, canonical full scoreboard snapshot from Redis with a 60-second TTL,
then applies classification and conference filtering in memory. A short Redis
lock coalesces cache misses. Redis connection, read, write, lock, or parse
failures fall back to the original filtered PostgreSQL query and do not change
the public `ScoreboardGame[]` contract.

## Data Access

The primary API database, optional read replica, and auth database are
configured from environment variables in `src/config/database.ts`.

- Use `kdb` for new Kysely query work.
- Use `replicaKdb` for endpoint query paths that can tolerate replica lag. Use
  `replicaDb` for equivalent legacy `pg-promise` paths.
- Set both `DATABASE_REPLICA_HOST` and `DATABASE_REPLICA_PORT` to create the
  replica connections. They reuse the primary `DATABASE_USER`,
  `DATABASE_PASSWORD`, and `DATABASE` values.
- If either replica setting is missing at initialization, `replicaKdb` and
  `replicaDb` alias their primary counterparts. This keeps opt-in endpoints on
  the primary without creating a redundant pool.
- The following read endpoints opt into the replica connections:
  `/plays/stats`, `/stats/player/season`, `/stats/season/advanced`,
  `/stats/game/advanced`, and `/stats/player/success/game`.
- `db` and `authDb` remain available for existing `pg-promise` paths and auth
  database queries.
- Refresh generated database types with `pnpm build:db` when schema changes are
  available to the local environment.

## Generated Outputs

`pnpm build` runs `tsoa spec-and-routes`, TypeScript compilation, the Zudoku
static build, and documentation-output verification. TSOA uses `tsoa.json` to:

- scan `src/**/controller.ts`,
- generate routes into `build/routes`, and
- generate the OpenAPI spec into `build/swagger.json`.

Do not edit generated files by hand. Change controllers, types, or `tsoa.json`,
then regenerate. `pnpm docs:build` refreshes only the OpenAPI document before
building and verifying `docs-site/dist`; generated documentation remains
uncommitted.

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

The pnpm version is pinned in `package.json`, `.github/workflows/release.yml`,
and `Dockerfile`; keep all three pins aligned when upgrading. Supply-chain
release-age policy and any approved, version-specific exceptions live in
`pnpm-workspace.yaml`.

Deploy the CBB API deny-only containment before activating either CFB website
credential. The CFB web container and monthly reset job must use the same
service identities configured here. The reset job assigns the exporter a
100,000-call monthly allowance as an operational backstop.

Rotate the two keys independently: provision the replacement, update only the
matching private website runtime value, restart and smoke the affected website
route class, verify an out-of-scope operation returns 401, and then revoke the
old token. For an exporter incident, disable its website relay with
`NUXT_EXPORTER_ENABLED=false`; blacklisting a service user is the API-side
emergency revocation.

## Change Boundaries

- Keep public response shapes stable unless the task is explicitly a breaking
  API change.
- Keep controller annotations, response types, and service return values in
  sync so OpenAPI output matches runtime behavior.
- Keep quota, Patreon gating, and API usage telemetry changes coordinated
  across `auth.ts`, quota middleware, and relevant endpoint docs.
- Update `docs/index.md` when adding a durable source of truth.

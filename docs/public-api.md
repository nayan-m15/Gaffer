# Public Gaffer API

The `/v1/formations`, `/v1/tactics`, and `/v1/public-dashboard/*` routes are externally accessible,
unauthenticated, read-only endpoints (`backend/src/public-api/`). They exist
so an outside developer/assessor can consume Gaffer data without a session,
and are separate from every team-scoped, cookie-authenticated endpoint
elsewhere in the app.

Reached through the frontend's existing Vercel rewrite as:

- `https://gaffer-virid.vercel.app/api/v1/formations`
- `https://gaffer-virid.vercel.app/api/v1/tactics`
- `https://gaffer-virid.vercel.app/api/v1/public-dashboard/filters`

## What's served

The formations and tactics endpoints return static, shared coaching reference content — never a
team's saved game plan, squad selection, or any user/account data:

- **Formations** (`backend/src/public-api/formations.data.ts`) — the supported
  5-, 7- and 11-a-side formations, including custom slots. Each carries
  `playerCount`. IDs mirror `FORMATION_IDS` in `backend/src/common/formations.ts`; keep
  both in sync if a formation is added or renamed.
- **Tactics** (`backend/src/public-api/tactics.data.ts`) — the defensive and
  offensive tactical styles from
  `frontend/src/features/team-tactics/tactics-options.ts`, flattened into
  one catalog with a `category` field. `formationId` is always `null`
  because a style applies across every formation.
- **Public dashboard** (`backend/src/public-api/public-dashboard.service.ts`)
  — database-backed matches, active players and their aggregate statistics,
  competition standings, and dynamic team/competition/season filters. Sporting
  data for every team is public; account, contact, RSVP, notes, and
  authentication fields are never selected.

## Contract

```
GET /v1/formations            -> { success, count, data: PublicFormation[] }
GET /v1/formations?id={id}    -> { success, count: 1, data: [PublicFormation] }
GET /v1/tactics                -> { success, count, data: PublicTactic[] }
GET /v1/tactics?id={id}        -> { success, count: 1, data: [PublicTactic] }
GET /v1/public-dashboard/filters
GET /v1/public-dashboard/matches?teamId=&competitionId=&seasonId=&status=
GET /v1/public-dashboard/players?teamId=&competitionId=&seasonId=&limit=&offset=
GET /v1/public-dashboard/team-statistics?teamId=&competitionId=&seasonId=
```

- `id` present but empty (`?id=`) → `400`.
- `id` present but unknown → `404` with Nest's default `{ statusCode, message, error }` body.
- Dashboard filter IDs must be UUIDs. Invalid filters return `400`; valid but
  unavailable/private IDs return empty data rather than revealing existence.
- Paging is bounded: `matches` accepts `limit` 1–100 (default 50) and `players`
  `limit` 1–200 (default 100). A larger `limit` is a `400`, not a clamped
  response, so a client paging until it sees a short page is never silently
  truncated.
- Any other failure uses Nest's default `500` handler, which does not expose
  raw database errors.

## Rate limiting and caching

`/v1/public-dashboard/*` is the only unauthenticated group that queries the
database, so it is throttled and cached (SEC-008). `/v1/formations` and
`/v1/tactics` serve static in-process data and are not.

- **Rate limit** — 120 requests per minute per client, plus a shared backstop
  bucket keyed on the edge-observed IP that stops a caller rotating forged
  forwarding headers. Exceeding either returns `429` with
  `{"message": "Too many requests. Please try again later."}` before the query
  runs. Both budgets are configurable (see `.env.example`).
- **Caching** — responses are cached for 30 seconds per distinct set of
  validated query parameters, and concurrent requests for the same uncached
  parameters share one database query rather than each running their own. The
  practical effect for a consumer is that polling faster than every 30 seconds
  returns the same payload; the data is not live to the second.

`backend/scripts/benchmark-public-dashboard.mjs` (`npm run
benchmark:public-dashboard` in `backend/`) measures the worst-case player
aggregation against a real database and prints its query plan.

## CORS

These routes are carved out of the app's normal cookie-authenticated
CORS policy in `backend/src/cors-config.ts` (`isPublicApiPath`): they get
`Access-Control-Allow-Origin: *` with `credentials: false`, so any origin
can fetch them client-side. Every other route keeps the existing strict
origin allowlist. See `backend/src/cors-config.spec.ts` for the covering
tests (the e2e harness never calls `app.enableCors`, so this can't be
asserted from `test/public-api.e2e-spec.ts`).

## Documentation

Swagger UI is public at `/api/docs` in every environment, including production.
After deployment, external developers can open
`https://gaffer-api-ynaf.onrender.com/api/docs` without an account, API key or token.
The local URL is `http://localhost:3000/api/docs`.

The JSON and YAML schemas are available at `/api/docs-json` and `/api/docs-yaml`.
They document exactly six public GET endpoints, grouped under "Public API" and
"Public Dashboard", with query parameters, response fields and validation errors.
Swagger's "Try it out" sends requests to the same backend serving the docs.
Matches use `limit` 1–100 (default 50); players use `limit` 1–200 (default 100).
Both accept `offset` ≥0 (default 0) and return `{success,count,limit,offset,data}`.
Filters return `{success,data}`; team statistics return `{success,count,data}`.

Protected application endpoints retain their existing session and authorization
checks and are excluded from this public schema. See the
[Swagger policy](swagger-policy.md) for verification and the
[PDF reference](Gaffer-Public-API-Reference.pdf) for the catalog reference.

## Out of scope here

Weather (OpenWeather/Open-Meteo) was already implemented separately in
`backend/src/weather/` before this change and isn't part of this doc.

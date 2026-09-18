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

Both endpoints return static, shared coaching reference content — never a
team's saved game plan, squad selection, or any user/account data:

- **Formations** (`backend/src/public-api/formations.data.ts`) — the eight
  formations selectable on the Team Tactics screen. IDs mirror
  `FORMATION_IDS` in `backend/src/game-plans/game-plans.schemas.ts`; keep
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
GET /v1/public-dashboard/players?teamId=&competitionId=&seasonId=
GET /v1/public-dashboard/team-statistics?teamId=&competitionId=&seasonId=
```

- `id` present but empty (`?id=`) → `400`.
- `id` present but unknown → `404` with Nest's default `{ statusCode, message, error }` body.
- Dashboard filter IDs must be UUIDs. Invalid filters return `400`; valid but
  unavailable/private IDs return empty data rather than revealing existence.
- Any other failure uses Nest's default `500` handler, which does not expose
  raw database errors.

## CORS

These routes are carved out of the app's normal cookie-authenticated
CORS policy in `backend/src/cors-config.ts` (`isPublicApiPath`): they get
`Access-Control-Allow-Origin: *` with `credentials: false`, so any origin
can fetch them client-side. Every other route keeps the existing strict
origin allowlist. See `backend/src/cors-config.spec.ts` for the covering
tests (the e2e harness never calls `app.enableCors`, so this can't be
asserted from `test/public-api.e2e-spec.ts`).

## Documentation

Both controllers carry `@nestjs/swagger` decorators and are grouped under
the "Public API" tag in the existing Swagger UI at `/api/docs` on the
backend deployment (`https://gaffer-api-ynaf.onrender.com/api/docs`).

## Out of scope here

Weather (OpenWeather/Open-Meteo) was already implemented separately in
`backend/src/weather/` before this change and isn't part of this doc.

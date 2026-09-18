# Public Gaffer API

`GET /v1/formations` and `GET /v1/tactics` are externally accessible,
unauthenticated, read-only endpoints (`backend/src/public-api/`). They exist
so an outside developer/assessor can consume Gaffer data without a session,
and are separate from every team-scoped, cookie-authenticated endpoint
elsewhere in the app.

Reached through the frontend's existing Vercel rewrite as:

- `https://gaffer-virid.vercel.app/api/v1/formations`
- `https://gaffer-virid.vercel.app/api/v1/tactics`

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

## Contract

```
GET /v1/formations            -> { success, count, data: PublicFormation[] }
GET /v1/formations?id={id}    -> { success, count: 1, data: [PublicFormation] }
GET /v1/tactics                -> { success, count, data: PublicTactic[] }
GET /v1/tactics?id={id}        -> { success, count: 1, data: [PublicTactic] }
```

- `id` present but empty (`?id=`) → `400`.
- `id` present but unknown → `404` with Nest's default `{ statusCode, message, error }` body.
- Any other failure → Nest's default `500` handler (no bespoke error path — there's nothing here that can fail beyond a bad/missing id, unlike the weather integration below).

## CORS

These two routes are carved out of the app's normal cookie-authenticated
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

# Sport Coaching Tool

Development foundation for a sport coaching platform with a React/Vite frontend
and NestJS backend.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Base UI,
  Lucide, TanStack Query, Socket.io client, Oxlint
- Backend: NestJS, TypeScript, Drizzle ORM, PostgreSQL/Neon driver, Zod,
  better-auth, Socket.io, Swagger/OpenAPI
- Testing: Jest, Supertest, Playwright

## Setup

```bash
npm install
npm --prefix frontend install
npm --prefix backend install
```

Copy `.env.example` to `.env` when database or auth secrets are available.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:e2e
npm run test:e2e:ui
```

Frontend runs on `http://localhost:5173`.
Backend runs on `http://localhost:3000`.
Swagger docs are available at `http://localhost:3000/api/docs`.

## Testing

Three layers of automated tests exist, run from the repo root unless noted:

| Command | What it runs | Needs |
| --- | --- | --- |
| `npm test` | Backend unit tests (`backend/src/**/*.spec.ts`), services/controllers with dependencies mocked. | Nothing extra. |
| `npm run test:e2e` | Backend integration tests (`backend/test/**/*.e2e-spec.ts`) — boot the real NestJS app and hit its HTTP endpoints with [Supertest](https://github.com/ladjs/supertest). | A reachable `DATABASE_URL` (see below). |
| `npm run test:e2e:ui` | Full-stack browser e2e (`e2e/**/*.spec.ts`) via [Playwright](https://playwright.dev) — drives a real Chromium browser against the real Vite dev server and Nest API. | A reachable `DATABASE_URL`; auto-starts both dev servers if they aren't already running (`npm run dev`). |

**There is no separate test database yet.** Integration and e2e tests run
against whatever Postgres `DATABASE_URL` in `.env` points at (the shared dev
database in this repo's current setup) — every test creates its data with a
random, uniquely-prefixed email/team name and deletes it again in
`afterAll`/`finally`, so a clean run leaves no residue. If a run crashes
mid-way, test rows are identifiable by their `s1-07*`-prefixed email/team
name and safe to delete manually.

**Current coverage:** the auth flow (sign-up, sign-in, session, sign-out),
team isolation, athlete/event CRUD (create, list, get, update,
archive/restore or cancel, and team-scoping so one team never sees another's
data), and the dashboard summary endpoint (active athlete count, total event
count, next-five upcoming events, correctly team-scoped) are covered
end-to-end via Supertest. The Playwright e2e test covers Register →
Dashboard (zeroed-out counts for a new team) → add an athlete on the Roster
page → see it appear → visit Events → back to Dashboard, reloaded, showing
the updated athlete count. It doesn't drive event *creation* through the
UI — the event form uses a custom calendar/time-column picker with no plain
date/time inputs, which would make the browser test slow and flaky for
little extra signal over `events.e2e-spec.ts`; the Events page is still
checked for loading correctly (empty state) for a signed-in coach. The
dashboard's Sprint 2 fields (live match, season summary, recent form,
per-match stats) have no backend yet and are asserted to render their empty
states rather than error.

## Structure

```text
SportCoachingTool/
├── frontend/
├── backend/
├── docs/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

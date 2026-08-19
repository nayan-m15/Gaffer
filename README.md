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

**Current coverage:** the auth flow (sign-up, sign-in, session, sign-out) and
team isolation (each coach gets their own team; one user's session never
returns another's team) are covered end-to-end. Athlete CRUD and event CRUD
are **not** covered yet — athlete CRUD lives on the unmerged
`feat/roster-crud` branch and gets its own test coverage once that merges;
event CRUD has no backend implementation yet. The Playwright e2e test covers
Register → Dashboard (see your account and team) rather than the full
Register → Create Athlete → Dashboard flow, for the same reason.

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

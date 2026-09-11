# Sport Coaching Tool

A full-stack platform that helps sport coaches manage their team from one
place: coach accounts with email verification and Google sign-in, an athlete
roster, a season/fixture calendar, a live dashboard summary, and team
statistics — all scoped per team so coaches only ever see their own data.

Built with a React/Vite frontend and a NestJS backend.

📖 **Project documentation:** [SDP Interlude Documentation](https://nayan-m15.github.io/SDP-Project-Documentation)

🌐 **Live Webpage:** [Gaffer](https://gaffer-virid.vercel.app/)

## Features

- **Auth & onboarding** — email/password and Google sign-up, email
  verification before sign-in, coach onboarding and team creation
- **Roster management** — add, edit, archive/restore athletes, scoped to the
  coach's team
- **Events** — create and browse team events on a calendar/time-column picker
- **Dashboard** — live summary cards (active athletes, upcoming events,
  season/match info)
- **Statistics** — team and competition statistics pages
- **Profile management** — editable coach profile details
- **Public marketing pages** — landing, features, and "how it works" pages

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
| `npm run test:e2e` / `npm run test:integration` | Backend integration tests (`backend/test/**/*.e2e-spec.ts`) — boot the real NestJS app and hit its HTTP endpoints with [Supertest](https://github.com/ladjs/supertest). | A migrated, isolated `TEST_DATABASE_URL` that differs from `DATABASE_URL`. |
| `npm run test:e2e:ui` | Full-stack browser e2e (`e2e/**/*.spec.ts`) via [Playwright](https://playwright.dev) — drives a real Chromium browser against the real Vite dev server and Nest API. | A reachable `DATABASE_URL`; auto-starts both dev servers if they aren't already running (`npm run dev`). |


## Structure

```text
SportCoachingTool/
├── frontend/
├── backend/
├── docs/
├── e2e/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## AI Declaration

This project was built with the assistance of AI coding tools throughout
development, used for code generation, refactoring, UI implementation, and
test authoring, with all output reviewed and committed by the team. Per the
commit history, the following tools were used:

- **Codex** (GPT-5.5 and GPT-5.6 "Terra"/"Luna") — feature implementation,
  bug fixes, and the initial project scaffolding (`CODEX_HANDOFF.md`)
- **Claude Code** (Claude Sonnet 5) — feature implementation, backend
  integration tests, and bug fixes
- **Qoder** (Agent/Auto) — UI refactors and styling
- **ChatGPT** (GPT-5.5) — supporting implementation work
- **Antigravity AI** (Gemini 3.6 Flash) — supporting implementation work
- **Granola AI** — recording and transcription of selected project meetings,
  and assistance in generating structured meeting notes, with all generated
  notes reviewed by the team for accuracy before inclusion in the project
  documentation.


Commits that include AI assistance are marked with an `Assisted by:` or
`Co-authored-by:` trailer naming the tool used; see the git log for the
full, per-commit breakdown.

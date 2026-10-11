# Sport Coaching Tool

A full-stack platform that helps sport coaches manage their team from one
place: coach accounts with email verification and Google sign-in, an athlete
roster, a season/fixture calendar, a live dashboard summary, and team
statistics — all scoped per team so coaches only ever see their own data.

Built with a React/Vite frontend and a NestJS backend.

[![Coverage](https://img.shields.io/sonar/coverage/sport-coaching-tool?server=http%3A%2F%2F92.4.134.68%3A9000&sonarVersion=10.0)](http://92.4.134.68:9000/dashboard?id=sport-coaching-tool)

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

### Additional implemented workflows

- **Player hub and invitations** — coaches send athlete claim links and
  assistant-coach invitations. Claimed players have their own dashboard, team,
  events, competition views, and event RSVP controls.
- **Match preparation and live logging** — confirm starters, substitutes and
  opponent squads, then record goals, assists, key passes, saves, cards,
  penalties, substitutions, injuries and tactical changes. The logger includes
  a match clock, event review, finish/resume controls and post-match reports.
- **Team management and tactics** — choose formations for 5-, 7- or 11-a-side
  football, position players on the pitch, assign team roles and individual
  instructions, and save reusable game plans.
- **Shared competitions and friendlies** — create leagues, knockout cups or
  combined formats; invite participating teams; generate fixtures; propose
  and accept schedules; maintain results and standings. Friendly requests can
  be accepted or declined by the opposing coach.
- **Injury recovery** — record body region, injury type, severity and estimated
  return dates; inspect a 3D body view; maintain recovery timelines and close
  injury records. Return-time guidance comes from repository protocols.
- **Season analytics** — filter statistics by season and competition, inspect
  form and period trends, and compare two or three athletes.
- **Offline match capture** — a local SQLite queue retains observations and
  operations for later upload, with readiness checks, sync status and unsent
  data export/import. See the synchronization notes under Structure.
- **Gaffer AI** — guided roster, injury, competition and lineup conversations
  propose actions for explicit confirmation. Optional Gemini integration also
  supplies match narratives, coach-requested season summaries and read-only
  statistics questions.
- **Reminders** — dashboard banners highlight scheduled events in the next
  24 hours; dismissals are stored on the device.

### Users and permissions

Gaffer serves football coaches, assistant coaches, claimed players and public
visitors. A coach/assistant account has one team membership, enforced by the
database. Player identity is a claimed athlete record; a player can have claims
on multiple teams, selected using `athleteId`.

| User | Implemented access |
| --- | --- |
| Coach | Manage the team's roster, events, game plans, seasons, assistants and injury records; log matches, resolve reviews and finalise/reopen results. |
| Assistant | Read team resources, log live events, operate the clock and report new injuries. Managed-resource edits, review resolution and result finalisation remain coach-only. |
| Claimed player | Read their player hub, team events and competition information, and RSVP to events for their claimed athlete. |
| Competition administrator | The creating coach administers the shared competition, participant slots, fixtures and results; participating coaches respond for their own linked team. |
| Public visitor | Browse the landing page, public dashboard and anonymous read API without an account. |

The backend resolves membership from the session and checks resource ownership.
Frontend route guards supplement these checks. Competition administration is
a resource-specific permission, rather than a separate global administrator
role. See [contracts and authorization](docs/contracts-and-authorization.md).

A typical coach workflow is to register and verify email, create a team, add
athletes and invite assistants/players, prepare an event and lineup, start the
match, log play, resolve outstanding reviews, then finalise the result and
inspect reports. Two-sided shared fixture logging additionally requires
`TWO_SIDED_LIVE_LOGGING_ENABLED=true`; it is disabled when unset.

### Public dashboards, reporting and sharing

The anonymous `/public-dashboard` page includes Squad Showcase, Match Center,
and Leagues & Cups. Team, season and competition filters narrow the data;
player search, position categories, match status filters and load-more controls
support browsing larger datasets. Player totals count completed matches.

**Visibility clarification:** the team-scoping statement in the introduction
describes protected coaching resources. The public dashboard intentionally
publishes sporting data across teams: player names, positions, shirt numbers,
match schedules/results, fixtures, statistics and standings. Its explicit
response selections omit account/contact details, birth dates, injury records,
private notes, RSVPs and authentication data. It is not a per-team private
dashboard or a private report-sharing service.

Statistics reports support PDF/CSV export, a print preview and native PDF file
sharing with a download fallback. Game plans, injury reports and match reports
also export PDFs. Match-report sharing sends the current protected page URL and
summary through Web Share or copies them to the clipboard; the recipient still
needs authorized access to that report.

**Marketing route clarification:** Features and How It Works are currently
sections on the landing page at `/#features` and `/#how-it-works`, rather than
separate registered routes in `App.tsx`.

### Layout, themes and graphics

Desktop and mobile layouts include a mobile navigation bar and calendar views.
Light/dark theme choice persists locally and initially follows the system
preference. Dialog focus handling, accessible control labels and status/alert
regions are implemented, but no project-wide accessibility certification is
documented.

Three.js powers the landing stadium, injury body viewer and onboarding
celebrations. The landing scene loads lazily, pauses when the document is hidden,
limits render resolution and falls back to a static background for reduced
motion, data saving, constrained memory or unsupported/software WebGL.
Graphics resources are disposed on teardown. See
[landing performance](docs/landing-performance.md).

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Base UI,
  Lucide, TanStack Query, Socket.io client, Oxlint
- Backend: NestJS, TypeScript, Drizzle ORM, PostgreSQL/Neon driver, Zod,
  better-auth, Socket.io, Swagger/OpenAPI
- Testing: Jest, Supertest, Playwright

### Version and dependency reference

The following are resolved versions in the committed package lockfiles;
manifest ranges can accept newer compatible releases when dependencies are
updated.

| Area | Locked versions / implementation |
| --- | --- |
| Frontend core | React 19.2.8, React Router 7, Vite 8.2.1, TypeScript 6.0.3 |
| UI and charts | Tailwind CSS 4, Base UI, Radix components, Lucide, Recharts, Motion, GSAP and Driver.js tours |
| Browser persistence | PowerSync Web 2.3.1, PowerSync React, wa-sqlite and vite-plugin-pwa/Workbox |
| Graphics and exports | Three.js 0.128.0, OGL and jsPDF |
| Backend core | NestJS 11.2.1, TypeScript 5.9.3 and Express platform adapter |
| Persistence and auth | Drizzle ORM 0.45.2, Neon HTTP driver, PostgreSQL, Better Auth 1.7.7 backend / 1.6.29 frontend |
| External integrations | Brevo transactional email, Google OAuth, optional Google Gemini, Open-Meteo and Nominatim |
| Quality tools | Jest 30, Supertest, Playwright, Node test runner, frontend Oxlint, backend ESLint/Prettier and SonarQube |

The manifests and lockfiles in the root, `frontend/` and `backend/` define
their own dependency installs; this repository does not use npm workspaces.
`@gaffer/match-domain` is a local CommonJS package linked into the backend.

**Synchronization clarification:** Socket.io packages and a Nest `IoAdapter`
are present, but the current source contains no application Socket.io gateway
or client subscription. Implemented refresh uses TanStack Query polling,
cross-tab notifications and optional PowerSync replication.

## Setup

```bash
npm install
npm --prefix frontend install
npm --prefix backend install
```

Copy `.env.example` to `.env` when database or auth secrets are available.

### Prerequisites and first run

Use Node.js 22.12 or newer in the Node 22 line (the CI workflows use Node 22)
and npm. The locked Vite package accepts Node `^20.19.0 || >=22.12.0`;
NestJS 11 requires Node 20 or newer. No root Node-version pin is committed.

A reachable Neon/PostgreSQL database compatible with the Neon HTTP driver is
required for the backend. An ordinary local PostgreSQL server alone does not
provide the HTTP endpoint used by this implementation. Docker is optional for
SonarQube and runner tooling; the SonarQube Compose database is not Gaffer's
application database.

After the dependency installation shown above:

1. Copy the root `.env.example` to a root `.env`, retaining
   `NODE_ENV=development`.
2. Set `DATABASE_URL` to a development database and generate a private
   `BETTER_AUTH_SECRET` (the example suggests `openssl rand -base64 32`).
3. Apply the existing migrations, then start the application:

   ```bash
   npm --prefix backend run db:migrate
   npm run dev
   ```

4. Open `http://localhost:5173`. With no `BREVO_API_KEY`, development
   verification and invitation links are logged to the backend console.

The root dev script starts Nest first and waits up to 90 seconds for its
root endpoint before launching Vite. Migrations are a separate step.
The backend loads the root `.env` through
`backend/src/database/environment.ts`; Vite uses `envDir: '..'`.
The empty `frontend/.env.example` is not the active configuration reference.

Google OAuth, Brevo delivery, Gemini and hosted PowerSync are optional for the
basic local workflow. Weather/location features call external services and
need network access. To use Google locally, configure both Google credentials
and the redirect URI `http://localhost:3000/auth/callback/google`.

### Environment variables

Use [.env.example](.env.example) as the configuration template. Keep real values
in uncommitted configuration or hosting secrets. All `VITE_*` values are
public build-time browser configuration: never place passwords, database URLs,
API keys or signing secrets in them. Backend variables are server-only.

| Backend variable | Requirement, purpose and default |
| --- | --- |
| `NODE_ENV` | Set explicitly: `development` locally, `production` when deployed; controls origin trust, cookie security and email fallback. |
| `DATABASE_URL` | Required; private Neon/PostgreSQL connection URL used by the app and migrations. |
| `TEST_DATABASE_URL` | Required for integration and full-stack browser tests; a disposable database distinct from development/production. |
| `BETTER_AUTH_SECRET` | Configure a generated secret for auth; required deployment secret. |
| `BETTER_AUTH_URL` | Public origin serving `/auth`; local example `http://localhost:3000`. Production uses the frontend origin that proxies auth. |
| `FRONTEND_URL` | Frontend origin for callbacks, invitations and credentialed CORS; defaults to `http://localhost:5173`. |
| `PORT` | Optional backend port; defaults to `3000`, binds `0.0.0.0`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional pair; Google sign-in is enabled only when both are set. Keep the client secret server-only. |
| `BREVO_API_KEY` | Optional locally; required for real email delivery. Development logs links when absent; test suppresses tokens; production delivery fails when unconfigured. |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Sender identity; defaults to `no-reply@example.com` / `SportCoachingTool`. Configure a valid production sender. |
| `GEMINI_API_KEY` | Optional private key enabling generated insights, statistics Q&A and assistant field extraction. |
| `GEMINI_MODEL` | Optional model name or comma-separated fallback chain; unset uses the chain in `backend/src/insights/gemini-client.ts`. |
| `AUTH_SIGN_IN_RATE_LIMIT` | Optional `max:seconds`; default `10:300` for sign-in/reset-token attempts. |
| `AUTH_EMAIL_RATE_LIMIT` | Optional `max:seconds`; default `5:900` for signup, verification resend and forgotten-password email requests. |
| `AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT`, `AUTH_EMAIL_BACKSTOP_RATE_LIMIT` | Optional edge-IP limits in the same format; defaults are ten times the corresponding primary budgets. |
| `WEATHER_API_URL` | Optional forecast endpoint; defaults to `https://api.open-meteo.com/v1/forecast`. |
| `GEOCODING_API_URL` | Optional search endpoint; defaults to `https://geocoding-api.open-meteo.com/v1/search`. |
| `REVERSE_GEOCODING_API_URL` | Optional reverse lookup endpoint; defaults to `https://nominatim.openstreetmap.org/reverse`. |
| `GEOCODING_USER_AGENT` | Optional reverse-geocoding identification; configure a project/contact identity for your deployment. |
| `WEATHER_CACHE_MINUTES`, `WEATHER_HISTORY_DAYS`, `WEATHER_FORECAST_DAYS` | Optional weather tuning; defaults `30`, `5`, `16`. |
| `POWERSYNC_URL` | Required for remote peer replication/token issuance; use the intended PowerSync instance endpoint. |
| `POWERSYNC_KID` | Required with PowerSync signing; must match the verifier key ID. |
| `POWERSYNC_PRIVATE_KEY` | Private PKCS#8 RSA signing key for production RS256/JWKS; escaped newlines are supported. |
| `POWERSYNC_SHARED_SECRET` | Alternative development HS256 key, encoded as base64url; keep private and match the isolated instance's verifier. Prefer RSA in production. |
| `OFFLINE_SYNC_ENABLED` | Optional; literal `false` pauses uploads as dependency-pending. Otherwise uploads are enabled. |
| `OFFLINE_SYNC_MATCH_IDS` | Optional comma-separated match allowlist; empty/unset enables all matches. |
| `TWO_SIDED_LIVE_LOGGING_ENABLED` | Optional; `true` enables shared fixture sessions. Unset/other values disable it. Referenced by source but absent from the root example. |
| `OPERATIONS_HEALTH_TOKEN` | Required to enable `GET /health/operations`; separate private bearer credential. |
| `PUBLIC_DASHBOARD_RATE_LIMIT` | Optional `max:seconds`; default `120:60`. |
| `PUBLIC_DASHBOARD_BACKSTOP_RATE_LIMIT` | Optional edge-IP budget; defaults to twenty times the primary dashboard budget. |
| `PUBLIC_DASHBOARD_CACHE_TTL_SECONDS`, `PUBLIC_DASHBOARD_CACHE_MAX_ENTRIES` | Optional response-cache bounds; defaults `30` seconds and `500` entries. |

| Frontend variable | Requirement and behavior |
| --- | --- |
| `VITE_API_URL` | Optional development-only backend override, e.g. `http://localhost:3000`. Production requests always use same-origin `/auth` and `/api`. |
| `VITE_POWERSYNC_URL` | Optional non-empty setting enabling remote sync in the browser; actual endpoint/token come from authenticated `/sync/token`. Keep it aligned with the backend instance. |
| `VITE_DEPLOYMENT_ENV` | Optional public deployment label, e.g. `local`; scopes offline database names and telemetry. Defaults to the browser hostname when unset. |

Operator/test scripts additionally read `UI_TEST_PRODUCTION` (built browser
tests), `CI_TEST_DATABASE_BASE_URL` (CI disposable-database provisioning),
`OPERATIONS_HEALTH_URL` (full monitoring endpoint),
`MAX_REPLICATION_LAG_BYTES` (default 64 MiB),
`MAX_UNRESOLVED_REVIEWS` (default 20), and `SONAR_HOST_URL` /
`SONAR_TOKEN` for analysis/diagnostics. These are not browser settings.

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
Public Swagger docs are available at `http://localhost:3000/api/docs` and,
after deploying this change, `https://gaffer-api-ynaf.onrender.com/api/docs`.
The UI and JSON/YAML schemas document the six anonymous public GET endpoints
in every environment, including production. See the
[Swagger policy](docs/swagger-policy.md) for deployment and verification details.

### Additional developer commands

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `npm --prefix frontend run dev` | Run Vite separately. |
| `npm --prefix backend run start:dev` | Run the Nest watch server separately. |
| `npm --prefix frontend run build` | Type-check with `tsc -b`, then build to `frontend/dist/`. |
| `npm --prefix backend run build` | Compile the backend to `backend/dist/`. |
| `npm --prefix frontend run preview` | Preview the built frontend locally (Vite default port 4173); not the production hosting service. |
| `npm --prefix backend run start:prod` | Run compiled `dist/src/main` with `NODE_ENV=production`; build first. |
| `npm --prefix backend run db:generate` | Generate a migration after intentional Drizzle schema changes; review the SQL. |
| `npm --prefix backend run db:migrate -- --dry-run` | Read pending migrations without changing the database. |
| `npm --prefix backend run db:diagnose:powersync` | Inspect the replication source configuration. |
| `npm --prefix backend run benchmark:public-dashboard` | Measure public player-query behavior against the configured database. |

### API overview

Backend paths below have no global `/api` prefix. Browser requests use
`frontend/src/lib/api-url.ts`: `/auth/*` remains `/auth/*`, and other
paths receive `/api` for the Vite/Vercel proxy unless the development override
is set. For example, browser `/api/athletes` reaches backend `/athletes`.

| Backend group | Function and access |
| --- | --- |
| `/auth`, `/profile`, `/teams` | Registration/login, verification, password/email changes, session/profile and team identity. Auth entry routes are anonymous; session/profile/team management require a session. |
| `/athletes`, `/team-invites`, `/claims` | Roster, assistants and player claims. Invite/claim preview routes are anonymous; acceptance requires sign-in and management is coach-gated. |
| `/player` | Claimed-player views; session plus an owned athlete claim. |
| `/dashboard`, `/events`, `/locations` | Team summaries, events/RSVP/lineups and location/weather lookup; authenticated, with additional ownership/role checks. |
| `/game-plans`, `/injuries`, `/seasons` | Team plans, recovery and season resources; member reads and policy-controlled writes. |
| `/matches`, `/sync` | Match sheets, timeline/clock, reviews, finalisation/amendments, typed upload receipts and telemetry. Session and team access required; `/sync/jwks` publishes only public signing keys anonymously. |
| `/statistics`, `/ai-assistant` | Team analytics, optional narratives/Q&A and confirmed assistant actions; authenticated with write-specific permissions. |
| `/competitions`, `/competition-invites`, `/friendly-fixtures` | Shared competitions, schedules, participation and friendly requests; session and relevant administrator/participant permissions, except anonymous invite previews. |
| `/v1/formations`, `/v1/tactics`, `/v1/public-dashboard/*` | Anonymous read-only public contract; wildcard CORS without credentials. |
| `/`, `/health/database`, `/health/operations` | Root response, anonymous database reachability and bearer-protected operations monitoring. |

Protected requests use the Better Auth session cookie, sent by the frontend
fetch wrapper with `credentials: "include"`. Zod schemas validate request
bodies and selected query parameters; UUID pipes validate resource IDs.
Application responses are usually direct objects/arrays, while public API
responses use `{ success, data }` with `count` and paging fields where
applicable. Nest errors generally use `{ statusCode, message, error }`;
common statuses are 400 (validation), 401 (session), 403 (permission),
404 (missing/inaccessible resource), 409 (conflict), 429 (rate limit) and
503 (unavailable service). The frontend raises `ApiError` with status/message.

**Updated Swagger information:** the source now registers seven anonymous
GET endpoints: `/v1/formations`, `/v1/tactics`, and dashboard
`filters`, `matches`, `players`, `competition-fixtures`,
`team-statistics`. The six-endpoint statement above and in the linked
guides predates `competition-fixtures`. Swagger includes only
`PublicApiModule`, not the protected application API. JSON and YAML are at
`/api/docs-json` and `/api/docs-yaml` on the backend origin.

Matches accept `limit` 1–100 (default 50); players accept 1–200 (default 100),
with non-negative `offset`. Match responses include a full-filter-set
`summary` independently of the current page. Dashboard endpoints are
rate-limited; filters, matches, player statistics and standings use a
30-second default response cache. The current `competition-fixtures`
handler calls its service directly, without that response cache.

The new `competition-fixtures` route is visible in Swagger but does not yet
provide explicit response-body schema or query-parameter decorators like the
other dashboard routes; its runtime query validation still uses Zod.

See [public API details](docs/public-api.md) and the
[PDF catalog reference](docs/Gaffer-Public-API-Reference.pdf).

### Demo account

A shared demo coach seeded with a full season of match history, so the
Statistics page has enough data to show trends, period comparisons and player
comparison without logging matches by hand.

```
http://localhost:5173/login
email:    demo.coach@example.com
password: password123
```

It lives in whichever database `DATABASE_URL` points at and persists until
someone removes it. To recreate it (dev servers must be running):

```bash
node backend/scripts/seed-demo-account.mjs           # create if missing (safe to re-run)
node backend/scripts/seed-demo-account.mjs --reset   # rebuild from scratch
node backend/scripts/seed-demo-account.mjs --clean   # remove it
```

**Demo fixture clarification:** the seed script is development-only and
reads `DATABASE_URL` directly from the root `.env`. Keep its API target
and database aligned; never use it with production data. `--reset` and
`--clean` delete the demo team/account and associated data.

## Testing

Three layers of automated tests exist, run from the repo root unless noted:

| Command | What it runs | Needs |
| --- | --- | --- |
| `npm test` | Backend unit tests (`backend/src/**/*.spec.ts`), services/controllers with dependencies mocked. | Nothing extra. |
| `npm run test:e2e` / `npm run test:integration` | Backend integration tests (`backend/test/**/*.e2e-spec.ts`) — boot the real NestJS app and hit its HTTP endpoints with [Supertest](https://github.com/ladjs/supertest). | A migrated, isolated `TEST_DATABASE_URL` that differs from `DATABASE_URL`. |
| `npm run test:e2e:ui` | Full-stack browser e2e (`frontend/e2e/**/*.spec.ts`) via [Playwright](https://playwright.dev) — drives a real Chromium browser against the real Vite dev server and Nest API. | A reachable `DATABASE_URL`; auto-starts both dev servers if they aren't already running (`npm run dev`). |


### Updated test requirements and quality checks

**Clarification to the table above:** root `npm test` now runs the shared
`packages/match-domain/index.test.cjs` suite before backend Jest tests.
Some backend units also exercise SQL behavior using embedded PGlite, without
requiring an external test database.

`npm run test:e2e` and `npm run test:integration` both run
`db:migrate:test` before Jest. That command drops and recreates the
`public` and `drizzle` schemas in `TEST_DATABASE_URL`, then replays
the migration history. Use a disposable database; the script rejects a
missing URL or one exactly equal to `DATABASE_URL`.

**Browser-test setup clarification:** `npm run test:e2e:ui` requires
`TEST_DATABASE_URL`, chooses isolated localhost ports, substitutes that
database for the test backend, and starts dedicated servers rather than
reusing the ordinary development servers. It does not migrate the database
itself. Prepare the database and install Chromium first:

```bash
npm --prefix backend run db:migrate:test
npx playwright install chromium
npm run test:e2e:ui
```

| Command | Additional coverage / prerequisite |
| --- | --- |
| `npm --prefix frontend test` | Dependency-light frontend model/lifecycle tests in `src/**/*.node-test.mjs`, using Node's test runner. Not included in root `npm test`. |
| `npm run test:migrations` | Database-free migration planning regression tests. |
| `npm --prefix backend run test:cov` | Backend Jest coverage; post-hook normalizes `backend/coverage/lcov.info` for SonarQube. |
| `npm --prefix backend run test:watch` | Backend unit tests in watch mode. |
| `npm run test:e2e:pwa` | Production service-worker/PWA suite on port 4173; locally builds the frontend, while CI/production-test mode expects an existing build. |
| `npm run test:e2e:offline` | Builds the frontend and runs mocked offline-capture browser tests on desktop/mobile Chromium; service workers are blocked. |
| `npm --prefix backend run format` | Prettier writes backend source/test formatting; this is a mutating developer command. |

Root lint combines frontend Oxlint (`--deny-warnings`) with backend ESLint.
The frontend build includes TypeScript checking; the backend build compiles
its TypeScript. No root `typecheck` or frontend `format` script is
defined. Full-stack browser tests normally use local dev servers; with
`CI` or `UI_TEST_PRODUCTION=true`, build both applications first.
Focused configurations also exist in `playwright.regression.config.ts`,
`playwright.statistics.config.ts` and `playwright.landing.config.ts`.

[.gitea/workflows/test.yml](.gitea/workflows/test.yml) configures quality/build,
API tests, four browser shards and push-only SonarQube analysis for the
configured branches. Each stateful CI job provisions its own disposable
database. GitHub separately schedules
[offline sync health checks](.github/workflows/offline-sync-health.yml).
Workflow files establish intended checks, not evidence of a successful run.

See [testing notes](docs/testing.md), the
[physical-device offline checklist](docs/offline-field-test.md) and
[SonarQube setup and coverage scope](docs/sonarqube.md). Frontend tests do not
currently export LCOV; the coverage badge measures the configured backend
coverage, with frontend static analysis handled separately.

## Structure

```text
SportCoachingTool/
├── frontend/
│   └── e2e/
├── backend/
├── docs/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

### Application architecture

The more detailed source map supplements the directory overview above:

```text
frontend/
  src/
    main.tsx               React root, QueryClient and AuthProvider
    App.tsx                Lazy routes and authentication/team/player gates
    pages/                 Auth, dashboard, events, live match and report pages
    layouts/               Coach and player application shells
    features/              Feature UI, hooks, models and request adapters
    components/            Shared UI, navigation, dialogs and landing graphics
    context/               Session/account state and secure logout
    hooks/                 Shared auth, theme and sidebar hooks
    services/              API service functions
    lib/                   Fetch/URL helpers, query refresh and utilities
    offline/               SQLite schema, queue, caches and sync lifecycle
  public/                  Static/PWA assets and legal HTML pages
  e2e/                     Playwright browser specifications
  vite.config.ts           Root env loading, proxies, PWA and build plugins
backend/
  src/
    main.ts                Nest bootstrap, CORS, Swagger and listening port
    app.module.ts          Feature-module composition
    auth/                  Better Auth, controllers, session guard and limiter
    common/                Zod validation, team access and client-IP helpers
    database/              Neon/Drizzle client, environment and health checks
      schema/index.ts      Canonical tables, enums and persistence types
    matches/               Match sheets, shared sessions and reconciliation
    sync/                  JWT/JWKS, upload contracts, receipts and telemetry
    public-api/            Anonymous catalogs/dashboard, limits and cache
    insights/              Optional Gemini integration and stored narratives
    ai-assistant/          Guided conversations and confirmed service actions
  drizzle/                 SQL migrations and meta/_journal.json
  scripts/                 Migrations, seeds, diagnostics and operational tools
  test/                    HTTP integration tests and isolated DB setup
packages/match-domain/     Shared deterministic match rules and projections
powersync/                Main replication streams and service templates
powersync-recovery/       Recovery templates requiring deployment review
scripts/                  Root dev/test orchestration and quality tooling
docs/                     Design, tests, audits and operational guides
.gitea/workflows/test.yml  Application quality/test CI
.github/workflows/        Scheduled offline health monitoring
```

Other backend domain folders include `athletes/`, `claims/`,
`team-invites/`, `player/`, `events/`, `friendly-fixtures/`,
`game-plans/`, `injuries/`, `dashboard/`, `seasons/`,
`statistics/`, `competitions/`, `competition-invites/`,
`profile/`, `teams/` and `weather/`. Nest modules wire controllers
and services; controllers validate inputs and permissions before domain
services access Drizzle. Frontend `features/` folders group their own
components, hooks, data types and tested pure models. The `@` import alias
resolves to `frontend/src/`.

TanStack Query manages server state. Active queries default to five-second
refresh, with feature-specific overrides and refetch on focus/reconnect.
Writes notify related views through the fetch helper; BroadcastChannel
propagates changes across tabs. React context holds session/team/claimed-player
identity, while component/hooks hold editing state.

### Database and authentication flow

The canonical schema is
[backend/src/database/schema/index.ts](backend/src/database/schema/index.ts).
It includes Better Auth users/sessions/accounts/verification, team memberships,
athletes and invitations, events/RSVP/lineups, game plans, seasons,
competitions/participants/fixtures/results, match sheets/squads/timelines,
injuries/recovery, event observations/operations/reviews, projections,
insights, upload receipts and client telemetry.

`backend/drizzle.config.ts` maps that schema to `backend/drizzle/`.
Normal setup applies committed migrations with `db:migrate`; generating
new migrations is only for intentional schema changes. The custom migration
planner recognizes recorded migration content even when merged journal
timestamps move, and applies each pending migration transactionally using
the Neon driver's batch transaction support. Better Auth disables interactive
adapter transactions because the Neon HTTP driver does not support them.
[Database notes](docs/database-schema.md) describe an earlier schema snapshot;
the current TypeScript schema and migration journal cover later features.

Email/password signup sends a verification link; sign-in requires verification,
and successful verification automatically signs in. Google OAuth is configured
only when both provider credentials exist. Password recovery uses emailed
one-hour tokens and revokes sessions after reset. Account settings support
setting/changing a password and an email-change flow requiring approval at the
old address plus verification of the new address; completed email changes
revoke sessions. Google account linking requires the matching current email.

Better Auth persists sessions in PostgreSQL and uses HTTP-only session cookies;
cookies are SameSite Lax and Secure in production. `AuthGuard` verifies the
cookie and attaches the user/session to protected requests.
`GET /auth/session` returns `user`, `team` and `claimedAthletes`
for frontend hydration. Remembered email/password sessions can restore a local
offline identity after a network failure; this does not authorize server
requests or remote replication until the server session is confirmed.
A network-failed logout remains pending and retries when connectivity returns.

### Offline synchronization and shared match identity

The production PWA caches the application shell and selected assets.
`frontend/src/offline/match-store.ts` opens a PowerSync SQLite database
scoped by deployment and account, with local-only upload queues, response caches
and clock anchors. Prepared match metadata and squads must be loaded while
online before reliable offline capture/reload. A cached shared-session report
must also have been obtained before offline report access.

Capture uses a typed local queue, not arbitrary writes to synced tables.
Authenticated `POST /sync/upload` submits observations/operations with stable
IDs and receives durable outcomes such as accepted, rejected,
dependency-pending or quarantined. The backend checks current membership,
reconciles observations/reviews and derives authoritative projections.
Retrying an unchanged operation after a lost response preserves its identity.
Unresolved reviews and required confirmations affect result finalisation.

Optional PowerSync streams in `powersync/sync-config.yaml` replicate
authorized match data and peer changes. `GET /sync/token` issues five-minute
JWTs with user/team/role claims; `GET /sync/jwks` exposes the RSA public
verifier key. Local capture remains available when remote replication is
unconfigured or disconnected; peer delivery requires a working source,
deployed stream rules and matching signing trust.

When the two-sided flag is enabled, competition fixtures and accepted
friendlies link each team's private sheet to a canonical shared session.
Shared score/timeline/clock/report data is distinct from private tactics,
notes and squad details; opponent access is limited to confirmed lineup data
and authorized shared projections. Use the authenticated
`GET /events/:eventId/link-diagnostic` from each participating team to
compare fixture/session identities.

The readiness panel checks prepared data, service worker and storage.
Export unsent work before clearing browser storage or discarding a queue;
imports require the same account. PWA updates wait for user confirmation and display pending-queue information.
Apply updates after the match and drain/export pending work before storage or
schema recovery. See the [operations runbook](docs/offline-operations-runbook.md),
[two-sided rollout guide](docs/two-sided-live-logging-rollout.md) and
[PowerSync security notes](docs/powersync-security.md).

## Deployment

The repository configures a Vercel frontend proxying a Render API with Neon
persistence and optional PowerSync replication. The URLs at the top are intended
project URLs verified from tracked configuration; their availability and
deployed revision are not established by a source audit.

### Frontend and backend

1. Install the root, frontend and backend packages. For reproducible deployment
   use the committed lockfiles:

   ```bash
   npm ci
   npm --prefix frontend ci
   npm --prefix backend ci
   ```

2. Configure backend secrets and production origins, inspect/apply the pending
   migration plan against the intended database, then build:

   ```bash
   npm --prefix backend run db:migrate -- --dry-run
   npm --prefix backend run db:migrate
   npm run build
   ```

3. Serve `frontend/dist/` on Vercel. The build runs from the monorepo with
   frontend output; `vercel.json` and `frontend/vercel.json` define
   `/auth` and `/api` rewrites to the configured Render API plus the SPA
   fallback. The frontend-specific file also preserves the static
   `/terms-of-service.html` and `/privacy-policy.html` pages.
4. On Render, start the compiled backend using
   `npm --prefix backend run start:prod`, with the installed local
   `packages/match-domain/` dependency and host-supplied `PORT`.
   No Render infrastructure manifest is committed; confirm dashboard root
   directory/build/start settings for the chosen monorepo layout.

Set `NODE_ENV=production`, `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`FRONTEND_URL`, `BETTER_AUTH_URL`, and production email delivery/sender
configuration on the backend. In the configured deployment,
`FRONTEND_URL` and `BETTER_AUTH_URL` use
`https://gaffer-virid.vercel.app`; Google's callback must be
`https://gaffer-virid.vercel.app/auth/callback/google` when OAuth is enabled.
Keep browser auth/API calls on the frontend origin so cookies and OAuth state
remain first-party. Set public `VITE_*` values before the frontend build.

Credentialed CORS and Better Auth origin checks share
`backend/src/trusted-origins.ts`. Production trusts the tracked frontend
origin plus the configured `FRONTEND_URL`; localhost defaults are allowed
only in development/test. Anonymous `/v1` catalogs/dashboard use their
separate no-credentials CORS policy. Update both proxy files and provider/origin
settings when deploying to different hosts.

### Replication and monitoring

Before enabling hosted collaboration, enable logical replication on the source
and provision a `powersync_role` with LOGIN/REPLICATION. After migrations,
`npm --prefix backend run db:configure:powersync` grants SELECT and creates
or extends the `powersync` publication; it does not create that role.
Validate/deploy the main stream rules, configure the matching endpoint/key ID
and RSA signing trust, then deploy the backend before the frontend.
Use the rollout allowlist and physical-device checks before broad release.

The tracked templates disable temporary tokens, but source configuration does
not prove the live instance is hardened. The main template includes a local
validation public signer and the recovery template has different signing/rule
configuration. Confirm the active production endpoint, exclude development
signers, and follow [PowerSync deployment security](docs/powersync-security.md)
rather than deploying either template blindly.

Operations monitoring needs `OPERATIONS_HEALTH_TOKEN` on the backend and
`OPERATIONS_HEALTH_URL` / `OPERATIONS_HEALTH_TOKEN` as GitHub Actions
secrets. `node backend/scripts/check-offline-health.mjs` checks that protected
endpoint and reports queue, rejection, review and replication health.
Replication metrics can be null when the application role cannot inspect slots.

## Troubleshooting and current limitations

| Symptom / concern | Verified behavior or next check |
| --- | --- |
| Backend fails before Vite starts | Check root `.env`, database reachability and applied migrations. The dev launcher waits for Nest; `GET /health/database` verifies database access. |
| Verification/invite email missing locally | Use explicit `NODE_ENV=development` and the backend-console link when Brevo is unset. In production configure Brevo; development fallback is unavailable. Password-reset email delivery runs in the background, so inspect backend delivery failures too. |
| Google callback or session fails after deployment | Check frontend-origin `BETTER_AUTH_URL`, Google redirect URI, `FRONTEND_URL`, proxy rewrites and cookie origin. |
| Tests reject database configuration | Supply a dedicated disposable `TEST_DATABASE_URL`; integration migration/test setup resets its schemas. UI tests also require it. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd` / `npx.cmd` for the documented npm/npx commands on Windows. |
| Offline capture has no prepared data | Load the match/squad and verify readiness while online; full offline operation is focused on prepared match capture/reports, not every management screen. |
| Local queue works but peers do not update | Check `VITE_POWERSYNC_URL`, backend endpoint/signer/key ID, token authorization, logical replication, publication and deployed stream rules. |
| Shared result/report unavailable | Confirm `TWO_SIDED_LIVE_LOGGING_ENABLED=true`, shared fixture linkage, authorized participation and an online-cached report for offline access. |
| PDF print/share fails | Allow the print popup; file sharing depends on browser Web Share support and falls back to download. Protected report links remain protected. |
| Gemini insight unavailable | Check the optional key, configured model chain and provider errors; core match logging does not require generated narratives. |
| Assistant draft disappears on restart | Conversation drafts are per-process in-memory state with a two-hour TTL; multi-instance routing/restarts do not preserve them. |
| Public dashboard briefly shows older data | Most aggregation responses use the configurable 30-second cache; anonymous limiter/cache state is per backend instance. Auth rate-limit counters are database-backed. |

Browser storage persistence is requested but not guaranteed; clearing site data
can remove unsent work. Automated offline/browser tests do not establish
successful real-device or deployed PowerSync behavior. Existing dated audit
and rollout notes can describe historical limitations; confirm the actual
release revision, active feature flags and deployed services separately.

## Contributing and project policies

Use [git methodology](docs/git-methodology.md) for the documented branch/review
conventions and unresolved team decisions. Keep changes scoped, update request
contracts on both sides, include reviewed migrations when the schema changes,
and record applicable lint/build/test results and AI assistance.
[Contracts and authorization](docs/contracts-and-authorization.md) explains
the canonical Zod contracts and server-side ownership checks.

**License clarification:** no root project license file is present, and
`backend/package.json` declares `UNLICENSED`. Framework starter README
license statements describe their upstream frameworks; they do not establish
a license for Gaffer. Vendored UI attribution is retained in
`frontend/src/styles/vendor/shadcn-LICENSE.md`. Project licensing and a
dedicated vulnerability-reporting contact/policy still require team confirmation.

Useful maintenance references include
[dependency security](docs/dependency-security.md),
[automatic refresh](docs/automatic-data-refresh.md),
[product decisions](docs/product-decisions.md),
[statistics/report audit](docs/stats-report-audit.md) and the operational
guides linked above.

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


**Model-version note:** Newer models may also have been used as these tools
were updated during development. The model versions listed above may not
capture every version used; consult individual commit attributions where
available.

Commits that include AI assistance are marked with an `Assisted by:` or
`Co-authored-by:` trailer naming the tool used; see the git log for the
full, per-commit breakdown.

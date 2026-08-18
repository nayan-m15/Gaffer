# Codex Handoff: SportCoachingTool Setup

Last updated: 2026-08-13

## Original Goal

Set up the existing `SportCoachingTool` repository as a clean npm-based full-stack development foundation:

- Frontend: React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Base UI, Lucide, TanStack Query, Socket.io client, Oxlint
- Backend: NestJS, TypeScript, Drizzle ORM, PostgreSQL/Neon driver, Zod, better-auth, Socket.io, Swagger/OpenAPI
- Testing: Jest, Supertest, Playwright
- Root scripts for running/building/linting/testing both apps

Do not implement application features yet.

## Starting State Observed

- Repository contained only:
  - `.git/`
  - `README.md`
- No existing `frontend/`, `backend/`, root `package.json`, TypeScript config, Vite config, Tailwind config, or shadcn config existed.
- `git status` initially failed with dubious ownership because the repo owner is `ACER/Nayan Curro School` and the sandbox user is `ACER/CodexSandboxOffline`.
  - Use:
    ```bash
    git -c safe.directory='C:/Users/Nayan Curro School/Documents/SportCoachingTool' status --short
    ```

## Important Windows/npm Notes

- PowerShell blocked `npm.ps1` because script execution is disabled.
- Use `npm.cmd` and `npx.cmd`, not bare `npm`/`npx`, when running commands from PowerShell.
- The default npm cache under the user profile was not writable from the sandbox.
- Commands were run with a workspace-local npm cache:
  ```bash
  npm.cmd --cache .\.npm-cache ...
  npm.cmd --cache ..\.npm-cache ...
  npx.cmd --cache .\.npm-cache ...
  npx.cmd --cache ..\.npm-cache ...
  ```
- `.npm-cache/` has been added to root `.gitignore`.

## Completed Work

### Root

Created:

- `package.json`
- `package-lock.json`
- `.gitignore`
- `.env.example`
- `docs/.gitkeep`
- Replaced `README.md` with current setup instructions

Root scripts currently configured:

```json
{
  "dev": "concurrently \"npm --prefix backend run start:dev\" \"npm --prefix frontend run dev\"",
  "build": "npm --prefix frontend run build && npm --prefix backend run build",
  "lint": "npm --prefix frontend run lint && npm --prefix backend run lint",
  "test": "npm --prefix backend test",
  "test:e2e": "npm --prefix backend run test:e2e"
}
```

Installed root dev dependency:

- `concurrently`

Created root `.env.example`:

```env
DATABASE_URL=
BETTER_AUTH_SECRET=
```

### Frontend

Created Vite React TypeScript app:

```bash
npm.cmd --cache .\.npm-cache create vite@latest frontend -- --template react-ts
```

Installed frontend dependencies:

- React
- React DOM
- Vite
- TypeScript
- Oxlint
- Tailwind CSS v4
- `@tailwindcss/vite`
- shadcn CLI/runtime deps
- `@base-ui/react`
- `@fontsource-variable/inter`
- `lucide-react`
- `@tanstack/react-query`
- `socket.io-client`
- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `tw-animate-css`

Configured:

- Tailwind v4 through `@tailwindcss/vite` in `frontend/vite.config.ts`
- `@/*` alias to `frontend/src`
- TypeScript alias paths in:
  - `frontend/tsconfig.json`
  - `frontend/tsconfig.app.json`
- TypeScript 6 deprecation compatibility with `"ignoreDeprecations": "6.0"` where `baseUrl` is used
- `QueryClientProvider` in `frontend/src/main.tsx`
- Minimal non-feature placeholder app in `frontend/src/App.tsx`

shadcn:

- Ran:
  ```bash
  npx.cmd --cache ..\.npm-cache shadcn@latest init --template vite --base base --preset vega --yes
  ```
- It succeeded.
- Generated:
  - `frontend/components.json`
  - `frontend/src/components/ui/button.tsx`
  - `frontend/src/lib/utils.ts`
- Verified add command:
  ```bash
  npx.cmd --cache ..\.npm-cache shadcn@latest add button --yes
  ```
  It succeeded and skipped the file because it was already identical.

Created frontend folder skeleton:

```text
frontend/src/components/ui/
frontend/src/features/athletes/
frontend/src/features/events/
frontend/src/features/live-tracking/
frontend/src/features/statistics/
frontend/src/features/dashboard/
frontend/src/pages/
frontend/src/layouts/
frontend/src/hooks/
frontend/src/lib/
frontend/src/services/
frontend/src/types/
```

### Backend

Scaffolded NestJS app:

```bash
npx.cmd --cache .\.npm-cache @nestjs/cli@latest new backend --package-manager npm --skip-git
```

The scaffold command timed out while installing, but files were created.

Then ran backend install successfully once:

```bash
npm.cmd --cache ..\.npm-cache install
```

Installed backend runtime dependencies:

- `drizzle-orm`
- `@neondatabase/serverless`
- `zod`
- `better-auth`
- `@nestjs/websockets`
- `@nestjs/platform-socket.io`
- `socket.io`
- `@nestjs/swagger`
- `swagger-ui-express`

Installed backend dev dependencies:

- `drizzle-kit`
- `supertest`
- `@types/supertest`
- `@playwright/test`

Configured/created:

- `backend/drizzle.config.ts`
- `backend/src/database/drizzle.ts`
- `backend/src/database/schema/index.ts`
- `backend/src/auth/auth.config.ts`
- Swagger setup in `backend/src/main.ts`
- Socket.io adapter setup in `backend/src/main.ts`
- Backend npm scripts:
  - `db:generate`
  - `db:migrate`
  - lint changed from auto-fix to check-only

Created backend folder skeleton:

```text
backend/src/auth/
backend/src/users/
backend/src/teams/
backend/src/athletes/
backend/src/events/
backend/src/event-log/
backend/src/statistics/
backend/src/seasons/
backend/src/fixtures/
backend/src/notifications/
backend/src/database/schema/
backend/src/common/
```

## Verification Already Performed

### PASS

Frontend build passed after the TypeScript config fix:

```bash
npm.cmd --prefix frontend run build
```

Frontend Oxlint completed:

```bash
npm.cmd --prefix frontend run lint
```

Note: Oxlint emitted one warning from generated shadcn code:

```text
src/components/ui/button.tsx: Fast refresh only works when a file only exports components.
```

It did not fail the lint command.

Backend Jest passed:

```bash
npm.cmd --prefix backend test
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests: 1 passed, 1 total
```

shadcn init/add passed:

```bash
npx.cmd --cache ..\.npm-cache shadcn@latest init --template vite --base base --preset vega --yes
npx.cmd --cache ..\.npm-cache shadcn@latest add button --yes
```

### NOT YET VERIFIED

These still need to be run and made to pass:

```bash
npm.cmd --prefix backend run build
npm.cmd --prefix backend run lint
npm.cmd run build
npm.cmd run lint
npm.cmd run test:e2e
npm.cmd run dev
```

Playwright browser binaries were not installed yet:

```bash
npx.cmd --prefix backend playwright install
```

## Current Blocker / Last Known Issue

Backend build failed with:

```text
src/app.controller.ts: Module '"@nestjs/common"' has no exported member 'Get'.
src/app.module.ts: Module '"@nestjs/common"' has no exported member 'Module'.
```

Inspection showed `backend/node_modules/@nestjs/common/index.d.ts` exported from decorator folders like `./decorators/core`, `./decorators/modules`, and `./decorators/http`, but the installed package directory only contained:

```text
backend/node_modules/@nestjs/common/decorators/index.d.ts
backend/node_modules/@nestjs/common/decorators/index.js
```

This strongly suggests a corrupted or incomplete `@nestjs/common` install, not bad Nest application code.

I removed `backend/node_modules` to fix it:

```bash
Remove-Item -Recurse -Force -LiteralPath node_modules
```

Then started:

```bash
npm.cmd --cache ..\.npm-cache install
```

The user interrupted during that reinstall. `backend/node_modules` exists now, but treat it as possibly partial.

## Resume Checklist

1. From repo root, cleanly reinstall backend dependencies:

   ```bash
   cd backend
   Remove-Item -Recurse -Force -LiteralPath node_modules
   npm.cmd --cache ..\.npm-cache install
   ```

2. Verify `@nestjs/common` package contents:

   ```bash
   Test-Path node_modules\@nestjs\common\decorators\core
   Test-Path node_modules\@nestjs\common\decorators\modules
   Test-Path node_modules\@nestjs\common\decorators\http
   ```

   These should return `True`.

3. Retry backend build:

   ```bash
   npm.cmd run build
   ```

4. If backend build still fails, inspect:

   - `backend/node_modules/@nestjs/common/package.json`
   - `backend/node_modules/@nestjs/common/index.d.ts`
   - `backend/node_modules/@nestjs/common/decorators/`
   - `backend/tsconfig.json`
   - `backend/package-lock.json`

5. Run backend lint:

   ```bash
   npm.cmd run lint
   ```

6. From repo root, run full verification:

   ```bash
   npm.cmd --prefix frontend run build
   npm.cmd --prefix frontend run lint
   npm.cmd --prefix backend run build
   npm.cmd --prefix backend test
   npm.cmd run build
   npm.cmd run lint
   npm.cmd run test:e2e
   ```

7. Install Playwright browsers if required:

   ```bash
   npx.cmd --prefix backend playwright install
   ```

8. Verify dev servers:

   ```bash
   npm.cmd run dev
   ```

   Expected:

   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:3000`
   - Swagger: `http://localhost:3000/api/docs`

9. Stop dev servers after verification.

## Manual Steps Still Needed

No external services are required just to start the app.

Eventually, real values are needed for:

```env
DATABASE_URL=
BETTER_AUTH_SECRET=
```

Do not invent these values.

## Notes For Next Codex

- Do not downgrade Tailwind. Tailwind v4 is already configured through the Vite plugin.
- Do not rerun `npm create vite` or recreate the frontend.
- shadcn is already initialized with:
  - `style: base-vega`
  - `@base-ui/react`
  - Lucide icons
  - Tailwind v4
  - `@/*` alias
- Do not implement actual app features yet.
- If using Git status, include the safe-directory override shown above.
- Avoid committing `.npm-cache/`, `node_modules/`, `dist/`, or generated test artifacts.

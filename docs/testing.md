# Testing and continuous integration

Every pull request to `main`, and every push to `main` or `develop`, runs
`.gitea/workflows/test.yml`. The workflow uses the `ubuntu-latest` runner label;
change `runs-on` if the repository's enabled Linux/Docker runners use a different
label.

## Test layers

| Layer | Command | Purpose |
| --- | --- | --- |
| Code quality | `npm run lint` | Checks frontend and backend code quality. |
| Build | `npm run build` | Type-checks and builds both applications. |
| Backend unit | `npm test` | Runs isolated Jest service/controller tests. |
| API/integration | `npm run test:integration` | Runs Supertest flows against a real test database, including authentication, authorization, team isolation, athletes, events, dashboards, and statistics. |
| Browser/UI | `npm run test:e2e:ui` | Runs the main user journeys in Chromium against the real frontend, backend, and test database. |

## Run tests locally

Install the three dependency sets once:

```sh
npm ci
npm --prefix frontend ci
npm --prefix backend ci
```

Set `TEST_DATABASE_URL` in the uncommitted root `.env` to a dedicated, empty
PostgreSQL/Neon database. It must be different from `DATABASE_URL`.

```sh
npm run lint
npm run build
npm test
npm run test:integration
npm run test:e2e:ui
```

Before the first database-backed run, migrate the test database without writing
the credential into a file:

```sh
DATABASE_URL="$TEST_DATABASE_URL" npm --prefix backend run db:migrate
```

On PowerShell, the equivalent is:

```powershell
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm --prefix backend run db:migrate
Remove-Item Env:DATABASE_URL
```

Install Chromium once on a new machine with `npx playwright install chromium`.

## Gitea setup

Create an empty PostgreSQL/Neon database used only by CI. In **Repository
Settings → Actions → Secrets**, add its connection string as
`TEST_DATABASE_URL`. Never put a development, personal, or production database
credential in the workflow or commit it to the repository.

Both repository runners must be online, enabled, capable of Linux/Docker jobs,
and expose the workflow's `ubuntu-latest` label. The workflow performs these
jobs:

1. **Code quality and build** installs all dependency sets, then lints and builds.
2. **API tests** runs unit tests, migrates the dedicated database, and runs the
   integration suite.
3. **UI tests** runs after API validation, installs Chromium, and starts the real
   application through Playwright before running the browser suite.

The UI job receives the same test-only database as both `DATABASE_URL` (for the
running API) and `TEST_DATABASE_URL` (to make its purpose explicit). Integration
tests receive only `TEST_DATABASE_URL`; their setup rejects it if it matches a
separately configured development `DATABASE_URL`.

When a browser test fails, open the failed Gitea Actions run and download the
`playwright-failure-artifacts` artifact. Extract it, then inspect screenshots and
traces under `test-results/`. Open the HTML report with:

```sh
npx playwright show-report playwright-report
```

## Test expectations

Tests must be independent: create uniquely named records or use a documented
test account, and clean up created data afterward. New features need tests at
the appropriate layer. A bug is not considered fixed until a regression test
reproduces and protects against it.

Prioritise authentication and email-verification restrictions, coach ownership,
athlete archive/restore, cross-team isolation, event and RSVP flows, statistics
and season filtering, validation errors, signed-out access, and key desktop and
mobile journeys.

Record user feedback as a Gitea issue containing reproduction steps, severity,
expected and actual behaviour, environment details, and a link to the added or
planned regression test.

## Merge protection and assessment evidence

In **Repository Settings → Branches**, protect `main`: require pull requests,
one approval, and successful `Test / Code quality and build`, `Test / API tests`,
and `Test / UI tests` checks; disable direct pushes.

The remaining evidence must be captured in Gitea after this workflow is pushed:

- both enabled runners and their labels;
- one successful Actions run;
- one failed run with its test output and Playwright artifact;
- protected-branch settings requiring the checks;
- this guide, the workflow file, and representative files from `backend/test/`
  and `e2e/`.

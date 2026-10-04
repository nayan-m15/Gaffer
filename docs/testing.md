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
3. **SonarQube analysis** (push to `main`/`develop` only) runs backend tests
   with coverage and submits an analysis to the self-hosted SonarQube
   instance. See [sonarqube.md](sonarqube.md) for one-off setup.
4. **UI tests** runs after API validation, installs Chromium, and starts the real
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
  and `frontend/e2e/`.

## Step 5(b) manual two-browser retest

Browser automation in the 2026-10-04 sandbox failed before any test ran (`spawn EPERM`). Use two separate browser profiles/accounts and the same generated fixture. Enable the flag only in the controlled test backend, refresh both sync tokens, and validate/deploy the updated PowerSync streams first. The source publication/role must include `match_sessions` and `competition_fixtures`; the existing configuration helper now includes them but was not executed in this session. Stream SQL follows [PowerSync's supported SQL](https://docs.powersync.com/sync/supported-sql); Cloud validation remains required.

1. Confirm each side's lineup and start from its own generated event. Call `GET /events/:eventId/link-diagnostic` from each account. Record fixture/event/sheet/session IDs: sheets differ, fixture/session match, actual home/away follows the fixture. Keep different squad, tactics and notes on the two sheets.
2. Open both live routes. Log a home goal, then an away card. Within polling/sync delay compare home/away names, score, event IDs/sides/minutes/player labels, clock and the shared result card. Start/pause the clock from alternating coaches. Private squad, tactics and notes must remain the owning team's; opponent confirmed lineup is read only.
3. Produce a duplicate goal review from the two coaches. Both shared result cards must show the same review status. Resolve it and compare the decision and canonical timeline. Finish on one side: both pages must stop at full time and show awaiting confirmation. Standings remain unpublished with unresolved reviews or before the bilateral/24-hour rule. Confirm both sides; both reports show the same final score/status and standings count this fixture once.
4. After both clients finish syncing, take both offline and reload their report routes. Compare canonical score, timeline, clock, final state, confirmations and review decisions. The session DTO must have been fetched once before offline reload; a cold client without a cached DTO shows a load failure rather than a private sheet substitute. On a live fixture, queue an offline event: it remains visibly pending on the writing coach's sheet until uploaded/reconciled. Reconnect and confirm one canonical event, no duplicate goal, and both browsers converge.
5. Confirm the opponent lineup remains visible after kickoff/full time. Try a third account and revoked membership: shared reads fail and cached shared reports are not used for HTTP 4xx failures.
6. Repeat the score/clock/report checks for an accepted friendly (requester-home, acceptor-away). With the flag off and refreshed tokens, repeat an ordinary match: existing timeline, clock, private report/insight and editable legacy opponent setup behave as before; no session report request is made.

Automated frontend coverage uses `node --test --test-isolation=none src/features/matches/session-report.node-test.mjs src/features/events/opponent-confirmed-lineup.node-test.mjs` from `frontend/`. These cover shared orientation/cache/API fallback, authorization failures, synced final state/reviews and lineup privacy. They do not replace the browser or deployed PowerSync checks above.

## Step 9 release evidence

Record the release SHA, backend process flag values, migration journal and deployed PowerSync revision with the two-browser sign-off. For a double round robin, repeat the generated scenario for the reverse leg: fixture IDs and session IDs must differ between legs, sides must reverse, and each team must have two played results after both legs complete. Create the fixture and start one sheet while disabled, then enable and retry: the original sheet ID survives and both sheets converge on the fixture session. Repeat with the flag disabled and fresh sync tokens to verify legacy start, logging, clock, report and opponent setup.

Run each full backend e2e file from `backend/` using `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand <file>` for `test/competitions.e2e-spec.ts`, `test/friendly-fixtures.e2e-spec.ts`, `test/offline-sync.e2e-spec.ts` and `test/team-isolation.e2e-spec.ts`, without experimental VM modules. Run backend units with the repository's `npm test -- --runInBand` script (its PGlite tests require VM modules). Report real assertion failures separately from connection/cleanup failures; rerun a flaky database failure once and preserve both outcomes. Do not count local API/model tests as browser, CI or deployed-sync verification.

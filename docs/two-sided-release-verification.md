# Release verification — 4 October 2026

These are workspace results, not deployment sign-off. The operator will perform dashboard checks. No migration, historical repair, deployment, backup or restore was performed.

| Executed check | Result |
| --- | --- |
| Backend `npm run build` | Passed |
| Backend `npm test -- --runInBand` | 67 suites, 775 tests passed |
| From backend: `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand test/competitions.e2e-spec.ts` | 14 passed |
| Same command with `test/friendly-fixtures.e2e-spec.ts` | 17 passed |
| Same command with `test/offline-sync.e2e-spec.ts` | 5 passed |
| Same command with `test/team-isolation.e2e-spec.ts` | 5 passed |
| Frontend `npm run build`; `npm run lint` | Passed; lint has 8 existing warnings |
| Frontend `node --test --test-isolation=none "src/**/*.node-test.mjs"` | 51 passed |
| Playwright offline config, desktop and mobile Chromium | 6 passed each; mocked API |
| Playwright PWA config, production build | 1 passed |
| Real two-account release browsers | Final single rerun: friendly passed, competition failed loading final report during a logged Neon connection timeout; isolated TEST_DATABASE_URL, PowerSync disabled |
| Public production frontend, database health, JWKS | HTTP 200; protected operations health returns 401 |
| `node scripts/diagnose-powersync-source.mjs` from backend | Configured source grants/publication passed; replication slot active |
| `node scripts/check-two-sided-release.mjs dev` from backend | Blocked: journal drift, missing 0051 trigger and historical fixture conflicts |
| Same audit with `test` | All 57 migrations match, 0051 trigger exists; no Cloud publication/slot configured; repeated during browser runs, so fixture candidate findings are not a quiet-database baseline |
| `node scripts/check-offline-health.mjs` | Cannot run protected check: operations URL/token missing |

The initial individual e2e runs had no DB connection flakes; the post-fix reruns encountered the failures recorded below. Browser iterations exposed test setup/cleanup errors and a real UI defect: shared result status was hidden until the opponent published a lineup. Both live and report pages now show available shared status independently. A further browser run reproduced a 1–0 shared competition becoming 0–0 when the away coach confirmed; publication now counts canonical home/away goals across the session only while the flag is enabled. Final browser coverage uses real accounts, accepted friendly/generated competition, shared scores/confirmations, third-team rejection, membership revocation and one competition result; it does not prove deployed PowerSync or shared offline replay.

## Database release blockers

The configured development source has 15 migration journal mismatches/missing entries and 12 unknown timestamps; 24 line-ending-only hash differences were excluded. Migration 0051's clock-session trigger is absent. Later journal timestamps already exist, so blindly running the timestamp-based migrator can skip 0051. Review journal provenance and missing schema with a backup and isolated restoration before choosing a migration repair. Do not edit the journal merely to make the audit green.

The read-only repair query found 3 competing-session fixtures and 4 duplicate completed candidates. Conflicting fixtures `35f00ca4-642e-410e-a4b2-9190f759fd85`, `71cc8d48-d7b4-4bb0-89dc-e6a9644d353d` and `ccc81418-259c-430a-a0b0-2bbc2ccea8ae` have published scores and observations across different sessions. These require reconciliation review and are outside the safe null-link repair. No historical rows were changed. This source is not proven to be Render's effective production database.

## Operator sign-off still required

There is no persistent staging deployment. Use local services with a disposable Neon branch for isolation and restore testing. Record release SHA/CI result; actual Render flags and migration journal; backup timestamp and successful isolated restore; current PowerSync Cloud validation/config revision and token access/revocation; diagnostic/repair decisions; protected telemetry baseline and observation window. Run the complete two-browser checklist in testing.md, including lineup privacy/update, reverse legs, pre-activation sheets, flag-off rollback and warmed shared offline replay. The global flag has no cohort filter: production activation affects every eligible fixture, so keep it false until all gates pass.


Browser commands executed from the repository root:

```powershell
# Real API + isolated test DB, built production frontend, no Cloud source token
$env:TWO_SIDED_LIVE_LOGGING_ENABLED='true'
$env:UI_TEST_PRODUCTION='true'
$env:POWERSYNC_URL=''
node scripts/run-ui-tests.mjs two-sided-release.spec.ts
node node_modules/@playwright/test/cli.js test --config playwright.offline.config.ts --project desktop-chromium
node node_modules/@playwright/test/cli.js test --config playwright.offline.config.ts --project mobile-chromium
node node_modules/@playwright/test/cli.js test --config playwright.pwa.config.ts
```

After the backend score fix, builds and all backend units were rerun, followed by one combined serial command from backend with the same Jest configuration and all four release suite paths. Browser retries logged real Neon `fetch failed`/`ETIMEDOUT` connection failures; the friendly rematch backend test also exceeded its 60-second timeout. These are reported separately from the reproducible score and UI defects. Each affected run gets one connection-failure rerun; results below are the final status, not an assertion that the first run was clean.

Final connection-failure reruns: the friendly rematch case passed (1 passed, 16 intentionally skipped) with the required backend Jest command plus `--testNamePattern "assigns a rematch a fresh session"`. Real browser rerun ended 1 passed (friendly), 1 failed (competition report unavailable with a logged Neon connection timeout). The competition browser release gate and post-fix final-score browser assertion remain unverified; do not treat the earlier pre-fix flow or successful units as a substitute.

Final post-fix backend run: 3 suites passed, friendly suite had 16 passed and 1 rematch timeout; aggregate 40 passed, 1 timed out (891.53 seconds). The timed-out rematch passed its single focused rerun (22.256 seconds). Thus every one of the 41 cases passed after the fix across these runs, but the combined run was not clean. Backend build and all 67 unit suites / 775 tests passed after the score change. Syntax and `git diff --check` passed. The complete real competition browser/Cloud gate remains blocked.

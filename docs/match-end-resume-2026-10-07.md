# Match end confirmation and shared resume

End Match now opens confirmation before changing the clock or either team's match status. Cancelling leaves play running. The second-half check-in timeout also requests confirmation instead of ending the shared clock automatically.

Either participating coach can resume an unlocked match from the live screen or report. Resume restores the latest playing half and saved elapsed time, starts the shared clock, restores both event statuses, and clears pending report confirmations. An opponent viewing the report returns to the live screen when the shared clock resumes. A newer shared clock takes precedence over an older completed sheet while its slower poll catches up.

Migration `0060_match_play_state` makes end/resume atomic, checks the clock revision, preserves confirmed report locks, and rejects delayed full-time commands after a newer resume. Ordinary clock commands can still rebase, and retries of an already accepted finish remain idempotent. Apply it with `npm --prefix backend run db:migrate` before using the updated backend. The migration has only been applied to disposable PGlite databases during validation.

Validation on 7 October 2026 found and fixed a missing frontend function brace, review evidence type inference errors, an unnecessary async review mapper, and a second coach's finish request failing after the shared match had already ended. The original stale full-time guard also rejected valid rebased clock commands; it now specifically protects against commands created before a later resume.

Checks performed (use `npm.cmd` on Windows):

- `npm --prefix frontend test`: 110 tests passed, including HTTP 400 isolation, reconnect retries, local acknowledgement before slow uploads, serialized goal/assist uploads, review replay and resumed-clock precedence.
- `npm --prefix backend test -- --runInBand matches sync database/concurrent-event-candidates database/match-clock`: 127 tests passed across 10 suites. Real service/SQL tests cover both coaches ending/resuming friendly and competition matches, retained time and timeline, cleared confirmations, stale commands, locked reports, access isolation, post-match duplicate votes with offline uploads disabled, and duplicate detection after a peer's offline upload.
- `npm --prefix backend run test:migrations`: 11 tests passed, including applying `0060_match_play_state` using prepared queries and recording it exactly once.
- `npm --prefix packages/match-domain test`: 7 tests passed.
- Frontend and backend production builds and lint passed. Frontend lint reports five existing Fast Refresh warnings; backend lint's controller formatting error was corrected.
- `npx playwright test --config playwright.regression.config.ts --grep "ending a match|opponent report|resuming from|duplicate review|removed duplicate|post-match"`: 10 Chromium checks passed using mocked APIs, covering confirmation/cancellation, revision conflicts, automatic opponent navigation, review loading/errors, decision feedback and post-match edits.
- `npx playwright test --config playwright.offline.config.ts`: 16 checks passed across desktop and mobile Chromium. Coverage includes goal/assist acknowledgement while an upload is held open, automatic reconnect upload, every offline event workflow, storage failure, expired sessions, revoked membership and a durable queue shared across two tabs. Older assertions were updated to match the expanded accessible sync-status label.

Browser checks use the real frontend and local SQLite storage with mocked HTTP responses. Backend integration checks use real SQL in disposable PGlite databases. These checks do not verify a deployed PowerSync connection or identify the missing response body from the original HTTP 400 incident. No development or production match records were changed.

# Phase 1 shared-session integrity verification

Only Phase 1 is implemented. This is an uncommitted working diff on `feat/matches-two-sided-live-logging`, based on `e01fe3d18be0c47edc8a56ebcd70d7d83c9a7dec`.

## 1. Exact files changed

- `backend/src/matches/match-session-integrity.ts` (new centralized resolver and conflicts)
- `backend/src/matches/shared-session-integrity.spec.ts` (new isolated PostgreSQL service/migration regressions)
- `backend/src/events/events.service.ts` (start/retry attachment and diagnostic)
- `backend/src/matches/matches.service.ts` (ingestion, mutation, clock, finish and finalisation guards)
- `backend/src/competitions/competition-fixture-results.ts` (publication/validation, timeout and manual reset protection)
- `backend/src/sync/sync.controller.ts` (stable rejected upload receipt codes)
- `backend/drizzle/0052_shared_session_integrity.sql` (new additive migration)
- `backend/drizzle/meta/_journal.json` (one appended migration entry)
- `backend/src/competitions/competition-fixtures.spec.ts` (explicit legacy/manual mode rather than inherited environment flag)
- `backend/test/team-isolation.e2e-spec.ts` (corrected diagnostic status expectations)
- `docs/phase1-shared-session-integrity-verification.md` (this report)

## 2. Migration

`0052_shared_session_integrity`, journal index 56. Replaces `refresh_match_projection` and introduces `attach_match_session_if_safe`. It performs no backfill or other bulk data repair. Previously applied migrations and unrelated journal entries are unchanged.

The migration was tested in PGlite only. It has **not been applied to the configured/local application database**. Safe null-sheet attachment requires this migration before using that path in the application.

## 3. Invariant/helper

`resolveMatchSessionIdentity` resolves the fixture, expected session, owning sheet's session, and authoritative owning team/side. It returns `legacy_allowed`, `shared_valid`, `shared_attachable`, `shared_missing_link` or `shared_conflict`, plus a reconciliation flag. `assertMatchSessionIdentity` enforces that result.

With the flag enabled, accepted registered-team friendlies and generated registered-team fixtures require `matches.shared_match_id = fixture.shared_session_id` and a valid participant side. Existing generated fixture sessions are also protected when an opponent is external. Manual/unlinked matches and feature-off ingestion retain their legacy contract. Publication protection ignores the flag whenever a generated fixture already has a session.

## 4. Start/retry before and after

Before: event status was rejected before inspecting the existing sheet; null links could be filled without checking legacy evidence.

After: eligible existing sheets are resolved before the scheduled-status rejection. Correctly linked retries return the same sheet, including a completed-sheet retry. Safe scheduled null sheets attach to the existing fixture session and normalize their side. Conflicting non-null links fail without overwrite. Observations, canonical events, operations, reviews, clock activity, projection/finalisation evidence, completed events/fixtures and session confirmations block automatic attachment.

The SQL attachment function rechecks evidence under the legacy ingestion/projection and clock advisory locks plus the match row lock. It returns explicit conflict/reconciliation outcomes rather than rewriting history. New sheets ensure their session idempotently.

## 5. Event ingestion before and after

Before: `sharedMatchId && flag` selected shared ingestion; every other case selected legacy ingestion.

After: eligible sheet identity is checked before any observation write. Null/missing/conflicting eligible links fail with 409; the legacy ingest function is never reached. `/sync/upload` uses the same service path and records the corresponding safe error code in a rejected receipt. The batch receipt API remains unchanged.

Clock, finish, correction, void, review/dispute and reopen entry points also use the identity guard so those operations cannot advance an invalid eligible sheet through their legacy branches.

## 6. Finalisation/publication before and after

Before: a null-linked competition sheet could finalise its private projection and publish without a session ID.

After: enabled eligible null sheets fail before projection refresh/finalisation. Feature-off legacy finalisation cannot publish an existing session fixture either. Result validation blocks legacy/manual sources for session fixtures. `syncFixtureResult` independently requires the matching session, a matching linked sheet/event/fixture, valid participant identity, a completed submitting event, finalised session, bilateral confirmations or the existing 24-hour single-confirmation rule, and no open review/dispute. No fixture result write happens when these checks fail.

Confirmation and lazy timeout finalisation check session-wide reviews/disputes before finalising. Manual reset cannot clear an existing session fixture result. Valid bilateral confirmation still publishes one correctly oriented fixture result and counts one match per team in standings.

## 7. Projection identity before and after

Before: a one-time migration backfill populated old rows, but the refresh function omitted `session_id` for new rows.

After: INSERT and changed-digest UPDATE copy `matches.shared_match_id`. The unchanged-digest early-return path also maintains identity without incrementing the projection revision. Legacy sheets retain NULL. Migration execution itself does not relink or backfill existing evidence.

## 8. Diagnostic examples

The following abbreviated responses are examples using fresh test identifiers, not queries against the October records. Both illustrate an away team's owning event.

Valid linked sheet:

```json
{
  "eventId": "fresh-away-event",
  "teamId": "fresh-away-team",
  "fixtureType": "friendly",
  "fixtureId": "fresh-fixture",
  "fixtureSharedSessionId": "fresh-session",
  "owningMatchId": "fresh-away-sheet",
  "owningMatchSharedSessionId": "fresh-session",
  "participantTeamId": "fresh-away-team",
  "participantSide": "away",
  "expectedSessionId": "fresh-session",
  "sheetSessionMatchesFixture": true,
  "status": "correctly_linked"
}
```

Missing owning-sheet link, even though the fixture has a session:

```json
{
  "eventId": "fresh-away-event",
  "teamId": "fresh-away-team",
  "fixtureType": "friendly",
  "fixtureId": "fresh-fixture",
  "fixtureSharedSessionId": "fresh-session",
  "owningMatchId": "fresh-away-sheet",
  "owningMatchSharedSessionId": null,
  "participantTeamId": "fresh-away-team",
  "participantSide": "away",
  "expectedSessionId": "fresh-session",
  "sheetSessionMatchesFixture": false,
  "status": "missing_sheet_link"
}
```

Other statuses: `legacy`, `conflicting_sheet_link`, `missing_fixture_session`. Authentication and participant access checks remain; no lineup, tactics or invitation notes are returned. Existing participant/match-sheet identifier arrays remain available.

## 9. Automated tests

The new suite has 18 test cases, using real SQL/functions and real services in a fresh in-memory PGlite database:

1. Friendly: both coaches, distinct sheet IDs, same session, authoritative sides, retries including completed event.
2. Competition: same assertions for a generated fixture.
3. Safe null-sheet attachment and side normalization.
4-6. Reconciliation required for legacy observation, finalisation, or clock evidence.
7. Conflicting non-null link is never overwritten.
8. Online ingestion rejection without creating an observation.
9. Offline upload controller rejection, stable receipt code, no observation.
10. Null-sheet finalisation and direct legacy publication blocked, including feature-off publication.
11. Matching session cannot publish early; mismatching session conflicts.
12. Valid bilateral result: one canonical competition result, correct orientation and standings count.
13. Projection INSERT, changed-digest UPDATE, unchanged-digest maintenance and legacy NULL.
14. Diagnostic reports valid, missing and conflicting owning-sheet identity.
15. Reapplying the additive migration changes no existing match/projection rows; direct atomic attachment still refuses evidence.
16. Publication blocks disputes and premature single confirmation, while preserving the 24-hour rule.
17-18. Manual and feature-off legacy ingestion remain supported.

Existing competition fixture tests now explicitly use feature-off legacy/manual mode. The team-isolation HTTP diagnostic assertions use the new statuses. That external-database HTTP suite was not run; equivalent diagnostic states and the upload controller path are exercised in the isolated new suite.

## 10-12. Verification results

Commands run from `backend` unless noted:

| Check | Command | Result |
|---|---|---|
| Full backend unit suite | `npm.cmd test -- --runInBand` | 68 suites, 793 tests passed; 153.048 seconds |
| Final focused regression suite | `npm.cmd test -- --runInBand src/matches/shared-session-integrity.spec.ts` | 18 tests passed; 17.508 seconds |
| Backend build/typecheck | `npm.cmd run build` | Passed (exit 0) |
| Changed TypeScript files | `node_modules/.bin/eslint.cmd` with the eight changed TypeScript files | Passed (exit 0) |
| Working diff whitespace (repo root) | `git diff --check` | Passed (exit 0) |

The final focused run includes the added changed-digest projection and conflicting-diagnostic assertions. Expected error/warning logs from rejection/fallback tests do not indicate failing tests.

The initial regression run, before implementation, failed 12 of 16 cases and passed 4. After fixing the SQL enum cast, the focused two-suite run passed 44/44 tests. Final results are recorded below once the final checks complete.

## 13. Deliberately unchanged / remaining work

No database migrations were run against the configured application database, and no current fixture/session/sheet rows were repaired, deleted or relinked. The October friendly `16ab1963-b32d-4f81-bc42-cd203a59839d` and competition `fd41392c-429f-42ee-80a3-f72af3195323`, their sessions and both teams' sheets remain forensic evidence.

No frontend lineup/layout redesign, PowerSync Cloud deployment, injury filtering, review payload/cross-sheet privacy changes, invitation-notes changes, historical reconciliation or unrelated migration-journal cleanup. Those known issues remain for later review. No Phase 2 work or commit was performed.

## PASTE THIS BACK TO THE REVIEWER

Working diff on `feat/matches-two-sided-live-logging`, base SHA `e01fe3d18be0c47edc8a56ebcd70d7d83c9a7dec`; uncommitted. Exact changed files:

- `backend/src/matches/match-session-integrity.ts`
- `backend/src/matches/shared-session-integrity.spec.ts`
- `backend/src/events/events.service.ts`
- `backend/src/matches/matches.service.ts`
- `backend/src/competitions/competition-fixture-results.ts`
- `backend/src/sync/sync.controller.ts`
- `backend/drizzle/0052_shared_session_integrity.sql`
- `backend/drizzle/meta/_journal.json`
- `backend/src/competitions/competition-fixtures.spec.ts`
- `backend/test/team-isolation.e2e-spec.ts`
- `docs/phase1-shared-session-integrity-verification.md`

 New migration: `0052_shared_session_integrity`, additive journal entry only, not applied to the application database.

68 backend suites / 793 tests pass; final focused Phase 1 suite 18/18 passes. Backend build/typecheck, changed-file ESLint and `git diff --check` pass. No external database HTTP E2E run or application-database migration was performed.

New HTTP 409 codes:

- `SHARED_MATCH_SESSION_REQUIRED`
- `SHARED_MATCH_SESSION_CONFLICT`
- `SHARED_MATCH_RECONCILIATION_REQUIRED`
- `SHARED_MATCH_RESULT_NOT_FINALISED`

Eligible null-linked sheets now fail the centralized guard before online/offline ingestion or enabled finalisation. Safe empty sheets can attach on start/retry; sheets with legacy evidence require reconciliation. The result synchronization layer blocks legacy publication into any generated fixture with a session even with the flag off, and verifies matching sheet/session identity, finalisation/confirmation eligibility and reviews before writing a fixture result.

Projection `session_id` is maintained on insert, changed-input refresh and unchanged-input refresh after migration 0052 is applied. There is no bulk historical backfill.

Corrected diagnostic example: `{ "fixtureSharedSessionId": "fresh-session", "owningMatchSharedSessionId": null, "sheetSessionMatchesFixture": false, "participantSide": "away", "status": "missing_sheet_link" }`. Full valid/missing examples are in section 8.

October forensic records remain untouched. Migration application and all listed Phase 2/privacy/layout/PowerSync/historical-reconciliation work remain pending review.

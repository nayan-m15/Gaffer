# Two-sided live logging implementation plan

## 1. Findings

**Confirmed root cause:** calendar fixtures can be shared between teams, but live match state is not. Each team starts a separate `matches` row from its own team-owned event. Events, observations, reviews, clock, and projection are keyed by that row’s `matchId`; match access and PowerSync streams are team-scoped. The duplicate matcher also compares the same `matchId`, team perspective, and player identifiers, which differ between the two teams’ logs.

Key code references:

- `EventsService.create`, `listForTeam`, and `startMatch` in `backend/src/events/events.service.ts`: team event creation, fixture-linked calendar entries, and one match row per event.
- `FriendlyFixturesService.accept` in `backend/src/friendly-fixtures/friendly-fixtures.service.ts`: creates the opponent’s mirror event; it links calendars, not match logs.
- `MatchesService.requireMatch` in `backend/src/matches/matches.service.ts`: authorizes through the caller’s team event and returns 404 across team boundaries.
- `MatchesService.persistEventObservation` and `resolveEventReview` in `backend/src/matches/matches.service.ts`, plus `ingest_match_event_observation` and `resolve_match_event_candidate` in `backend/drizzle/0036_concurrent_event_candidates.sql` and `0037_concurrent_event_resolution.sql`: reconciliation is scoped to one match ID.
- `SyncController.executeUploadItem` in `backend/src/sync/sync.controller.ts`, `useMatch` / `useMatchEvents` in `frontend/src/features/matches/hooks.ts`, and `powersync/sync-config.yaml`: writes use the match ID; synced rows are scoped to the authenticated team; online match data also polls.
- `MatchReportPage` in `frontend/src/pages/MatchReportPage.tsx` reads one match ID. `EventReviewPanel` in `frontend/src/offline/EventReviewPanel.tsx` is currently opened from the live logger, not the report.
- `syncFixtureResult` in `backend/src/competitions/competition-fixture-results.ts` and `CompetitionsService.loadCompetitionResults` in `backend/src/competitions/competitions.service.ts`: live results currently identify a single match row, while two independent rows could conflict or be counted twice.

## 2. Final design

Create one canonical **match session** for each new accepted friendly fixture or generated competition fixture. A session owns fixture identity, home/away sides, shared timeline, clock, review state, and result. A unique link prevents more than one session per fixture. Free-text opponents retain the existing one-sided flow. Existing matches are not linked or merged.

Keep a **team-specific match sheet** for each participating team. It owns that team’s event, roster, lineup, game plan, private notes, and private setup. The sheets link to the shared session; one side’s sheet and roster never grant access to the other’s.

Store shared event attribution as actual **home/away** side, with the originating team and actor. Convert that to “own” and “opponent” only when rendering for a team. Reconciliation compares observations within the canonical session and can propose duplicates across observers without assuming that different player IDs identify the same person.

Share the match timeline, score, cards, substitutions, and clock. Do not share the opponent’s roster, lineup, private notes, or injuries. Names and shirt numbers appear only when the side that logged an event supplied them on that event. Injury entries remain private to their originating side.

One generated competition fixture receives one canonical result, regardless of which match sheet supplies an update. Only generated competition fixtures count toward standings; a fixture result is applied once. Friendlies never count toward standings.

Either coach may finish. Each side confirms the result; it becomes final once both have confirmed, or once one side has confirmed and the other has not responded for 24 hours. Either coach may reopen before finalisation. Either coach may resolve a duplicate review; the decision and actor are visible to both sides, and the other side may flag a dispute.

## 3. Implementation steps

Each step is a bounded change that can be completed and reviewed in one work session. Keep the feature disabled until its step is complete and compatible with the existing single-sided path.

### Step 1 — Capture regression cases and API contracts

- **Files:** `backend/test/friendly-fixtures.e2e-spec.ts`, `backend/test/offline-sync.e2e-spec.ts`, `backend/test/team-isolation.e2e-spec.ts`; optionally `docs/contracts-and-authorization.md`.
- **Schema/migration:** None.
- **Tests:** Add failing contract cases for shared-session identity, participant access, third-team isolation, one result per generated fixture, and preserving the free-text opponent path. Keep tests focused on externally observable behaviour.
- **Done when:**
  - [ ] Tests demonstrate the current two-match-ID gap.
  - [ ] Expected participant and third-party access behaviours are explicit.
  - [ ] Existing single-sided test cases remain intact.

### Step 2 — Add canonical session schema

- **Files:** `backend/src/database/schema/index.ts`, `backend/drizzle/<next journaled migration>.sql`, `backend/drizzle/meta/_journal.json`, generated Drizzle snapshot if required by repository convention.
- **Schema/migration:** Add `match_sessions` and participant-side rows (registered team and optional competition participant, home/away role, confirmation state). Add nullable `matches.sharedMatchId` and fixture-to-session unique links for friendly and generated competition fixtures. Backfill each existing match as its own one-sided session. Do not pair historical records.
- **Tests:** Extend `backend/src/database/migrations.spec.ts` to verify migration and constraints; add schema-level assertions for uniqueness and one-sided backfill.
- **Done when:**
  - [ ] Existing match rows and IDs are preserved.
  - [ ] Every existing match has a one-sided session after migration.
  - [ ] A fixture can reference at most one session and a session has valid sides.

### Step 3 — Create sessions idempotently from new fixtures

- **Files:** `backend/src/events/events.service.ts`, `backend/src/friendly-fixtures/friendly-fixtures.service.ts`, `backend/src/competitions/competition-fixture-results.ts` or the fixture materialization service that owns generated fixtures.
- **Schema/migration:** Use Step 2’s links; no additional migration unless implementation reveals a missing index.
- **Tests:** Extend `backend/test/friendly-fixtures.e2e-spec.ts` and competition fixture e2e coverage. Race two starts/acceptance paths and verify one session, with a team-specific sheet for each team.
- **Done when:**
  - [ ] Accepted new friendlies automatically obtain one session.
  - [ ] New generated competition fixtures automatically obtain one session.
  - [ ] Retries and concurrent starts return the same session.
  - [ ] Free-text opponents remain one-sided.

### Step 4 — Enforce participant authorization

- **Files:** `backend/src/matches/matches.service.ts`, `backend/src/matches/matches.controller.ts`, `backend/src/teams/teams.service.ts` only if a reusable membership helper is needed; `backend/test/team-isolation.e2e-spec.ts`.
- **Schema/migration:** None beyond Step 2.
- **Tests:** Participant coach/assistant can read permitted shared session data; unrelated team gets 404; neither side can read the other’s private match sheet, lineup, roster, or notes.
- **Done when:**
  - [ ] Shared endpoints authorize using session participation and current team membership.
  - [ ] Private endpoints remain scoped to the owning team.
  - [ ] Revoked membership blocks subsequent API access.

### Step 5 — Normalize event storage and reconciliation

- **Files:** `backend/src/database/schema/index.ts`, `backend/src/matches/matches.service.ts`, `backend/src/matches/matches.schemas.ts`, new `backend/drizzle/<next migration>.sql`, matching migration metadata.
- **Schema/migration:** Add session identity and actual home/away attribution to observations, canonical events, reviews, operations, and projections. Preserve existing match IDs and legacy values. Update ingestion/review SQL to lock on session ID and match cross-observer candidates using normalized side and event timing.
- **Tests:** Extend `backend/test/offline-sync.e2e-spec.ts` for cross-side duplicate candidates, different player IDs, distinct same-minute goals, retry IDs, and deterministic merge/separate decisions.
- **Done when:**
  - [ ] Existing one-sided observations still project unchanged.
  - [ ] Observations from both sheets can enter one session ledger.
  - [ ] Duplicate candidates do not auto-merge; retries remain idempotent.

### Step 6 — Sync only authorised shared rows

- **Files:** `backend/src/sync/sync.controller.ts`, `powersync/sync-config.yaml`, sync token/configuration code, `frontend/src/offline/match-store.ts`.
- **Schema/migration:** No new columns expected; add indexes only if query plans require them, in a journaled migration.
- **Tests:** Extend `backend/test/offline-sync.e2e-spec.ts` and `frontend/e2e/offline-event-logging.spec.ts`: both participants receive allowed session events and reviews, unrelated teams receive none, and offline replay/revocation behave safely.
- **Done when:**
  - [ ] Sync queries select by session participation, not by widening team-wide access.
  - [ ] Shared timeline, review, projection, and clock updates reach both sides.
  - [ ] Private team sheet data never enters the shared stream.

### Step 7 — Update match setup and live logging UI

- **Files:** `frontend/src/features/matches/api.ts`, `hooks.ts`, `types.ts`, `frontend/src/features/events/types.ts`, `frontend/src/pages/LiveLoggerPage.tsx`, `frontend/src/pages/LiveMatchPage.tsx`.
- **Schema/migration:** None.
- **Tests:** Extend `frontend/e2e/offline-event-logging.spec.ts` for two accounts, both home/away orientations, simultaneous logging, offline replay, and event-specific player names/numbers. Preserve current free-text fixtures.
- **Done when:**
  - [ ] Each coach opens their own match sheet but sees the same session score and shared timeline.
  - [ ] Actual home/away events render correctly as each viewer’s own/opponent side.
  - [ ] Opponent roster, lineup, injuries, and private notes are not rendered.

### Step 8 — Add shared report review and dispute flow

- **Files:** `frontend/src/pages/MatchReportPage.tsx`, `frontend/src/offline/EventReviewPanel.tsx`, `frontend/src/features/matches/live-match-report-model.ts`, `backend/src/matches/matches.controller.ts`, `backend/src/matches/matches.service.ts`.
- **Schema/migration:** Add dispute state/actor/time fields to review records if the existing review/operation history cannot represent a dispute; use a new journaled migration and keep prior decisions auditable.
- **Tests:** Extend `backend/test/offline-sync.e2e-spec.ts` and report UI e2e coverage for one coach resolving, both seeing actor and decision, and the other flagging a dispute.
- **Done when:**
  - [ ] Both coaches can open the same session report and review queue.
  - [ ] Either coach can resolve; actor and decision are visible to both.
  - [ ] A dispute is visible to both and preserves the prior decision in history.

### Step 9 — Add bilateral final result and one-time standings update

- **Files:** `backend/src/matches/matches.service.ts`, `backend/src/competitions/competition-fixture-results.ts`, `backend/src/competitions/competitions.service.ts`, `backend/src/database/schema/index.ts`, result UI in `frontend/src/pages/LiveMatchPage.tsx` and `MatchReportPage.tsx`.
- **Schema/migration:** Add per-side result confirmation timestamps/status and finalisation metadata if not already covered by Step 2. Make fixture result publication idempotent on generated fixture/session identity.
- **Tests:** Extend competition e2e tests for both-side confirmation, one-sided confirmation plus 24-hour timeout (use a controllable clock), reopen-before-final, and duplicate-free standings.
- **Done when:**
  - [ ] Either side can finish the session.
  - [ ] Finalisation requires both confirmations or the defined 24-hour no-response rule.
  - [ ] Either coach can reopen before final status.
  - [ ] A generated fixture updates standings once; friendly fixtures do not.

### Step 10 — End-to-end hardening and release gate

- **Files:** `backend/test/offline-sync.e2e-spec.ts`, `backend/test/friendly-fixtures.e2e-spec.ts`, `backend/test/competitions.e2e-spec.ts`, `backend/test/team-isolation.e2e-spec.ts`, `frontend/e2e/offline-event-logging.spec.ts`, `docs/testing.md`, operational runbook as needed.
- **Schema/migration:** Only corrective additive migrations, if required by test findings; no destructive cleanup as part of rollout.
- **Tests:** Complete backend unit/e2e, migration, browser, two-account, reconnect, stale-client, cancellation, rematch, dispute, late-edit, and authorization coverage. Add telemetry checks for duplicate sessions, rejected uploads, open disputes, and inconsistent fixture results.
- **Done when:**
  - [ ] All automated release-gate suites pass in CI (run by the implementation session, not this planning task).
  - [ ] Two-browser manual scenarios pass for friendly and generated competition fixtures.
  - [ ] Rollback procedure is documented and exercised in staging.

## 4. Rollout plan and feature flag

Introduce a server-side `TWO_SIDED_LIVE_LOGGING_ENABLED` flag, default **off**. The server, not only the UI, must enforce the flag. When off, existing and new single-sided/free-text flows behave as today. When on, only newly accepted friendly fixtures and newly materialized generated competition fixtures receive shared sessions; historical matches remain untouched.

Deploy additive schema and backfill first, then deploy code that can read both legacy matches and sessions while the flag remains off. Enable in staging for new fixtures, verify authorization, sync convergence, bilateral finalisation, and standings exactly once. Roll out to a small production cohort, monitor session creation and sync/review/result telemetry, then enable more broadly. If rollback is needed, turn the flag off to stop creating new shared sessions; retain the additive schema and read access needed for already-created sessions until they are safely resolved. Do not roll back by deleting observations or sessions.

## 5. Decisions

These are settled product decisions for implementation:

1. **Finishing and finalising:** Either coach can finish. The result becomes final when both sides confirm, or when one side confirms and the other has not responded within 24 hours. Either coach can reopen before final.
2. **Duplicate reviews:** Either coach can resolve a review. Record who made the decision and show it to both sides. The other side can flag a dispute.
3. **Visibility:** Share timeline, score, cards, substitutions, and clock. Do not share the opponent’s roster, lineup, private notes, or injuries. Show player names/numbers only on events the opposing side chose to log.
4. **Session creation:** Accepted friendly fixtures and generated competition fixtures automatically become shared sessions. Free-text opponents remain single-sided.
5. **Standings:** Only generated competition fixtures count. Friendlies never count.
6. **History:** Do not link or merge historical matches. Apply the feature to new matches only.

## 6. Session handoff

- [ ] Step 1 — Regression cases and API contracts
- [x] Step 2 — Canonical session schema
- [x] Step 3 — Idempotent fixture session creation
- [x] Step 4 — Participant authorization
- [ ] Step 5 — Normalized event storage and reconciliation
- [ ] Step 6 — Authorised shared sync
- [ ] Step 7 — Match setup and live logger UI
- [ ] Step 8 — Shared report, reviews, and disputes
- [ ] Step 9 — Bilateral final result and standings
- [ ] Step 10 — End-to-end hardening and release gate

Implementation notes:
- Accepted friendlies assign the requesting team to the home side and the accepting team to the away side, since the plan did not define a friendly home/away rule.
- Session creation is gated by `TWO_SIDED_LIVE_LOGGING_ENABLED`, defaulting off as specified by the rollout plan. Unlinked generated competition participants retain their participant ID with a null team ID.
- Step 4 permits current session participants to read shared timeline, review, event-operation, and clock-operation endpoints when the flag is enabled. Match reports, squads, opponent squads, event details, and lineups remain scoped to the owning team; participant writes stay on the owning-team path until event identity is normalized in Step 5(b).
- Step 5(a) is complete: session identity and actual home/away side columns were added with a legacy backfill across observations, canonical events, reviews, event and clock operations, and projections. Work stopped before Step 5(b); no ingestion/reconciliation SQL or candidate matching logic was changed. Add the idempotency, locking, and candidate-matching tests before implementing that part.

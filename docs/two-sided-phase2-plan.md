# Two-sided live logging phase 2 plan

## 1. Findings

### Confirmed causes

1. **The two `matches.id` values are expected; the session links are what must match.** The product keeps one team-owned match sheet per event. `EventsService.startMatch` creates one `matches` row for that team event and stores the fixture session in `matches.sharedMatchId` (`backend/src/events/events.service.ts`, `startMatch`, lines 837–867 and 966–1006). The fixture's two events are correctly generated with the same `competition_fixture_id` by `materialize_competition_fixture_events` (`backend/drizzle/0029_competition_fixture_events.sql`, lines 147–209). The current routes, hooks, and report API are still addressed by each `matches.id` (`frontend/src/App.tsx`, lines 145–153 and 203–208; `frontend/src/features/matches/hooks.ts`, `useMatch`/`useMatchEvents`, lines 33–60 and 73–107; `backend/src/matches/matches.service.ts`, `findOne`, lines 74–137). A different match ID alone does not prove there are different sessions; inspect `matches.shared_match_id` and the fixture ID with the queries below.

2. **A sheet started with the flag off stays unlinked after the flag is turned on.** The flag is read on the backend only by `twoSidedLiveLoggingEnabled()` in `backend/src/matches/match-sessions.ts` (lines 14–18), and only the exact case-insensitive string `true` enables it. No `TWO_SIDED_LIVE_LOGGING_ENABLED` entry exists in the checked root `.env`, `.env.example`, or repository deployment config; absent a process-level environment value, the backend effective value is `false`. The frontend does not read a separate flag; it consumes `sharedSessionId` returned by the backend, and the sync token receives a backend-generated `two_sided_live_logging` claim (`backend/src/sync/sync.controller.ts`, line 69). The actual dev/staging/production process values cannot be established from this workspace.

   `startMatch` calls `ensureFriendlyFixtureSession` or `ensureCompetitionFixtureSession` only when the backend flag is true, then persists that result to the new sheet (`events.service.ts`, lines 856–867 and 980–997). If a match already exists for that event, it returns the existing row without filling a missing `sharedMatchId` (`events.service.ts`, lines 966–977). If the row is unlinked, event ingestion takes the legacy per-match path (`backend/src/matches/matches.service.ts`, lines 338–370), with no automatic fallback warning or repair. Fixtures materialized before the flag was enabled are not inherently excluded: `startMatch` tries to ensure a session when the flag is on. But an already-started sheet, or a manually created event with no fixture foreign key, does not get attached by that logic.

3. **Generated fixtures do create both team events and can create one shared session, but creation is lazy/flag-dependent.** The SQL fixture materializer inserts/updates one event per home and away team with the same fixture ID (`0029_competition_fixture_events.sql`, lines 147–209). `CompetitionsService.generateFixtures` ensures sessions after materialization only when enabled (`backend/src/competitions/competitions.service.ts`, lines 1141–1160); `startMatch` also lazily ensures one for linked old fixtures. Accepted friendlies create mirror events from the same `friendly_fixture_id`, and `FriendlyFixturesService.accept` ensures a session on acceptance when enabled (`backend/src/friendly-fixtures/friendly-fixtures.service.ts`, around line 206). `ensureCompetitionFixtureSession`/`ensureFriendlyFixtureSession` use conditional fixture-row updates plus a unique session link to converge concurrent creators (`backend/src/matches/match-sessions.ts`, lines 83–201). Thus the remaining mismatch cases are: disabled flag at start, an existing unlinked sheet, missing/different event fixture IDs, or a non-fixture manual event. A plain pair of hand-created events (including a friendly-looking pair) is intentionally outside this feature; only an accepted friendly fixture or a generated competition fixture qualifies.

4. **Opponent lineup data exists at the API, but the current UI treats it as setup input rather than a shared lineup view.** A confirmed lineup is stored in `event_lineups`, one row per event, with `formation_id`, starting/bench athlete IDs, slot assignments, and `confirmed_at` (`backend/src/database/schema/index.ts`, around lines 562–596); `EventsService.confirmLineup` upserts it and only allows scheduled matches (`backend/src/events/events.service.ts`, lines 392–467). The opponent resolver verifies the exact linked fixture/team, reads that row, resolves names and shirt numbers, and returns formation/slot data (`backend/src/friendly-fixtures/friendly-fixtures.service.ts`, lines 287–330 and 333–455). The caller must be a member of their own team and event (`EventsService.getFriendlyOpponentLineup`, lines 377–391; controller `GET /events/:eventId/opponent-lineup`). This does not expose game-plan tactics, notes, or injury rows. `ConfirmSquadPage` currently imports the snapshot into a manually editable opponent squad (`frontend/src/pages/ConfirmSquadPage.tsx`, lines 1480–1520); it does not present a read-only opponent lineup with formation, starters, and bench. This is a UI/product gap, not a missing stored confirmation or cross-team authorization.

5. **Reports remain per-sheet even when shared review/session data exists.** `MatchReportPage` reads `:matchId` and calls `useMatch`, `useMatchEvents`, and `useMatchSquad` with that ID (`frontend/src/pages/MatchReportPage.tsx`, lines 318–330). Backend `findOne`, events, squads, projections, and insights use that sheet's `matches.id` (`backend/src/matches/matches.service.ts`, lines 74–137, 139–160, 171–254). Projections and insights are also keyed by match ID (`backend/src/database/schema/index.ts`, `matchProjectionState` and `matchInsights`). Session ID is used for shared reviews and bilateral confirmation, but the report model/header/timeline are not canonical-session reads. Each coach therefore sees a separate report assembled from their own sheet.

6. **Standings still turn each completed match sheet into an independent result.** `CompetitionsService.loadCompetitionResults` selects rows from `matches`, calculates own/opponent goals, and maps each row into a live result; it does not group or deduplicate by `sharedMatchId`/fixture (`backend/src/competitions/competitions.service.ts`, lines 790–895). It derives team orientation from `matches.isHome` (lines 875–887). `EventsService.startMatch` stores the client-supplied `dto.isHome` without checking it against the generated fixture's home/away participants (`backend/src/events/events.service.ts`, lines 933–939). `MatchesService.buildCompetitionFixtureResult` likewise constructs home/away IDs and scores from the sheet's `match.isHome` (`backend/src/matches/matches.service.ts`, lines 1494–1543). Two sheet rows can consequently produce two standings entries, both with the same (incorrect) team as home. `syncFixtureResult` can locate/update the fixture once by shared session ID (`backend/src/matches/session-finalisation.ts`, `fixtureResultSourceMatches`; `backend/src/competitions/competition-fixture-results.ts`, lines 246–295 and 499 onward), but this does not deduplicate the separate rows consumed by `loadCompetitionResults`. Double round-robin fixtures must remain distinct fixture IDs: one canonical result for each leg, using that leg's stored fixture home/away teams.

7. **Session finalisation is stored on the session, but its score source and downstream report are still sheet-specific.** `confirmSessionResult` records participant confirmations on the shared session, then calls `finalise_match_projection` with the initiating `match.id` and builds the competition score from that sheet (`backend/src/matches/matches.service.ts`, lines 1195–1282). Timed-out finalisation similarly selects one linked match/projection (`backend/src/matches/session-finalisation.ts`, lines 28–108). This explains how the final status can be shared while reports/projections diverge, and why standings must be moved to a session-final-result source rather than merely making `syncFixtureResult` idempotent.

8. **Manual repair is needed for test data.** A fixture may already point to a session while a previously created sheet has `shared_match_id IS NULL`, or duplicate/orphan test sessions may exist. Current code does not backfill such a row on the existing-match branch. The fixture/result view also does not provide a reviewable repair artifact. Phase 2 must add a dry-run repair report and a documented operator-reviewed relink process; do not delete or merge historical production data automatically.

### Dev database diagnosis queries

Run these read-only queries against the dev database. Bind `$1` to the observed fixture UUID. Use the competition query for the automated league case and the friendly query for an accepted friendly.

```sql
-- Generated fixture: should return two team events and, once started, two
-- distinct match IDs whose shared_match_id equals the fixture shared_session_id.
SELECT f.id AS fixture_id,
       f.home_competition_team_id, f.away_competition_team_id,
       f.shared_session_id AS fixture_session_id,
       f.linked_match_id AS canonical_result_match_id,
       e.id AS event_id, e.team_id, e.status AS event_status,
       m.id AS match_id, m.shared_match_id AS match_session_id,
       m.is_home, ps.finalisation_state,
       ps.confirmed_team_score, ps.confirmed_opponent_score
FROM competition_fixtures f
LEFT JOIN events e ON e.competition_fixture_id = f.id
LEFT JOIN matches m ON m.event_id = e.id
LEFT JOIN match_projection_state ps ON ps.match_id = m.id
WHERE f.id = $1
ORDER BY e.team_id;
```

```sql
-- Accepted friendly counterpart: both events should reference one friendly
-- fixture, and both started sheets should reference its one session.
SELECT f.id AS fixture_id, f.status, f.shared_session_id AS fixture_session_id,
       e.id AS event_id, e.team_id, e.status AS event_status,
       m.id AS match_id, m.shared_match_id AS match_session_id, m.is_home
FROM friendly_fixtures f
LEFT JOIN events e ON e.friendly_fixture_id = f.id
LEFT JOIN matches m ON m.event_id = e.id
WHERE f.id = $1
ORDER BY e.team_id;
```

```sql
-- Find completed sheets that would currently be emitted as multiple live
-- rows for one shared session. Distinct sessions for two round-robin legs are
-- correct; this query groups only sheets within the same session.
SELECT m.shared_match_id, count(*) AS completed_sheets,
       array_agg(m.id ORDER BY m.created_at) AS match_ids,
       array_agg(e.team_id ORDER BY m.created_at) AS team_ids,
       array_agg(m.is_home ORDER BY m.created_at) AS sheet_is_home_values
FROM matches m
JOIN events e ON e.id = m.event_id
WHERE m.shared_match_id IS NOT NULL AND e.status = 'completed'
GROUP BY m.shared_match_id
HAVING count(*) > 1;
```

For a specific `shared_session_id`, compare it with fixture `home_competition_team_id`/`away_competition_team_id`, then compare each match's participant team and `is_home`. On the same unordered team pair, two different fixture IDs with swapped fixture home/away IDs are the valid double round-robin legs.

## 2. Phase 2 design

- Keep one team-owned `matches` sheet per team event, but require both sheets for a qualifying linked fixture to resolve to exactly one canonical `match_sessions.id`. Keep match IDs in team-private sheet routes where needed; all shared timeline, report, result, review, and clock reads must resolve through `sharedSessionId`.
- For eligible linked events, fail visibly if the flag is on but session identity/participants cannot be resolved. Do not silently ingest one side through the legacy per-match path.
- Derive each participant's real home/away side from the fixture. Never trust a sheet-supplied `isHome` to establish generated-fixture orientation.
- Once confirmed, publish only the lineup projection: formation, starters, and bench; each player's display name and shirt number; formation positions/slot assignments needed to render. Update the projection when the team re-confirms before kickoff. Do not include tactics/game plan, private notes, injuries, or drafts. Keep authorization bound to one of the fixture's current team participants.
- Use one canonical session result for each generated fixture. Read the final score from the session's final result and home/away participants from the fixture row. Friendlies and standalone manually created events remain outside generated standings.
- Provide an authenticated event-ID diagnostic that returns its fixture ID, shared session ID, participant team IDs/sides, and linked match-sheet IDs. Restrict it to a participating team member and log no private lineup/tactics content.
- Repair test data only through a dry-run report and an explicit reviewed action/manual procedure. No automatic deletion or historical production relinking.

## 3. Ordered implementation steps

Keep the feature off outside controlled test environments until the release gate passes. Each step is bounded to one implementation session. Every step adds or updates its failing test before changing behavior.

### Step 1 — Reproduce the two-account generated fixture failure

- **Files:** `backend/test/competitions.e2e-spec.ts`, `backend/test/team-isolation.e2e-spec.ts`, `frontend/e2e/offline-event-logging.spec.ts`; test helpers only if needed.
- **Schema/migration:** None.
- **Tests first:** Build one automated league fixture with Team A as fixture home and Team B away; create separate coach accounts; both start from their own generated events. Assert different sheet IDs but identical non-null `sharedSessionId`, same canonical report/timeline/result, one standings row, fixture-correct orientation. Also add a flag-off-start-then-flag-on-start case and a manually-created unlinked-event control that proves why those paths differ. Include a second reverse-orientation fixture for double round-robin coverage.
- **Done when:**
  - [x] The test reproduces the actual fixture materialization and two-account start path, not hand-inserted sessions.
  - [x] The stale-sheet session-reuse assertion reproduced the prior null-link behavior; canonical report/standings checks are explicitly tracked as expected-failing follow-up tests.
  - [x] It records fixture ID, both event IDs, both sheet IDs, and both session IDs in assertion output.

### Step 2 — Repair and enforce fixture-to-session linking

- **Files:** `backend/src/events/events.service.ts`, `backend/src/matches/match-sessions.ts`, `backend/src/matches/matches.service.ts`, `backend/src/competitions/competitions.service.ts`, `backend/src/friendly-fixtures/friendly-fixtures.service.ts`, corresponding focused e2e/spec files.
- **Schema/migration:** First verify existing unique constraints on fixture session links and `(event_id)` match uniqueness. Add only a missing uniqueness/participant integrity constraint through a journaled migration if tests demonstrate it is needed.
- **Tests first:** Add retries/concurrent starts from both sides, one side started before flag activation, stale existing unlinked sheet, fixture materialized before flag activation, and a missing-link error case. Assert eligible new/existing fixtures converge; a manual event remains one-sided.
- **Change:** Make ensure-session and attach-existing-sheet behavior transactional/idempotent. On the existing-match path, attach a valid fixture session when safe instead of returning a null link. For enabled linked fixtures, reject a missing/inconsistent fixture/session/participant rather than silently taking legacy ingestion. Preserve the legacy path only when disabled or genuinely unlinked.
- **Done when:**
  - [x] Both events point at one fixture and both sheets at one session regardless of start order or retry.
  - [x] A conflicting existing session is surfaced for review, never silently overwritten.
  - [x] Manual/unlinked events still use the legacy one-sided path.

### Step 3 — Canonical home/away identity

- **Files:** `backend/src/events/events.service.ts`, `backend/src/matches/matches.service.ts`, `backend/src/matches/match-sessions.ts`, `backend/src/competitions/competition-fixture-results.ts`, schema and match-event SQL if the fixture-side identity is not persisted consistently.
- **Schema/migration:** Add a journaled additive migration only if actual fixture side is not already stored on session participants/observations or a required constraint is missing.
- **Tests first:** In the exact two-account test, start each side with deliberately conflicting client `isHome` values. Assert the generated fixture's home team stays home, away stays away, and the reverse-home second leg remains its own fixture with reversed orientation.
- **Change:** Resolve side from fixture participants at session attach/start, reject/ignore conflicting `isHome`, and use normalized actual side for event ingestion and all result translation.
- **Done when:**
  - [x] Client input cannot change a generated fixture's home/away sides.
  - [x] Both viewers render the same actual home/away score.
  - [x] Two round-robin legs remain two fixtures with independently correct orientations.

### Step 4 — Share only confirmed pre-match lineup fields

- **Files:** `backend/src/events/events.service.ts`, `backend/src/friendly-fixtures/friendly-fixtures.service.ts`, `backend/src/events/events.controller.ts`, `frontend/src/features/events/api.ts`, `frontend/src/features/events/hooks.ts`, `frontend/src/pages/ConfirmSquadPage.tsx`, lineup view components, relevant backend/browser e2e specs.
- **Schema/migration:** None expected; `event_lineups` already records confirmation, formation, starters, bench, and formation slots. If adding a purpose-built response table/view, use an additive journaled migration and keep it separate from game-plan fields.
- **Tests first:** Assert no opponent data for draft/unconfirmed lineups; after confirm, the opposing coach sees formation, starters and bench with names/numbers; a re-confirm updates it until kickoff. Assert payload and UI omit tactics, plan identifiers/settings, notes, injuries, and draft state. Test unrelated team and revoked membership access.
- **Change:** Add a clear read-only opponent lineup view for both generated fixtures and accepted friendlies. Continue using the narrow confirmed-lineup projection; do not expose the full event or match sheet.
- **Done when:**
  - [x] Opponent can inspect formation, starting players, and bench before kickoff.
  - [x] A lineup edit before kickoff becomes visible to the opponent.
  - [x] Private tactics, notes, injuries, and unconfirmed drafts are absent from API and UI.

### Step 5 — Make live timeline and report resolve to the session

Implementation split: **5(a)** adds backend session report reads and an owning-sheet resolver; **5(b)** wires report/live pages, shared query keys, invalidation and synced/offline reads to that session report. Step 5 is not complete until 5(b) is implemented and verified.

- **Files:** `backend/src/matches/matches.service.ts`, `backend/src/matches/matches.controller.ts`, projection/report model modules, `frontend/src/features/matches/api.ts`, `hooks.ts`, `types.ts`, `frontend/src/pages/LiveMatchPage.tsx`, `MatchReportPage.tsx`, PowerSync streams/store only where session query keys still differ.
- **Schema/migration:** Inspect the session-keyed observations/events/reviews/projections already introduced. Add a journaled migration only for a missing session-level canonical final-result/report projection; do not repurpose or delete team-private sheet rows.
- **Tests first:** Extend Step 1 to assert both coach routes show one shared score, timeline, clock, report, final status and review decisions while their own squad, tactics and notes remain private. Check online and synced/offline reads use one session key. Check peer membership and unrelated team authorization.
- **Change:** Treat route match ID as an access handle to the caller's sheet, resolve its shared session, then serve shared report data by session ID. Keep sheet-specific private panels and editing scoped to the owning sheet. Do not imply that both deep links must have the same `matches.id`.
- **Done when:**
  - [x] Both teams receive the same shared report and timeline for one session.
  - [x] Shared query/cache invalidation is session-keyed; private data remains sheet/team-keyed.
  - [x] Third teams and nonparticipants receive no shared session data.

### Step 6 — Publish standings once from the fixture's final session result

- **Files:** `backend/src/competitions/competitions.service.ts` (`loadCompetitionResults`), `backend/src/competitions/competition-fixture-results.ts`, `backend/src/matches/matches.service.ts` result finalisation/edit paths, standings tests.
- **Schema/migration:** Add a session final score/state or fixture result source link through an additive migration only if the current session projection cannot safely hold one immutable final result. Add a uniqueness constraint for one published result per generated fixture if no existing fixture primary-row invariant covers it.
- **Tests first:** Assert two started/completed sheets for one session produce exactly one table result. Assert source score is the final session result, home and away IDs are the fixture IDs, and home/away score do not change with the submitting sheet. Assert another fixture in the double round robin produces its own result with reversed fixture sides. Assert accepted friendlies and standalone/manual games do not enter generated standings.
- **Change:** Make fixture/session the standings source of truth. Remove per-sheet result emission for linked shared sessions; aggregate one row per generated fixture and use fixture participants for orientation. Preserve a documented compatibility path for older unlinked generated results.
- **Done when:**
  - [x] One generated fixture/session contributes exactly one result and one table update.
  - [x] Home/away always comes from `competition_fixtures`, not `matches.is_home`.
  - [x] Distinct double round-robin fixture IDs each count once.

### Step 7 — Add reviewable test-data repair reports and procedure

- **Files:** `backend/scripts/` report script or read-only SQL under `docs/` (choose repository convention), `docs/two-sided-live-logging-rollout.md`, focused script/query tests if a script is chosen.
- **Schema/migration:** None for dry-run reporting. Any repair that requires new audit columns must be separately reviewed and migrated additively.
- **Tests first:** Fixture test data with (a) fixture session and one null-linked match, (b) two candidate sessions, (c) duplicate completed fixture results. Assert the report flags each class, proposes candidates, and does not mutate/delete anything.
- **Change:** Produce a dry-run report with fixture/event/team/match/session IDs and suggested action. Document a manual transaction workflow: backup, inspect both coaches' rows, verify participant teams/sides and observations, obtain operator review, relink only unambiguous test records, preserve competing sessions/observations for explicit reconciliation, verify standings afterward. Include rollback guidance. No production history auto-linking/deletion.
- **Done when:**
  - [x] Dry run is read-only and reviewable before action.
  - [x] Manual relink steps check for conflicting sessions and preserve audit data.
  - [x] Production historical records are never changed automatically.

### Step 8 — Add authenticated event-link diagnostic

- **Files:** `backend/src/events/events.controller.ts`, `backend/src/events/events.service.ts` or a small diagnostics service, `backend/test/team-isolation.e2e-spec.ts`, `docs/offline-operations-runbook.md` or rollout doc.
- **Schema/migration:** None.
- **Tests first:** Given each side's event ID, a participant sees fixture ID, session ID, participant team IDs/sides, and both sheet IDs. An unrelated team receives 404. A missing/unlinked fixture yields explicit nulls and a warning/status, without leaking notes, tactics, lineup, or injury data.
- **Change:** Add a small authenticated endpoint (or structured server log with a correlation ID); prefer endpoint for two-browser verification. Authorize current team membership against the event/fixture participant. Avoid names or sensitive sheet fields.
- **Done when:**
  - [x] One event ID can be checked from both accounts and resolves to the same fixture/session.
  - [x] Response contains all requested IDs and participants/sides only.
  - [x] Nonparticipants cannot use it to enumerate fixtures.

### Step 9 — End-to-end release gate and operator rollout

- **Files:** `backend/test/competitions.e2e-spec.ts`, `backend/test/friendly-fixtures.e2e-spec.ts`, `backend/test/offline-sync.e2e-spec.ts`, `backend/test/team-isolation.e2e-spec.ts`, `frontend/e2e/offline-event-logging.spec.ts`, `docs/testing.md`, `docs/two-sided-live-logging-rollout.md`.
- **Schema/migration:** Only additive correction if a prior step's tests require it; no automatic data cleanup.
- **Tests first:** Complete automated assertions for the exact automated league/two-account case, accepted friendly, flag-off compatibility, pre-existing fixture, lineup privacy/update, session report/timeline, one standings row, double round robin, reconnect/offline replay, and third-team isolation. Record real browser procedure and expected IDs.
- **Change:** Update rollout and rollback instructions to include flag process verification, required deployed migrations/PowerSync validation, session diagnostic checks, dry-run repair review, staging backup/restore, telemetry, and explicit two-browser release gate. Roll out accepted friendlies and generated fixtures only when the global flag's all-eligible-fixture impact is understood; the existing flag has no cohort filter.
- **Done when:**
  - [ ] The full failing scenario from Step 1 passes in CI and manually in two browsers.
  - [ ] One result per fixture and correct orientation are visible in standings.
  - [ ] Rollback disables shared processing while preserving all existing session data and legacy sheet access; shared report endpoints intentionally return 404 while disabled.
  - [ ] Release telemetry and production environment flag status are verified outside this workspace.

## 4. Session handoff checklist

- [ ] Before each session, read the current step and keep the feature off outside its controlled test environment.
- [ ] Write/update the failing focused test first and retain its failure evidence.
- [ ] Do not start later behavior work until session attachment is fixed and the Step 1 identity checks pass.
- [ ] Keep `matches.id` as a private sheet identifier where needed; use `sharedSessionId` for shared state.
- [ ] Use fixture-owned home/away values for all generated fixture operations and results.
- [ ] Keep lineup responses allowlisted to confirmed formation/starters/bench and name/number only.
- [ ] Do not delete/merge sessions, observations, results, or historical match sheets automatically.
- [ ] Record files changed, migration name, tests and outcomes, unresolved risks, and exact next step in the implementation handoff.
- [ ] Re-run the event diagnostic from both accounts after any session-link or fixture materialization change.

## 5. Rollout note

The latest Step 9 handoff records all four release e2e suites and backend units passing locally. CI, the two-account browser gate, staging rollback, backup restore, current PowerSync Cloud deployment, production migrations/flag and production telemetry still require environment evidence. Earlier handoffs and the initial findings describe historical behavior and are superseded by later implementation notes. Keep production disabled until the release gates pass. Verify the effective backend process flag directly in each environment; repository `.env` files are not authoritative for deployed processes. The flag is global: enabling it affects every eligible fixture, including safe attachment on existing-sheet retries, with no team cohort or separate friendly/competition toggle.

Deploy only additive schema/code while disabled, verify migrations and sync streams in staging, run the exact two-account automated fixture scenario and accepted-friendly scenario, review the dry-run repair report, then enable only when the global scope is acceptable. Monitor unlinked eligible sheets, multiple sessions per fixture, cross-side sync/upload errors, report disagreement, unresolved review disputes, and fixture/session result disagreement. Rollback by turning the flag off and retaining schema/session data; reconcile already-created sessions before re-enabling. No historical production data is automatically linked, deleted, or repaired.

## 6. Open questions for the product owner

Product decisions are settled for implementation:

1. Repair only recent dev test fixtures; fix forward and never touch other rows.
2. Keep standings unpublished until review is resolved and both sides confirm, unless the existing 24-hour rule applies.
3. Keep the opponent's confirmed lineup visible read-only after kickoff and full time.
4. Friendly fixtures use requester-home / acceptor-away.
5. Implement the event diagnostic as an authenticated endpoint.

## 7. Session handoff

- [x] Step 1 — Two-account generated-fixture regression test added using the real fixture materializer and two coach accounts. It covers a sheet started with the flag off and retried after activation.
- [x] Step 2 — Existing sheets safely attach to the fixture's ensured session; conflicting session links return 409. No migration was needed: the existing unique constraints cover `matches.event_id`, fixture session links, and fixture participants.
- [x] Step 3 — Canonical generated-fixture home/away identity is derived from fixture/session participants; existing sheets are normalized when attached to the shared session.
- [x] Step 6 — Generated standings publish one completed fixture result using fixture-owned participants and scores. Legacy unlinked generated results remain supported through `linked_match_id`.
- [x] Step 4 — Implemented: flag-enabled allowlisted opponent lineup API and read-only cards on setup, live and report pages; confirmed snapshots survive kickoff and full time. Flag-off legacy payload, squad autofill and snapshot retirement remain intact.
- [x] Step 5(a) — Backend session report reads implemented; integration verification is recorded below.
- [x] Step 5(b) - Frontend live/report pages resolve shared report state by session; private panels/writes retain owning sheet IDs. Offline reconstruction and focused verification are recorded below.
- [x] Step 7 - Minimal read-only SQL report and reviewed manual repair/backup/rollback procedure documented; no repair script or automatic mutation.
- [x] Step 8 — Authenticated event-link diagnostic and runbook instructions added; current participants can inspect IDs, nonparticipants receive 404.
- [x] Step 9 — Automated release coverage and rollout/rollback runbook completed; external release approval remains gated on the unchecked browser/CI/deployment checks above.

Verification and remaining expected failures:

- The Step 1 session-link assertions pass after Step 2. Backend canonical session report/timeline/result assertions now pass in the two-account generated-fixture test; the explicit `it.todo` tracks remaining Step 5(b) frontend/synced integration. The Step 6 standings check is an active assertion and verifies one result with fixture-owned IDs and scores.
- The regression was replayed with the old existing-sheet return behavior: the two-account generated-fixture e2e failed at the shared-link assertion (`Expected: Any<String>; Received: null`). With the repair restored, the focused session-link test passed.
- Backend e2e files run: `competitions.e2e-spec.ts` (focused generated-fixture case) and `team-isolation.e2e-spec.ts` (focused diagnostic case). The first pre-migration competitions run was blocked by the dedicated test database missing `shared_session_id`; `npm run db:migrate:test` applied 57 additive migrations before rerun. The first full team-isolation attempt had four passing tests and one test-setup failure (the new diagnostic fixture's test rows omitted required `opponent_name`); after correction, its focused diagnostic case passed. The complete e2e files were not rerun.
- Browser e2e was not run; it is optional for this session. The required backend e2e command was used from `backend/` without `--experimental-vm-modules`.
- Repair work was not started. No fixture/session rows were changed outside isolated e2e test data.
- Step 3 and Step 6 implementation: `events.service.ts` derives generated and friendly orientation from fixture/session participant sides, including normalizing an existing sheet on session attach; `matches.service.ts` and timed-out finalisation translate results using fixture/session orientation; both competition standings readers consume one completed generated fixture row using `competition_fixtures` participants and stored final score. Older unlinked generated results remain eligible when referenced by `competition_fixtures.linked_match_id`; friendlies and standalone manual events are excluded.
- Focused verification run after these changes: `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand test/competitions.e2e-spec.ts -t "starts both generated fixture sheets"` from `backend/`. It passed. Full `competitions.e2e-spec.ts`, Step 5 report/timeline coverage, reverse-orientation double-leg coverage, and Step 4 lineup coverage were not run/implemented in this session.
- Stopped after Step 6 because Step 4 requires coordinated backend/API/UI privacy and kickoff-state work; it did not fit safely into the remaining focused scope. Exact next step: write the Step 4 focused e2e assertions first, then implement the allowlisted read-only lineup view for generated fixtures and accepted friendlies.

### 2026-10-04 implementation handoff — Steps 4 and 5(a)

- **Exact stopping point:** Step 4 and the backend implementation of Step 5(a). Step 5(b) has not started. The live/report page changes in this session only add the Step 4 lineup card; those pages still use their existing sheet report/event queries. Next: test and wire the canonical report API into `features/matches/api.ts`, `hooks.ts`, `types.ts`, `LiveMatchPage.tsx` and `MatchReportPage.tsx`, with session-keyed shared cache/invalidation and sheet-keyed private panels. Verify offline/synced reads as part of 5(b). Steps 7 and 9 were not started.
- **Backend contract:** `GET /matches/sessions/:sessionId/report` returns identical session data to both current participant teams. `GET /matches/:matchId/session-report` authorizes the owning sheet and resolves the same DTO. Both routes return 404 when the feature flag is off. Existing sheet read/write endpoints retain their existing behavior. The report allowlists participants, home/away score, clock, final status, confirmations, canonical timeline and review decisions. It selects no squad, game-plan snapshot, event notes, raw event detail, observation payload or clinical injury fields. Generated final scores use the published fixture result once the session is finalised and reviews are resolved.
- **Lineup contract when enabled:** only `available`, `formation`, `starters`, `bench`; each player contains only `name` and `shirtNumber`. The existing legacy contract is retained when disabled. The read-only card does not import the shared roster into editable opponent setup. Existing polling picks up opponent re-confirmation before kickoff. `confirmLineup` already rejects changes once a match sheet exists.
- **Small choices not anticipated by the plan:** retain existing `event_lineups` on flag-enabled kickoff instead of deleting the confirmed formation snapshot; no migration needed. Already-started records whose snapshot was previously deleted use the existing confirmed match roster with `formation: null`, without inferring formation from private tactics. The backend report is a purpose-built session DTO instead of changing the existing private sheet projection/revision contract before 5(b). Canonical event `side` is already the attributed home/away side and must not be inverted again. The enlarged two-account integration case has a 180-second timeout because its real HTTP/database workflow exceeded the former 60-second limit.
- **Tests first evidence:** the new friendly allowlist test failed on the old response (athlete IDs, positions, team metadata and extra snapshot fields); the generated-fixture assertion also failed on the missing allowlisted fields/formation. The session report test subsequently failed with the expected 404 before the routes were implemented.
- **Verification:** `node --test --test-isolation=none src/features/events/opponent-confirmed-lineup.node-test.mjs` from `frontend/` passed both tests (rendered privacy/read-only controls and flag-off legacy model). `npm.cmd run build` from `frontend/` passed. The backend build reports three existing nullable-score type errors in `competitions.service.ts` and `competition-fixture-results.ts`; those files were not changed. The first Node test attempt without `--test-isolation=none` hit Windows child-process `EPERM`; rerunning without worker isolation passed.
- **Backend e2e commands:** all runs used `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand <file>` from `backend/`, without experimental VM modules. Focused friendly/generated lineup and session-report cases were run; the post-implementation generated case exceeded the old 60-second timeout. The full friendly file finished with **15 passed / 2 failed**, with Neon fetch failures, an `ECONNRESET`, and a database cleanup failure. Its new allowlist case passed in that run; the subsequently added full-time/revocation assertions have not yet been rerun. Full competitions outcome is recorded below after its required final run.
- **Not run:** browser e2e/manual two-account browser checks, offline-sync and team-isolation suites, backend unit suite, and the broader frontend suite. No migration, deployment, repair or production-data mutation was performed. All four temporary `.phase2-*` files created for local editing were deleted.
- **Required final full competitions run:** `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand test/competitions.e2e-spec.ts` from `backend/` passed: **12 passed, 1 todo**, 159.879 seconds. The expanded generated-fixture case verifies the allowlisted lineup/formation after kickoff, equal session-ID and owning-sheet-resolved reports for both coaches, canonical score/timeline, clock, shared resolved review decision, full-time and final status, published fixture score, third-team rejection, revoked-membership rejection, and flag-off session endpoint isolation. The sole todo is Step 5(b).

### 2026-10-04 implementation handoff - Step 5(b) and minimal Step 7

- **Completed scope:** Step 5(b) shared report/live reads, session-keyed query/cache/invalidation, shared result/review card and offline reconstruction; Step 7 minimal SQL/procedure. Step 9 was not started. No migrations, deployment, historical relinking or deletion occurred; all existing IDs remain intact.
- **Frontend:** both pages use `useMatchView`. Route IDs continue to authorize/read the private sheet; `sharedSessionId` selects `GET /matches/sessions/:sessionId/report`. Shared cache keys are `["match-sessions", sessionId, "report"]` and `session-report:sessionId`. Event, finish, clock, finalise/reopen mutations and sync/queue updates invalidate the resolved session. Owning squad, tactics, notes, identities and pending queue remain sheet-keyed. The shared timeline takes only allowlisted player labels; private athlete identities support own-team stats without changing shared text. Private substitutions use the owning sheet timeline. The published session score takes precedence over counting timeline goals. A shared result card shows canonical confirmations, final status and review decisions on both pages. Legacy private insights remain available with the flag off; linked shared reports do not display a divergent sheet-generated narrative.
- **Offline choices:** a previously fetched canonical DTO is required; a cold offline route fails visibly instead of substituting a private report. HTTP 4xx responses never fall back to the shared cached DTO. Once synced, session state, both sheets' narrow clock fields, canonical events/reviews and fixture scores reconstruct the shared report. Pending local events remain a separate sheet-owned overlay until canonical IDs/memberships acknowledge them. This requires the three new allowlisted PowerSync streams, plus source SELECT/publication access for `match_sessions` and `competition_fixtures`. The existing source configuration helper includes those tables but was not executed. Cloud validation/deployment and real browser offline checks remain unverified.
- **Build investigation:** the three nullable-score errors were introduced by Step 6 (`0e6a3842`), not present before it. Comparing `c15539dd` shows the change from numeric SQL score expressions to nullable fixture columns. Temporarily substituting only those two pre-Step-6 standings source files and running `tsc --noEmit -p tsconfig.build.json` passed (exit 0); current files were restored in a finally block. The fix excludes incomplete/null fixture scores before emitting standings results; it does not coerce missing scores to zero.
- **Tests-first evidence:** new frontend session-model tests first failed with the missing model module. The former Step 5(b) todo is now active: it applies the actual frontend model to both real coaches' HTTP-fetched final reports/private sheets and checks shared key/orientation/timeline/clock/final state and private-field preservation. Jest initially rejected the frontend ESM transform; the test now transpiles only the pure frontend model to CommonJS without altering backend Jest configuration or using experimental VM modules.
- **Step 7:** `docs/two-sided-test-data-repair.md` contains the read-only SQL and manual transaction/backup/rollback procedure. The exact query passed in a READ ONLY transaction against the isolated test database (zero findings); a second READ ONLY query used synthetic VALUES CTEs and returned exactly null-link, competing-session and duplicate-completed-result findings. No persistent data was seeded or changed. Two completed sheets are expected in the healthy flow, so the third finding is explicitly a duplicate-result candidate requiring comparison with the single fixture result/API standings. Unlinked orphan sessions are preserved for separate inspection, not assigned by team-pair similarity.
- **Verification:** full `friendly-fixtures.e2e-spec.ts` passed **17/17** in 357.317 seconds; the earlier two connection/cleanup failures did not recur. Relevant frontend Node tests passed **14/14** (session report, allowlisted lineup, match report model and live report/PDF model). Backend build passed after the score fix. Final frontend build and full competitions results are recorded below. An earlier root build attempt failed resolving a Tailwind native dependency; a subsequent frontend build caught an ANSI-encoded newly created status component and it was converted to UTF-8. A later typecheck caught a missing synced-clock `match_id` type/selection; that was corrected.
- **Browser limitation:** `node node_modules/@playwright/test/cli.js test --config playwright.offline.config.ts --project desktop-chromium` failed before tests ran with `spawn EPERM`. The precise two-browser retest checklist is under `docs/testing.md`, including generated/friendly orientation, shared clock/report/reviews, full time/confirmation rules, warmed offline reload/replay, privacy, revoked access and flag-off behavior.
- **Not run:** backend unit, offline-sync and team-isolation suites; broad frontend suite; browser execution/manual browser checks; PowerSync Cloud validation/deployment; source configuration helper or repair updates. Backend e2e runs used the requested serial Jest command from `backend/` without experimental VM modules. No unrelated refactor was performed.
- **Changed files:** backend standings service/result helper, competitions e2e and existing PowerSync source configuration helper; frontend match API/hooks/types, session report model/status/Node tests, report label models, live/report pages and offline store; PowerSync sync config; plan, testing, rollout and new repair documentation.
- **Exact stopping point:** implementation of 5(b) and minimal 7. Keep the feature off outside controlled tests; browser and deployed-sync validation remain outstanding. Step 9 remains untouched.

- **Final verification results:** `npm.cmd run build` passed from both `frontend/` and `backend/`. The final full `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand test/competitions.e2e-spec.ts` from `backend/` passed **13/13**, no todo, in 171.503 seconds. The earlier parse-only competitions attempt executed zero tests; no completed competitions run preceded the required final full run. The final frontend check covered TypeScript, production bundle and PWA generation. `git diff --check` passed. Source configuration, stream deployment and real browser checks were not performed.

### 2026-10-04 implementation handoff — Step 9

- **Scope complete:** accepted-friendly two-coach starts and equal canonical goal/report, flag-off shared-route rejection with private-sheet access preserved, and generated double round-robin distinct fixture/session IDs, reversed orientation and two standings results. Existing active cases cover the pre-flag fixture/started sheet, one result per fixture, lineup allowlist/re-confirmation, third-team isolation and revoked membership. Updated the stale clock-stream unit assertion to preserve sheet and session IDs as required by the offline clock reader. No application behavior, migrations, deployment or unrelated refactor changed.
- **Exact e2e command:** from `backend/`, `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand <file>`, without experimental VM modules. Full files: `test/competitions.e2e-spec.ts` **14/14 passed** (173.477s); `test/friendly-fixtures.e2e-spec.ts` **17/17 passed** (370.384s); `test/offline-sync.e2e-spec.ts` **5/5 passed** (153.404s); `test/team-isolation.e2e-spec.ts` **5/5 passed** (61.493s).
- **Earlier runs this session:** full competitions before the new case passed 13/13 (172.756s); its next full run passed 13 and failed the new double-leg setup assertion because completed fixtures had no completed sheets. Added the missing test sheets; the final full run above passed. These were setup/assertion failures, not DB connection flakes. No real DB connection/cleanup failure occurred, so no flaky DB retry was required.
- **Backend units:** `node node_modules/jest/bin/jest.js --runInBand` aborted in PGlite with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`. Used the repository-supported `npm.cmd test -- --runInBand` (which includes VM modules): first run 66/67 suites, 774/775 tests passed, with the stale clock alias assertion failing; after correction, **67/67 suites, 775/775 tests passed** (44.254s). The logged SyncController database timeout is intentionally mocked by a passing test, not a flaky database failure.
- **Other checks actually run:** from `frontend/`, `node --test --test-isolation=none src/features/matches/session-report.node-test.mjs src/features/events/opponent-confirmed-lineup.node-test.mjs` **8/8 passed**; `git diff --check` passed. No builds or browser tests were run in this Step 9 session.
- **Runbook:** rollout/rollback now requires actual process flags in dev/staging/production, prerequisites and migrations 0046 through current latest 0051, exact-release PowerSync validation/publication checks, authenticated link diagnostics, dry-run repair review, staging backup restore, telemetry ownership and two-browser evidence. Enabling the global flag has no cohort filter and requires readiness for all eligible fixtures unless externally isolated.
- **Still manual/unverified:** CI, effective deployed flags, migration journals, latest PowerSync Cloud deployment/source checks and token revocation, environment repair findings, database backup/restore, production telemetry and the complete two-browser gate in `docs/testing.md`. Keep production disabled until those pass. The Step 9 handoff tick records implementation completion, not production release approval; the external acceptance checkboxes remain unchecked.

### 2026-10-04 release verification follow-up

Completed local builds, backend units, all four required e2e suites, frontend model tests, desktop/mobile offline and production PWA browser checks. Added real independent-account friendly/competition browser coverage and enabled it in both CI UI shards. Fixed shared status visibility before the opponent publishes a lineup. See [the current verification record](two-sided-release-verification.md) for exact outcomes and configured-source migration/link blockers. Earlier handoffs remain historical; deployment, complete Cloud/offline release gate and operator dashboard sign-off remain pending. No migrations or historical repairs were applied.

The browser follow-up also reproduced incorrect final competition publication when the away coach confirmed a goal logged by home: live shared 1–0 became published 0–0. Shared publication now counts the session's canonical home/away goals when enabled, retaining the private-sheet query when disabled. Regression coverage is the real competition browser case, with required backend suites rerun after this fix.

Final follow-up outcomes: post-fix backend 40/41 passed in the combined run; the friendly rematch timeout passed once on focused rerun. Units 775/775 and backend build passed. Browser single connection-failure rerun: friendly passed, competition failed loading the final report with a logged Neon timeout. Keep the production/manual acceptance boxes unchecked. Operator will perform dashboard checks; competition browser/Cloud sign-off is still required.

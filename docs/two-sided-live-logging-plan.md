# Two-sided live logging: fix plan

Updated 5 October 2026. This is the single implementation plan for the issues in Recording (4).txt. It replaces the numbered phase handoffs and the previous phase 2 plan. Steps 1-3 and canonical result corrections have local implementations; running-environment, paired-browser and PowerSync delivery verification remain. The documented frontend build blockers have also been repaired.

The goal: two coaches open their own team setup, inspect the opponent's confirmed lineup, record into one shared match, review possible duplicates, and finish with one result everywhere. Implement the remaining fixes and hand the friendly and competition flows back for manual testing. A new validation environment is optional and does not hold up frontend work.

## Review of the five commits

Baseline: e01fe3d18be0c47edc8a56ebcd70d7d83c9a7dec. Reviewed all five subsequent commits through 317eeda5ef0e5d51463cd56657e94c6f63890e28.

| Commit | Useful change | What remains |
| --- | --- | --- |
| 25aec593 | Central session identity checks, safe attachment of empty sheets, migration 0052, guards against private/early result publication. | Client rendering, authentication and old conflicting data. |
| 549f4808 | Corrected tests to expect the existing narrow lineup response. | No application fix; changing assertions did not repair the lineup UI. |
| 4c6218f0 | Peer sanitization, injury/note filtering, live membership stream checks, clock ID conflict mapped to 409. | No frontend changes or working local PowerSync auth. |
| cd6f14cb | Diagnosed auth mismatch and existing frontend build errors. | Diagnostics only. |
| 317eeda5 | Inspected Cloud, attempted a separate instance and prepared an unused RSA signer. | Provisioning hit the instance limit; no application fix. |

**None of these commits changed the frontend.** Keep the useful backend protections and implement the remaining client fixes.

Retained historical facts: local HS256 / gaffer-dev tokens were rejected with PSYNC_S2101. Development replicated blue-hill and trusted the hosted production JWKS. Revision 15 matched the current 22-stream config; that exact file passed Cloud validation on 5 October. Migration 0052 was verified on disposable royal-star, which does not establish its presence on blue-hill or the deployed backend's database. Recorded backend tests passed; real two-client PowerSync delivery remained unverified. Recheck the actual environment when implementing, rather than repeating every old investigation.

## Findings tied to the recording

| User's issue | Current code finding | Fix |
| --- | --- | --- |
| Opponent names appear, but the useful lineup view/control fails. | Enabled API returns formation, starters and bench. ConfirmSquadPage auto-population and friendlyLineupPlayers / friendlyLineupStarterIds still consume legacy players. | Normalize the public lineup and use it in setup, pitch and bench views. |
| Creator sees a roster list above the logger/report; logger clips content. | Both pages mount OpponentConfirmedLineupCard above their main content. Desktop .live-match has fixed viewport height and overflow:hidden. | Integrate lineup into the existing display and fix the content scroll region. |
| Different match IDs and no shared events. | Two private sheets intentionally have different IDs. The important identity is the same non-null sharedSessionId, plus the exact fixture and correct sides. | Check links, accepted uploads, session reads and peer rendering. |
| Clock/console errors. | ID-reuse 500 is fixed. applySyncedSessionClock still overwrites fresh API values with a local operation even if its revision is older. | Respect freshness, preserve immutable retry payloads and expose real errors. |
| Different reports/event scores/standings; first confirmation wins. | Session publication and fixture-based standings already exist, alongside private score/cache paths. Deployment/client behavior is still unproven. | Make all displayed shared scores and confirmation paths use the canonical result. |

The recording asks for the opponent's **confirmed match lineup**, formation and bench. Support that public view while keeping tactics, game plans, notes, injuries, drafts and the full roster private. Earlier plans disagree on lineup visibility; this plan follows the user's current request and the narrow API already implemented.

## Implementation order

Step 1 implementation status (5 October): added a shared public-lineup adapter, public starter slots/custom coordinates, and a read-only opponent lineup route for linked friendly/competition opponents. Manual drafts remain for external opponents; linked lineups are no longer copied into them. Missing numbers, distinct starters/bench, unknown positions, waiting/error/retry states and the labelled exact-fixture squad fallback are covered. Backend build, 33 focused backend tests, 13 focused frontend tests and lint checks passed. Frontend build still fails on the previously documented landing-scene TypeScript errors. HTTP lineup expectations were updated; database-backed HTTP and paired-account browser verification have not been run for this change. No deployment or database repair was performed.

Implementation update (5 October, logger/shared-read follow-up):

- Step 2: removed the full lineup blocks above the logger/report; integrated public players with the existing pitch, bench and report event selectors. Public selections upload labels, including the incoming substitution label, without display keys as roster IDs. Canonical reports retain those labels. Substitutions transfer the outgoing public slot; unplaced starters remain selectable. The logger content and bench scroll on short screens.
- Step 3: reports verify the requested session identity; individual upload receipts determine each queue outcome, with missing receipts retained and explained. Protected reads propagate HTTP failures instead of using private caches. Equal/older synced clock revisions retain the API/cache anchor. Clock retries retain their original elapsed time, operation ID, base revision and timestamp. Existing report polling and mutation invalidation remain the online convergence path.
- The existing disposable PGlite suites verify common friendly/competition sessions, correct sides, conflicting-link rejection, individual receipts, privacy and clock ID reuse. New regressions cover public substitution labels in both reports, stale clocks, immutable retry elapsed time, protected-cache denial and incomplete receipts. These are service/model checks, not paired-account browser or PowerSync delivery evidence.
- Read-only configured-development audit: node scripts/check-two-sided-release.mjs dev exits 1. Migration 0052 is absent from the migration journal; 0051 is not reported missing/changed. The audit also reports historical migration drift, 12 unknown journal entries, three competition fixtures with multiple session candidates and two null-linked sheets. Source grants/publication and the clock-session trigger pass. Duplicate completed-sheet findings remain candidates, not proof of duplicate standings. No database changes were made. The local .env sets TWO_SIDED_LIVE_LOGGING_ENABLED=true; the effective flag and database of a running/deployed backend were not verified.
- Local validation: backend npm.cmd run build; targeted ESLint for matches.service.ts and shared-session-privacy.spec.ts; npm.cmd run test -- --runInBand shared-session-privacy shared-session-integrity matches.schemas session-finalisation (39 passed). Frontend npm.cmd run build; npm.cmd run lint (existing warnings); node --test --test-isolation=none "src/**/*.node-test.mjs" (59 passed). The no-isolation option avoids Windows sandbox child-process EPERM. No new migrations or sync streams. Related work is this plan; no issue/card was supplied. Assisted by Codex (GPT-6).
- Paired authenticated event-link diagnostics, real upload/report convergence, mobile/short-screen visual testing and PowerSync authentication/delivery still need the aligned running test environment. Preserve old conflicting records under the repair document; use fresh fixtures for the manual test.

Implementation update (5 October, PowerSync/result review):

- Reviewed all three `two-sided-*.md` documents against current code, plus the testing guide and Git methodology. The configured application source is blue-hill/neondb; the disposable test source is royal-star/neondb. A live Cloud config fetch confirms instance `6aac1ed7a77ca1231d28f82d` (Development) replicates blue-hill and trusts `https://gaffer-api-ynaf.onrender.com/sync/jwks`. That JWKS exposes RS256/`gaffer-production-1`; the local signer remains HS256/`gaffer-dev`, without the prepared RSA private key loaded. Database source alignment exists for the configured application, but local auth does not match the trusted hosted key. The running backend database/flag and whether Development serves production remain unverified.
- The read-only source audit still exits 1: 0052 is absent from the journal, historical migration drift/unknown entries remain, and the same three conflicting competition fixtures/two null-linked sheets remain. Publication/grants, active replication slot and clock-session trigger pass. No shared-environment migration, key registration, deployment or data repair was performed.
- Direct Cloud validation of the exact main sync config passed. Configuration and connection checks were skipped by `--validate-only sync-config`; this verifies rules, not client auth or delivery. The historical wrapper failed with child-process EPERM; invoking its cached CLI directly succeeded.
- Reproduced stale confirmation in disposable PGlite: an away goal changed the canonical score after the first confirmation without clearing it. Additive migration 0053 clears pending confirmation timestamps/actors and participant states on public canonical event/review changes. Private injuries, idempotent retries and projection bookkeeping retain confirmations. Finalised sessions retain the existing amendment workflow. No new columns or sync streams.
- Corrected lazy 24-hour publication to count canonical session goals instead of using one private sheet's projection score. Regressions cover both confirmation orders for a 2-1 result, pending publication, one fixture result/one played match per team across both accounts and repeated reads, score changes in both orders, both timeout paths, injuries/retries, review invalidation and distinct reverse round-robin legs. These are service/SQL checks, not browser or PowerSync delivery evidence.
- Logger status now separates upload acceptance from the SDK's live-update connection. An empty queue no longer displays "Synced" while PowerSync is disconnected. API polling and local queue access continue without a new instance.
- Peer proof needs a confirmed appropriate target and two authenticated coaches: trace an accepted upload's canonical event ID into the other client's local synced tables, then repeat after a warmed client disconnects/reconnects. Record exact fixture/session identity and peer event ID; API polling or an active replication slot is insufficient. Before registering the local public key or writing test fixtures on Development, confirm whether it serves production. If it does, select an existing isolated target while continuing API/frontend work.
- Local validation: backend `npm.cmd run build`; `npx.cmd eslint --fix src/matches/shared-session-integrity.spec.ts src/competitions/competition-fixture-results.ts`; `npm.cmd run test -- --runInBand shared-session-integrity shared-session-privacy session-finalisation sync.controller sync-jwks.controller competition-standings` (6 suites, 50 passed). Frontend `npm.cmd run build`, `npm.cmd run lint` (existing warnings), and `node --test --test-isolation=none "src/**/*.node-test.mjs"` (59 passed). The reverse-leg test initially failed because changing its schedule reset confirmation; correcting setup to confirm after changing the date made the suite pass. Related work is this plan; no issue/card was supplied. Assisted by Codex (GPT-6).

### 1. Fix opponent setup and lineup data

Files: backend/src/friendly-fixtures/friendly-fixtures.service.ts; frontend/src/features/matches/types.ts and live-match-model.ts; features/events/OpponentConfirmedLineupCard.tsx; pages/ConfirmSquadPage.tsx and OpponentSquadSetupPage.tsx; opponent pitch components.

Create one adapter for starters/bench and the supported legacy shape. Keep substitutes distinct and retain players with missing numbers. Stop importing the linked team's confirmed lineup into an editable manual draft. Show **View opponent lineup** for registered linked opponents, opening a read-only pitch/bench view. Keep the manual editor for external/free-text opponents. Unconfirmed lineups show a waiting state.

For accurate formation placement, extend the confirmed public projection with each starter's public slotId, derived from the confirmed snapshot. Custom formations can expose only the public position coordinates/labels required to draw them. Exclude athlete IDs, private plan IDs and the plan object. Current array order is shirt-number order, so it cannot establish pitch position. Unknown slots/formation remain unknown; do not guess. No new database table is expected.

Re-confirmation refreshes the opponent view before kickoff. Keep the confirmed snapshot visible afterwards. Without a snapshot, retain the exact-fixture squad fallback, identify it as squad data and leave formation unknown.

Done when both coaches can inspect the permitted lineup, including formation and bench, without entering the manual editor or seeing private setup.

### 2. Repair the logger and report layout and player controls

Files: LiveMatchPage.tsx, LiveMatchPage.css, MatchReportPage.tsx, the lineup adapter and opponent pitch/bench components; backend/src/matches/matches.service.ts for public event attribution.

Remove the standalone full lineup card above both pages. Feed confirmed starters/bench into the existing opponent display; offer a read-only lineup panel when useful. Place the compact shared-result status within the normal layout. Give desktop content a defined scroll region and keep every control reachable on short screens and mobile.

When public opponent players are available, let the coach select them to record opponent events instead of forcing the generic action. Both coaches may submit observations about either side; duplicate review still reconciles them. Display-only keys must never be uploaded as opponentPlayerId or athleteId, which reference real private/manual roster rows. Use existing label fields for public selections, including substitution labels. Ensure the canonical report retains the safe event-supplied label when no real player row exists: its current player projection only joins athlete/manual-opponent rows. Use real IDs only for own athletes or locally stored manual opponent players. Keep generic logging when player information is unavailable.

Done when creator and invitee both have usable pitches, benches and event controls, without a roster block pushing the page out of view.

### 3. Make shared reads, uploads and clock state dependable

Files: frontend/src/features/matches/api.ts, hooks.ts, session-report-model.ts; frontend/src/offline/match-store.ts; queue/review components. Change backend session/clock logic only for a targeted reproduced defect.

Check GET /events/:eventId/link-diagnostic from each coach: different sheet IDs, one session matching the exact fixture, correct home/away sides. Verify 0051/0052/0053 and the effective feature flag on the backend/database actually serving the test. Reuse safe start/retry attachment. Recorded legacy events or conflicting links require a visible reconciliation error.

Trace one event through own sheet queue -> /sync/upload receipt -> canonical session event -> session report -> both pages. HTTP 201 for the batch does not prove acceptance: inspect each receipt's outcome and safeErrorCode. Preserve rejected/queued items and show the reason. Invalidate shared report/review queries after events, decisions, finish and confirmation.

useMatchView already polls the canonical report every second. Use this existing path to repair online convergence; no additional transport is needed. A shared-read failure must not silently become a private score. PowerSync auth alone cannot explain every online divergence: also check accepted uploads and common session identity.

Replace an API clock anchor only when synced authority is demonstrably newer. Equal/older revisions keep the fresh API values. Never combine an old anchor with Math.max of revisions. Check operation ordering across sheets against existing authority rules. Retries keep the same operation ID and immutable payload; new actions get new IDs. Retain the explicit ID-reuse 409.

Treat HTTP authorization failures as failures, including private match/squad caches: do not serve stale protected responses after 401/403/404. Offline fallback remains available for network failures and previously warmed authorized matches.

Done when online events, reviews and clock actions converge without reloads, and failures remain visible.

### 4. Align PowerSync without requiring another instance

Settings/files: backend signer environment; frontend API/auth environment; frontend/src/offline/match-store.ts; chosen instance's Client Auth.

Establish the actual local/hosted database and endpoint, and whether Development also serves production. Backend database and replication source must match: royal-star writes cannot arrive through a blue-hill instance.

**Preferred local route, if Development is confirmed appropriate:** use blue-hill consistently with its existing instance. Load the independent RSA signer already prepared in the ignored local file into the local backend through explicit environment/launcher configuration. Register its **public JWK only** directly in that instance's Client Auth, preserving existing trusted keys/JWKS settings. Keep audience, five-minute expiry, user/team claims and signature checks. Refresh both coaches' credentials. [PowerSync supports direct public-key configuration](https://docs.powersync.com/configuration/auth/custom), so this route needs neither a publicly hosted local JWKS endpoint nor a new instance.

If Development serves production, use an existing properly aligned hosted test path or continue local online UI testing through the authenticated API while selecting a safe sync target. Do not add a local signing key to production, copy the production private key or repoint a source. A new isolated instance remains optional.

Compare the current sync-config once: recorded revision 15 already matched powersync/sync-config.yaml. Change streams only if the final code needs new synced fields. Show connection failure separately from queued uploads, so local save does not masquerade as peer delivery.

Done when both real coach clients authenticate and receive peer canonical changes through PowerSync. API polling verifies online behavior; it does not verify PowerSync/offline delivery.

### 5. Make the result agree everywhere

Files: backend/src/matches/matches.service.ts; backend/src/competitions/competition-fixture-results.ts and competitions.service.ts; event-list/detail score reads; relevant frontend event/match/report/competition hooks.

Use the canonical home/away session result in both live views, both reports and any event-list/detail score display. Translate into team perspective only for display: home 2-1 equals away's own 1-2. Published fixture home/away scores remain the standings source. Count one result per fixture; preserve reverse round-robin legs.

Keep bilateral confirmation and the existing 24-hour no-response rule. Open reviews/disputes block final publication. Show who confirmed and who is pending. Flush uploads before confirming; prevent confirmation while relevant uploads are queued, rejected or under review. Confirm the current canonical score. Reproduce a score-changing event/decision between confirmations; if an old confirmation survives the change, invalidate it or bind it to the canonical revision. Add a migration only if that reproduction proves the existing fields cannot enforce this rule.

Test both confirmation orders. First confirmation must not select that coach's private score. Invalidate event/report/competition caches after publication and compare again after reloading both accounts.

Existing October fixtures with competing sessions/results need an exact-fixture reconciliation decision. Preserve their evidence and use [the repair query](two-sided-test-data-repair.md); fix forward with fresh fixtures while keeping targeted old-data repair separate.

Done when a reviewed 2-1 competition game publishes once, both reports/event scores agree, and standings count one played match per team regardless of confirmation order.

### 6. Build and hand back for manual testing

Fix the known TypeScript errors in frontend/src/components/landing/gaffer-stadium.ts and landing-scene.ts as needed for a runnable build. They were reproduced on the review baseline and are separate from the match defect.

Run build/lint for changed code and existing focused integrity/privacy coverage when touching that behavior. Add narrow regressions for the lineup adapter, stale-clock overwrite and any reproduced confirmation bug. Reuse existing suites; no additional phase runner or evidence bundle. Record checks briefly in the implementation PR/commit. The user performs the paired browser test below.

## Short manual test

Use two independent coach accounts/browser profiles. Run once for an accepted friendly and once for a generated competition fixture.

1. Confirm lineups; open View opponent lineup from both sides. Check formation, starters and bench, then re-confirm before kickoff and see the update. Private tactics/notes stay private.
2. Start both sheets, verify the common session and inspect both logger layouts on desktop/mobile. Select a confirmed opponent player to log an event.
3. Log different goals from each coach; both timelines/scores update. Log the same goal from both sides, resolve the duplicate and see the same decision and corrected score.
4. Alternate clock start/pause/resume between coaches. Once real sync is connected, briefly disconnect a warmed client, log an event, reconnect and check it arrives once on both sides.
5. Finish and confirm A then B; repeat on another fixture with B then A. Check pending state after the first confirmation, then one final result across reports, event score display and standings. Friendlies contribute no standings result.
6. Reload both accounts. Check persistence, accessible layout and third-account rejection of the shared match/private setup.

## Documentation kept

Use this plan, [short rollout notes](two-sided-live-logging-rollout.md) and [the repair query](two-sided-test-data-repair.md). Repeated phase reports, the superseded phase 2/release documents and generated docs/phase*-validation artifacts are removed. Committed evidence remains in Git history at the reviewed commits; disposable ignored logs are discarded. Generated output is ignored so historical runners cannot refill tracked docs. Keep application tests, migrations and runtime integrity checks.

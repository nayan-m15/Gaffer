# Phase 1.6 — lineup contract failure triage

Date: 5 October 2026 (Africa/Johannesburg). Scope: classify the four Phase 1.5 friendly lineup failures, compare base production code with Phase 1, correct justified stale tests, and inspect the lineup response allowlist. No Phase 2 implementation.

The two handoff reports were read in full before investigation. Their recorded results remain unchanged. The actual checkout differed from the handoff's working-diff description: it was clean at `25aec593`, on `feat/matches-two-sided-live-logging`. That existing commit contains Phase 1 and Phase 1.5. This session made no commit. Comparison base remains exactly `e01fe3d18be0c47edc8a56ebcd70d7d83c9a7dec`.

## A. Four exact failures

All four are in `backend/test/friendly-fixtures.e2e-spec.ts`, with `TWO_SIDED_LIVE_LOGGING_ENABLED=true`. Line numbers below refer to the unchanged original file on both SHAs, before Phase 1.6 edits. All observed requests returned HTTP 200; these were assertion failures, not HTTP/network failures. The historical [Phase 1.5 log](phase15-validation/e2e.log) identifies the same assertions.

The three unavailable responses were exactly:

```json
{"available":false,"formation":null,"starters":[],"bench":[]}
```

1. **`keeps the opponent lineup unavailable while the fixture is pending or declined`**
   - First failing assertion, original line 786: `expect(pending.body).toMatchObject({ available: false, teamId: coachB.team.id, teamName: coachB.team.name, players: [] })`.
   - Expected: opponent B's actual team UUID/name plus an empty `players` array.
   - Actual: the unavailable JSON above; `teamId`, `teamName`, and `players` are absent.
   - State: pending registered-team friendly, scheduled tomorrow; neither side has started or confirmed a lineup. The first assertion prevents the declined-state assertion from being reached in the original run.
   - Endpoint: `GET /events/:requesterEventId/friendly-opponent-lineup`.
   - Path: `EventsController.friendlyOpponentLineup` → `EventsService.getFriendlyOpponentLineup` → `FriendlyFixturesService.resolveOpponentLineup`, `fixture.status !== 'accepted'`, flag-on neutral response.

2. **`shares the opponent’s confirmed lineup for an accepted friendly fixture`**
   - First failing assertion, original line 843: `expect(beforeSquad.body).toMatchObject({ available: false, teamId: coachB.team.id, teamName: coachB.team.name, players: [] })`.
   - Expected: opponent B's actual team UUID/name plus empty `players` before kickoff.
   - Actual: the same unavailable JSON; the three legacy fields are absent.
   - State: accepted registered-team friendly, scheduled today, both squads registered but no lineup snapshot or match sheet yet.
   - Endpoint: `GET /events/:requesterEventId/friendly-opponent-lineup`.
   - Path: accepted fixture → `resolveConfirmedOpponentEvent` → `resolveLegacyOpponentEvent` finds neither snapshot nor squad, then flag-on projection returns the narrow empty shape.
   - Important: this first failure occurs **before either `startMatch` call**. The original run cannot prove the later match-read assertions; corrected base/current runs cover them separately.

3. **`never falls back to a different match of the opponent team`**
   - Failing assertion, original line 1147: `expect(shared.body).toMatchObject({ available: false, teamId: coachB.team.id, teamName: coachB.team.name, players: [] })`.
   - Expected: opponent B's actual team UUID/name and empty `players`, despite B starting an unrelated free-text match.
   - Actual: the same unavailable JSON. Isolation behavior is correct: no unrelated squad is returned.
   - State: accepted registered-team friendly, scheduled today, opponent's **different** free-text event has a started sheet; the fixture-linked opponent event has neither sheet nor snapshot.
   - Endpoint: `GET /events/:requesterEventId/friendly-opponent-lineup`.
   - Path: `resolveLegacyOpponentEvent` restricts the event by both `events.teamId` and the exact `friendlyFixtureId`; flag-on projection removes the legacy metadata.

4. **`shares each confirmed pre-kickoff lineup across an accepted friendly fixture`**
   - Failing assertion, original line 1219: `expect(lineupForB.teamId).toBe(coachA.team.id)`.
   - Expected: coach A's actual team UUID.
   - Actual: `undefined`, because `teamId` is absent. `available` is already true and its preceding assertion passes.
   - State: A confirmed 11 starters and two bench players while pending; B accepted; both events are scheduled today and neither has started. The confirmed snapshot exists.
   - Endpoint: `GET /events/:opponentEventId/friendly-opponent-lineup`, read by B to see A.
   - Path: accepted fixture → `resolveConfirmedOpponentEvent`, snapshot branch; output uses `formation`, `starters`, and `bench`, not athlete-ID-bearing `players`.
   - Actual complete body on both base and Phase 1:

```json
{
  "available": true,
  "formation": null,
  "starters": [
    {"name":"Alpha1 Player","shirtNumber":1},
    {"name":"Alpha2 Player","shirtNumber":2},
    {"name":"Alpha3 Player","shirtNumber":3},
    {"name":"Alpha4 Player","shirtNumber":4},
    {"name":"Alpha5 Player","shirtNumber":5},
    {"name":"Alpha6 Player","shirtNumber":6},
    {"name":"Alpha7 Player","shirtNumber":7},
    {"name":"Alpha8 Player","shirtNumber":8},
    {"name":"Alpha9 Player","shirtNumber":9},
    {"name":"Alpha10 Player","shirtNumber":10},
    {"name":"Alpha11 Player","shirtNumber":11}
  ],
  "bench": [
    {"name":"Alpha12 Player","shirtNumber":12},
    {"name":"Alpha13 Player","shirtNumber":13}
  ]
}
```

## B. Base SHA comparison

`validate-phase16.mjs base` exports the requested SHA with `git archive` into a fresh OS temporary directory, extracts it without touching the working tree, and junctions the installed backend dependencies. Source/config/test files come from that SHA. Environment credentials are supplied to the child, never printed or copied into the checkout. No Git reset, stash, checkout, migration, schema reset, or historical repair occurs.

Both source versions ran against the existing disposable PostgreSQL branch `br-misty-moon-b2be9vmt`, endpoint `ep-royal-star-b253pvlk`, database `neondb`. The runner verifies hostname/database and server-reported branch/endpoint before and after each run. The schema includes already-applied 0052 for **both** comparisons. This isolates the application-code difference; it is not a claim to recreate a pre-0052 database. The original failures all occur before fixture-linked kickoff, and neither resolver reads projection `session_id` or calls the new attachment function. Thus 0052 cannot mask their response-shape mismatch.

| Failure | Base SHA original assertion | Phase 1 original assertion | Relevant payload difference | Did Phase 1 change it? |
|---|---|---|---|---|
| 1. Pending/declined | FAIL | FAIL | None; exact same unavailable body | NO |
| 2. Accepted before squad | FAIL | FAIL | None; exact same unavailable body | NO |
| 3. Unrelated opponent match | FAIL | FAIL | None; exact same unavailable body | NO |
| 4. Confirmed pre-kickoff | FAIL | FAIL | None; exact same full confirmed body | NO |

Actual endpoints, complete HTTP bodies, statuses, feature flags and test titles are retained separately in [base-http.jsonl](phase16-validation/base-http.jsonl) and [current-http.jsonl](phase16-validation/current-http.jsonl). Exact expected UUID/name values and assertions are retained in [base-jest.json](phase16-validation/base-jest.json), [current-jest.json](phase16-validation/current-jest.json) and their logs. Synthetic account/fixture identifiers differ between runs; the four lineup bodies compare equal without normalization.

The exact response comparisons, including later corrected event/match reads, are summarized in [comparison.json](phase16-validation/comparison.json). All four original payload comparisons and all four corrected read-sequence comparisons are equal.

The corrected tests are additionally copied into a **new isolated base checkout**, leaving its production code unchanged, and run as `base-corrected`. This traverses previously unreachable bilateral starts, event and match reads, snapshot retention and access denials. It supplements the original failure reproduction; it does not overwrite the original evidence.

Git blob evidence before Phase 1.6 corrections:

| File | Identical blob at base and Phase 1 |
|---|---|
| `backend/src/friendly-fixtures/friendly-fixtures.service.ts` | `fea99e20f746edcfe8ef73f0d727649dc83baa3e` |
| `backend/test/friendly-fixtures.e2e-spec.ts` | `b4f4b8b4c59e45d64fa6c9da490f698212c49936` |
| `frontend/src/features/events/OpponentConfirmedLineupCard.tsx` | `58f3cb043e4ce7e78f55ccdffe2ab7e78b1e0dae` |

## C. Current lineup contract

`GET /events/:eventId/opponent-lineup` and `/friendly-opponent-lineup` are aliases calling the same controller/service. Event access is restricted to the signed-in user's team before fixture resolution. `GET /matches/:matchId` restricts the private sheet to its owning team and embeds the same resolver result under **`friendlyOpponentLineup`**, including competition fixtures. There is no new top-level `opponentLineup` field.

For friendly match reads, the stored `match.opponentTeamId` must also agree with the actual fixture opponent. Competition lookup verifies linked competition participants belong to the fixture's competition and include the caller's team; external/unlinked or same-team opponents return unavailable. It does not resolve by opponent name or by shared session ID.

| Case | Actual response behavior |
|---|---|
| A. Flag ON, confirmed snapshot exists | Exactly `{available:true, formation:string-or-null, starters:[{name,shirtNumber}], bench:[{name,shirtNumber}]}`. Snapshot IDs determine membership and starter/bench status; roster query is constrained to opponent team. Formation comes only from `event_lineups.formationId`. |
| B1. Flag ON, no snapshot, fixture-linked opponent sheet has squad rows | Same four keys and two-key player objects; `available:true`, `formation:null`; membership/status come from `athlete_match_stats`. |
| B2. Flag ON, neither snapshot nor fixture-linked squad | Exactly `{available:false, formation:null, starters:[], bench:[]}`. |
| C. Flag OFF, valid friendly/competition opponent | Legacy `{available,teamId,teamName,players}`. Each player has `{id,firstName,lastName,squadNumber,position,started}`. Snapshot path additionally includes `formationId`, `pitchAssignments`, `customPositions`, `confirmedAt`; match-squad path does not add these snapshot fields. |
| C2. Flag OFF, pending/declined friendly | `{available:false,teamId:opponentId,teamName:opponentName,players:[]}`. |
| C3. Flag OFF, no valid linked opponent | `{available:false,teamId:null,teamName:null,players:[]}`. |
| D. Accepted friendly | Uses A/B/C according to flag/source availability; acceptance alone does not make a lineup available. Pending/declined flag-on friendlies return the narrow unavailable body. |
| E. Generated competition with both linked registered teams | Uses the same `resolveConfirmedOpponentEvent(opponentTeamId,fixtureId,true)`, same projection and fallback. Access derives from `competitionTeams`, `competitionFixtures` and fixture-linked `events`. |

Fields below concern the **opponent-lineup response itself** or embedded opponent-lineup object, not unrelated fields of the owner's private match DTO:

| Field | Flag ON snapshot | Flag ON fallback | Flag OFF snapshot | Flag OFF squad |
|---|---|---|---|---|
| `available` | Yes | Yes | Yes | Yes |
| `formation` | String/null | Null | No (`formationId` instead) | No |
| `starters`, `bench` | Yes | Yes | No (`players` instead) | No (`players` instead) |
| Player name | `name` | `name` | `firstName`, `lastName` | `firstName`, `lastName` |
| Shirt number | `shirtNumber` | `shirtNumber` | `squadNumber` | `squadNumber` |
| Formation position/slot | No | No | `pitchAssignments`, `customPositions`; registered `position` per player | Registered `position`, no formation slot |
| `teamId`, `teamName` | No | No | Yes | Yes |
| Athlete IDs | No | No | Player `id`, assignments can contain IDs | Player `id` |
| Tactics | No | No | No tactics/style fields; formation geometry may be present | No |
| Game plan/settings | No | No | No game-plan object/settings | No |
| Notes | No | No | No | No |
| Injuries | No | No | No injury fields | No injury fields |
| Draft state | No | No | No | No |
| Confirmation time | No | No | `confirmedAt` | No |
| Internal plan IDs | No | No | No | No |

Players are sorted by shirt number (null treated as 999), then surname/given name, and split into starters/bench. Array order is **not formation-slot order**. A snapshot can be `available:true` even if referenced players no longer resolve: availability is `Boolean(lineup) || legacy.available`.

Frontend evidence: `features/events/api.ts` fetches `/opponent-lineup` typed as `OpponentLineupView`; `features/matches/api.ts` fetches `MatchDetail`, whose `friendlyOpponentLineup` uses that same union in `features/matches/types.ts`. `OpponentConfirmedLineupCard` renders only available responses containing `starters`, displaying formation, name and shirt number. `ConfirmSquadPage` renders that card and uses team/event context for the opponent label. Its old manual squad auto-population effect only accepts the legacy `players` branch; it does not invent slots from the narrow response. No frontend changes were made.

Actual HTTP examples are retained in [final-http.jsonl](phase16-validation/final-http.jsonl) for empty/snapshot/fallback/neutral friendly cases and [contracts-final-http.jsonl](phase16-validation/contracts-final-http.jsonl) for flag-off snapshots, flag-off squad reads, enabled fallback, completion, and generated competition event/match reads. These are full payloads, not reconstructed examples.

## D. Fallback investigation

Exact resolver path in `backend/src/friendly-fixtures/friendly-fixtures.service.ts`:

```ts
const legacy = await this.resolveLegacyOpponentEvent(opponentTeamId, fixtureId, competition);
if (!twoSidedLiveLoggingEnabled()) return legacy;
// Find the opponent event by its exact fixture ID and owning team.
// Load event_lineups for that exact event.
let players = legacy.players;
if (lineup) {
  // Replace players with the snapshot roster, constrained to opponentTeamId.
}
const toPlayer = (player: FriendlyOpponentLineupPlayer) => ({
  name: (player.firstName + ' ' + player.lastName).trim(),
  shirtNumber: player.squadNumber,
});
return {
  available: Boolean(lineup) || legacy.available,
  formation: lineup?.formationId ?? null,
  starters: players.filter(player => player.started).map(toPlayer),
  bench: players.filter(player => !player.started).map(toPlayer),
};
```

`resolveLegacyOpponentEvent` first finds the exact opponent event by fixture and team. It then finds that event's sheet by `matches.eventId`; non-empty `athlete_match_stats` joined to athletes wins on the legacy path. If there is no such squad, it looks for the event's confirmed snapshot. The enabled wrapper reverses source priority when a snapshot exists: its snapshot roster replaces `legacy.players`. **No snapshot** leaves `legacy.players` selected. With no sheet/squad either, the result stays unavailable. A different match by the same team never qualifies.

Snapshots can be absent because:

- Start accepts a squad directly without requiring any earlier `PUT /events/:id/lineup`. This is exactly the direct-start case in affected test 2 once its early assertion is corrected.
- Existing/older sheets or flag-off starts have no retained snapshot. Both existing-sheet and fresh-sheet `startMatch` branches delete `eventLineups` **only when the flag is off**.
- An event may never have had a confirmation; event/team deletion also cascades the snapshot. No historical fixture rows were inspected or repaired here.

Flag-on fresh start retains an existing snapshot and does **not** create one when absent. Flag-on retry returns the linked sheet without modifying a snapshot. `confirmLineup` upserts/replaces the snapshot pre-start and rejects later edits once a match exists. `finish` marks the event completed and updates clock/projection; it neither deletes nor replaces `eventLineups`. Existing allowlist E2E covers unchanged reads through kickoff and full time; the diagnostic probe covers full-time fallback with a deliberately fresh flag-off sheet.

Fallback is deliberate: the pre-existing `resolveLegacyOpponentEvent` documentation explicitly describes pre-kickoff snapshots and post-kickoff squad rows; the enabled wrapper explicitly initializes `players = legacy.players`. It retains exactly the same narrow allowlist. Although the intermediate legacy object contains IDs/positions, the flag-on response does not serialize it.

Fallback explains the later direct-start behavior of affected test 2. It does **not** explain the first failing assertion in any of the four original tests: 1 is pending, 2 has not started, 3 correctly finds no fixture-linked sheet, and 4 uses a snapshot.

Deferred product questions: without a snapshot formation is lost (`null`); fallback uses current sheet rows, not an immutable confirmation; and starting without explicit `benchAthleteIds` seeds every non-injured selectable team athlete into the squad. Consequently fallback can label the wider active roster as bench. Snapshot names/numbers are also resolved from current athlete records. Whether “confirmed lineup” should promise frozen membership/labels/formation is a Phase 2 decision, not a reason to restore legacy athlete IDs or change this task's production contract.

## E. Phase 1 impact analysis

Every file listed in the Phase 1 handoff was reviewed for lineup relevance, including indirect effects:

| Phase 1 file | Relevant effect / limitation |
|---|---|
| `events/events.service.ts` | `startMatch` now resolves existing eligible sheets before scheduled-status rejection, uses centralized identity/session creation, and safely attaches empty null sheets. Correct linked retries, including completed sheets, return early. Conflict/evidence guards may block invalid starts. **No snapshot deletion/retention branch, fresh squad write, event selection, opponent selection, feature-flag projection, or opponent-lineup method was changed.** |
| `matches/match-session-integrity.ts` | Reads fixture/team/session identity; optionally ensures a session; checks historical evidence. Does not read/write `eventLineups`, athlete roster or squad rows. Can prevent unsafe attachment; does not select the lineup source. |
| `matches/matches.service.ts` | New guards on ingestion/mutation/clock/finish/finalisation and session confirmation. `getMatch` DTO construction and opponent-lineup call are unchanged. Successful finish still marks completed without altering snapshots. Invalid identity can now block completion; that is intended integrity behavior and is not involved in the four responses. |
| `competitions/competition-fixture-results.ts` | Guards publication, timeout and manual reset. No snapshot/lineup manipulation; canonical result publication is distinct from lineup resolution. |
| `sync/sync.controller.ts` | Rejected upload receipt codes only; does not construct lineup responses. |
| `drizzle/0052_shared_session_integrity.sql` | Projection session identity and atomic safe attachment; no event_lineups, squad, athlete, lineup shape, or bulk data repair. |
| `drizzle/meta/_journal.json` | Appended migration entry only. |
| `matches/shared-session-integrity.spec.ts` | Regression coverage; no production behavior. |
| `competitions/competition-fixtures.spec.ts` | Explicit flag-off legacy/manual test isolation only. |
| `test/team-isolation.e2e-spec.ts` | Diagnostic expectations only. |
| `docs/phase1-shared-session-integrity-verification.md` | Evidence only. |

Event status: fresh start still leaves the stored event `scheduled`; match existence identifies the started/live sheet, and `finish` changes status to `completed`. Phase 1's retry ordering changes **whether an existing sheet can be returned**, not the snapshot/roster content or successful fresh-start transition. Earlier attachment can avoid unsafe legacy progression, and invalid participant/session rows are now rejected. Those intentional start/attachment differences should not be described as “Phase 1 has no effects anywhere”; they do not change the four assertions' lineup behavior.

Lineup loading remains a read-time operation using exact fixture/team/event identity, independent of sheet-session attachment timing. No new session participant logic replaces its fixture-participant resolver. Snapshot availability and fallback selection remain unchanged. The corrected base/current runs cover the previously unreachable start paths rather than relying solely on unchanged `FriendlyFixturesService`.

Conclusion for each of the four failures: **NO direct or indirect Phase 1 change to the behavior relevant to its assertion.**

## F. Classification

| Failure | Base | Current | Classification | Action |
|---|---|---|---|---|
| 1. Pending/declined | FAIL, narrow unavailable | FAIL, identical | **B. STALE TEST EXPECTATION** | Expect exact narrow unavailable response; retain declined/access checks. |
| 2. Accepted before squad | FAIL, narrow unavailable | FAIL, identical | **B. STALE TEST EXPECTATION** | Expect narrow unavailable and exact name/number starter/bench arrays after direct start, on both event and match paths. |
| 3. Unrelated opponent match | FAIL, narrow unavailable | FAIL, identical | **B. STALE TEST EXPECTATION** | Expect narrow unavailable; preserve the unrelated-match isolation scenario. |
| 4. Confirmed pre-kickoff | FAIL, absent `teamId` | FAIL, identical | **B. STALE TEST EXPECTATION** | Compare narrow bilateral snapshot arrays; expect flag-on snapshot retention after start. |

Intent is sufficiently established by the existing explicit flag-on allowlist E2E, the pre-existing backend `ConfirmedOpponentLineup` projection, the matching frontend union/card, and the base-SHA HTTP behavior. The production behavior underlying the mismatches is an intentional pre-existing contract (C), but **the failures themselves** are classified B. No failure is classified a Phase 1 regression. Deferred product questions about fallback/UI do not prevent correcting these specific stale assertions.

## G. Changes made

- Production: **none**. No migrations, frontend, PowerSync, deployment, historical repair or October-record changes.
- `backend/test/friendly-fixtures.e2e-spec.ts`: corrected only the four affected cases' legacy response expectations and later snapshot-retirement expectation; exact allowlisted arrays replace ID assertions. Suite defaults explicitly to flag ON and restores the prior environment after each test; existing flag-toggle tests retain their overrides. Authentication, outsider denial, symmetric reads, own-lineup validation and unrelated-match isolation checks remain.
- `backend/test/phase16-lineup-contract.e2e-spec.ts`: two narrow synthetic HTTP diagnostic probes for flag modes/snapshot deletion/fallback/completion and competition event/match contract; cleans up only its own generated identities/teams.
- `backend/scripts/validate-phase16.mjs`: branch-pinned runner, isolated base archive export, passive response capture and separate logs/JSON/exit-code evidence. It never runs migrations or modifies base production code. Temporary capture hooks contain no credentials.
- `docs/phase16-lineup-contract-triage.md` and `docs/phase16-validation/`: this report and new evidence. Phase 1 and Phase 1.5 evidence remains unchanged.

Privacy sanity check: flag-on snapshot and fallback responses contain **only** the four lineup keys and two player keys. No athlete IDs, tactics, game-plan object/settings, private notes, injuries, draft state, confirmation timestamp, formation assignments or private plan IDs are serialized. There is no newly discovered flag-on **lineup-response** privacy blocker. This does not sign off other endpoints, review payloads or injury streams. The full private match DTO includes the owner's own plan/notes and identifiers; those are separate from the opponent-lineup object and remain outside this narrow review.

An exact-key audit of all captured successful feature-enabled opponent-lineup objects passed for **69 responses**, including embedded match responses. Owner `/lineup` responses and other owner match DTO fields were excluded deliberately; they are not opponent-lineup responses. [privacy-allowlist.json](phase16-validation/privacy-allowlist.json) retains the response references and checked keys.

## H. Final verification

Commands are from the repository root unless noted. E2E uses the normal repository Jest E2E config, serial execution, and existing migrated disposable schema, with a passive `--setupFilesAfterEnv` response capture hook. It does not use experimental VM modules. Unit commands use that flag because `backend/package.json` explicitly requires it in `npm test`.

| Command | Result |
|---|---|
| `node backend/scripts/validate-phase16.mjs base` | Original four assertions: 4 failed / 13 skipped; Jest 133.541 s; child exit 1. |
| `node backend/scripts/validate-phase16.mjs current` | Original four assertions: 4 failed / 13 skipped; Jest 129.609 s; child exit 1. |
| `node backend/scripts/validate-phase16.mjs affected` | Corrected four: 4 passed / 13 skipped; Jest 183.009 s; child exit 0. |
| `node backend/scripts/validate-phase16.mjs base-corrected` | Corrected assertions on isolated base production code: 4 passed / 13 skipped; Jest 182.908 s; child exit 0. |
| `node backend/scripts/validate-phase16.mjs final` | Full friendly suite: 17/17 passed; Jest 412.608 s; child exit 0. |
| `node backend/scripts/validate-phase16.mjs contracts-final` | 2/2 probes passed including cleanup; Jest 87.854 s; child exit 0. |
| `node backend/scripts/validate-phase16.mjs integrity` | 18/18 passed; Jest 12.764 s; child exit 0. |
| `node backend/scripts/validate-phase16.mjs unit` | 68 suites / 793 tests passed; Jest 89.69 s; child exit 0. |
| `node backend/scripts/validate-phase16.mjs build` | Passed; child exit 0. |
| `node backend/scripts/validate-phase16.mjs lint` | Passed on both changed TypeScript test files; child exit 0. |
| `node --check backend/scripts/validate-phase16.mjs` | Passed; exit 0. |
| `git diff --check` | Passed; exit 0. New-file whitespace scan also passed. |

Each `*-process.json` records the exact expanded command, source SHA, disposable database identity, duration and child exit code; each `*-jest.json` retains assertions/results. Equivalent direct E2E invocation from `backend`: `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand test/friendly-fixtures.e2e-spec.ts`, adding the documented four-name `--testNamePattern` for focused runs. The runner's response hook only records selected actual HTTP responses; it does not change them or suppress assertions.

Competitions and team-isolation existing E2E files were **not touched in Phase 1.6**, so their reruns are not required by the task's conditional rule. Phase 1.5 historical results remain competitions 14/14, isolation 5/5 and offline sync 5/5; these are not presented as new Phase 1.6 runs. The new competition diagnostic checks lineup event/match reads without changing the competition suite.

Failure categories and retained attempts:

- Assertion failures: original base and current four-test runs reproduce exactly once each. No unchanged failing assertion was rerun hoping for a pass.
- Diagnostic setup failure: `contracts` initially had one passing fallback probe and one failed expected-201/got-403 competition kickoff. Its date change triggered `reset_competition_fixture_schedule_confirmation`, clearing confirmation in the same UPDATE. The existing service correctly refused kickoff. Setup now changes date and confirms in separate SQL statements, matching Phase 1.5's existing setup. Original `contracts-*` artifacts remain; corrected run uses `contracts-corrected-*`.
- Database failures: `contracts-corrected` passed both assertions (2/2) but failed teardown with PostgreSQL foreign-key constraint `matches_event_id_events_id_fk` while deleting its generated competition team; child exit 1. The probe now deletes only its own competition sheets before calling the repository identity cleanup, avoiding the fixture-event sync cascade conflict. `node backend/scripts/validate-phase16.mjs cleanup-probe` cleaned the exact retained synthetic fixture/team/user IDs after branch and synthetic-name checks; [cleanup-probe.json](phase16-validation/cleanup-probe.json) records scope. No fixture-trigger production fix was attempted. The separate `contracts-final` run passed both probes and cleanup. No actual database connection/network failure occurred; the unit log includes an intentionally mocked timeout rejection test.
- Process/spawn failures: the first sandbox base runner failed `spawnSync git EPERM` before exporting/running any test or mutating test data. Approved escalated guarded runner resolved it. An early PowerShell-redirection unit invocation displayed all 68 suites / 793 tests passing but surfaced its expected experimental-module stderr warning as `NativeCommandError`; the final runner records the actual child exit code. No production fix was made for this shell reporting artifact.

## I. Phase 1 sign-off recommendation

**ACCEPT PHASE 1 WITH LINEUP ISSUES DEFERRED TO PHASE 2**

All four failures reproduce on base production code with identical lineup bodies, so they do not implicate Phase 1. Corrected contract tests retain real behavior/access coverage; the core shared-session integrity handoff remains valid. Defer the existing product limitations below rather than changing the contract to restore opponent athlete IDs. This recommendation accepts Phase 1 only and does not authorize or begin Phase 2.

## PASTE THIS BACK TO THE REVIEWER

- All four original failures reproduce on `e01fe3d18be0c47edc8a56ebcd70d7d83c9a7dec`; original Phase 1 code fails the same assertions with byte-equal lineup bodies. Each is **B. STALE TEST EXPECTATION**.
- Phase 1 changed integrity validation and retry/session attachment, but did not directly or indirectly change the lineup behavior relevant to these assertions. Corrected base/current tests also exercise formerly unreachable start/read branches.
- Flag ON lineup contract: exactly `{available,formation,starters,bench}`, with each player exactly `{name,shirtNumber}`. No team metadata, athlete IDs, positions/slots, tactics, plan/settings, notes, injury data, draft data, confirmation timestamp or private plan IDs.
- Snapshot exists: authoritative membership/start status/formation from event_lineups; names/numbers from current roster; retained at flag-on start and through completion. No snapshot: exact fixture-linked sheet squad fallback, same allowlist, `formation:null`; no qualifying squad means narrow unavailable. Never use an unrelated opponent match.
- Flag OFF retains legacy `{available,teamId,teamName,players}` including athlete IDs/registered position; snapshot branch can include formation assignments/custom positions/confirmation time. Flag-off start deletes the snapshot.
- Phase 1.6 files: `backend/test/friendly-fixtures.e2e-spec.ts`, `backend/test/phase16-lineup-contract.e2e-spec.ts`, `backend/scripts/validate-phase16.mjs`, `docs/phase16-lineup-contract-triage.md`, and `docs/phase16-validation/`; **no production/frontend/migration changes, deployment or commit**. Existing Phase 1.5 evidence and October records remain untouched.
- Final friendly E2E: **17/17 passed**. Corrected four: **4/4 current and 4/4 isolated base**; their event/match lineup reads compare equal. Contract probes: **2/2 passed including cleanup**.
- Focused integrity **18/18**, full units **68 suites / 793 tests**, build/typecheck and changed-file ESLint passed. `git diff --check` and runner syntax check passed. Prior historical E2E (not rerun here): competition 14/14, isolation 5/5, offline 5/5.
- Sign-off: **ACCEPT PHASE 1 WITH LINEUP ISSUES DEFERRED TO PHASE 2**.
- Exact Phase 2 carry-forward: large lineup card/layout; decide whether slot/position detail belongs in the narrow UI contract; define missing-snapshot formation and confirmed-vs-current squad semantics (including implicit whole-active-roster bench); decide whether names/numbers should freeze at confirmation. Separately retain previously identified review-payload/cross-sheet privacy, injury-stream filtering, and invitation-note concerns. No flag-on lineup-response allowlist leak was found; broader privacy remediation was not attempted.

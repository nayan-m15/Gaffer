# Phase 1.5 real-environment validation

Status: core real-HTTP integrity checks passed; broader suite has four retained pre-existing lineup contract assertion failures. No Phase 2 work, deployment, PowerSync change, historical repair, or commit.

## A. Environment

- Host: `ep-royal-star-b253pvlk-pooler.c-6.eu-central-1.aws.neon.tech`
- Database: `neondb`; PostgreSQL 18.6.
- Neon branch: `br-misty-moon-b2be9vmt`; endpoint ID: `ep-royal-star-b253pvlk`.
- Disposable/non-production: explicitly confirmed by the user for this exact branch, with authorization for 0052 and fresh test data only.
- Git branch: `feat/matches-two-sided-live-logging`; SHA: `e01fe3d18be0c47edc8a56ebcd70d7d83c9a7dec`; uncommitted working diff.
- Shared flag: true, except explicitly named feature-off regression cases.
- Effective endpoint/branch checked before migration and each database-backed run; child processes receive pinned test credentials. No credentials are included in the evidence artifacts.

The initial diff contained only the expected Phase 1 changes. Validation adds `backend/scripts/validate-phase15.mjs`, `backend/test/phase15-integrity.e2e-spec.ts`, this report and `docs/phase15-validation/` evidence artifacts.

## B. Migration 0052

Applied with the normal repository migrator (`node scripts/migrate.mjs`), through `node backend/scripts/validate-phase15.mjs migrate`. No schema reset or fake journal insertion was used. Exactly one migration was pending/applied.

- Journal timestamp: `1791062400000`.
- Journal hash: `e5b1128ac824e497d2290403ccac45e7ec686b7f6a72129e39bde6dbec27fd31`, matching the migration reader's hash.
- `attach_match_session_if_safe` exists.
- `refresh_match_projection` contains the insert/update/unchanged-digest session identity maintenance.
- All 39 public tables have identical before/after row counts and row-content digests.
- Public table/column definitions are identical before/after.
- Only the expected journal entry and function changes were introduced.

Full direct PostgreSQL evidence: [migration.json](phase15-validation/migration.json). The October fixture/sheet IDs are absent from this disposable branch; migration performs no bulk backfill. No connection to another branch was used for this validation.

## C. Real HTTP fixture identity

Two independent registered coach accounts used separate authenticated Supertest agents against the real Nest application and PostgreSQL. Accounts/team creation, friendly request/acceptance, competition generation and match starts went through HTTP. Synthetic athletes and the competition participant link/schedule were seeded with SQL, matching the existing repository E2E setup.

### Friendly

Fixture `054d3113-cbba-4dfa-9a76-c0a112315c10`; fixture session `7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc`.

| Coach | Event ID | Match ID | Sheet session at identity check | Side | Diagnostic |
|---|---|---|---|---|---|
| A | `dafaea63-b73f-483f-81c1-cd634ccd5d94` | `9c13d3f2-f351-440d-b33f-c6a5fec4c3e9` | `7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc` | home | correctly_linked / true |
| B | `d35be9ea-4b9b-4f0f-8246-d3a622e2aabe` | `e52a1a8c-4d63-4a19-80f7-363a607a1b8e` | `7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc` | away | correctly_linked / true |

Both SQL owning-sheet links matched the fixture session. Retry returned the same sheet/session IDs; the session count did not increase.

Actual diagnostic response bodies:

```json
{
  "eventId": "dafaea63-b73f-483f-81c1-cd634ccd5d94",
  "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
  "fixtureType": "friendly",
  "fixtureId": "054d3113-cbba-4dfa-9a76-c0a112315c10",
  "fixtureSharedSessionId": "7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc",
  "sharedSessionId": "7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc",
  "owningMatchId": "9c13d3f2-f351-440d-b33f-c6a5fec4c3e9",
  "owningMatchSharedSessionId": "7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc",
  "participantTeamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
  "participantSide": "home",
  "expectedSessionId": "7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc",
  "sheetSessionMatchesFixture": true,
  "status": "correctly_linked",
  "participants": [
    {
      "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
      "side": "home"
    },
    {
      "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
      "side": "away"
    }
  ],
  "matchSheets": [
    {
      "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
      "side": "home",
      "matchId": "9c13d3f2-f351-440d-b33f-c6a5fec4c3e9"
    },
    {
      "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
      "side": "away",
      "matchId": "e52a1a8c-4d63-4a19-80f7-363a607a1b8e"
    }
  ]
}
```

```json
{
  "eventId": "d35be9ea-4b9b-4f0f-8246-d3a622e2aabe",
  "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
  "fixtureType": "friendly",
  "fixtureId": "054d3113-cbba-4dfa-9a76-c0a112315c10",
  "fixtureSharedSessionId": "7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc",
  "sharedSessionId": "7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc",
  "owningMatchId": "e52a1a8c-4d63-4a19-80f7-363a607a1b8e",
  "owningMatchSharedSessionId": "7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc",
  "participantTeamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
  "participantSide": "away",
  "expectedSessionId": "7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc",
  "sheetSessionMatchesFixture": true,
  "status": "correctly_linked",
  "participants": [
    {
      "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
      "side": "home"
    },
    {
      "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
      "side": "away"
    }
  ],
  "matchSheets": [
    {
      "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
      "side": "home",
      "matchId": "9c13d3f2-f351-440d-b33f-c6a5fec4c3e9"
    },
    {
      "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
      "side": "away",
      "matchId": "e52a1a8c-4d63-4a19-80f7-363a607a1b8e"
    }
  ]
}
```

### Competition

Fixture `926c361b-3030-47de-9a7f-f668b633d5b8`; fixture session `bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb`.

| Coach | Event ID | Match ID | Sheet session at identity check | Side | Diagnostic |
|---|---|---|---|---|---|
| A | `b07545af-1e08-4327-b48f-1a5c3d522a45` | `4cc75dea-3fe9-4f1b-9703-161577d6c4a2` | `bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb` | home | correctly_linked / true |
| B | `fe225366-d9dd-4e51-b654-82ff989878a5` | `3fdc506c-eacb-4646-8e9d-3f7c47494c0d` | `bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb` | away | correctly_linked / true |

Both SQL owning-sheet links matched the fixture session. Retry returned the same sheet/session IDs; the session count did not increase.

Actual diagnostic response bodies:

```json
{
  "eventId": "b07545af-1e08-4327-b48f-1a5c3d522a45",
  "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
  "fixtureType": "competition",
  "fixtureId": "926c361b-3030-47de-9a7f-f668b633d5b8",
  "fixtureSharedSessionId": "bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb",
  "sharedSessionId": "bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb",
  "owningMatchId": "4cc75dea-3fe9-4f1b-9703-161577d6c4a2",
  "owningMatchSharedSessionId": "bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb",
  "participantTeamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
  "participantSide": "home",
  "expectedSessionId": "bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb",
  "sheetSessionMatchesFixture": true,
  "status": "correctly_linked",
  "participants": [
    {
      "side": "home",
      "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851"
    },
    {
      "side": "away",
      "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2"
    }
  ],
  "matchSheets": [
    {
      "side": "home",
      "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
      "matchId": "4cc75dea-3fe9-4f1b-9703-161577d6c4a2"
    },
    {
      "side": "away",
      "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
      "matchId": "3fdc506c-eacb-4646-8e9d-3f7c47494c0d"
    }
  ]
}
```

```json
{
  "eventId": "fe225366-d9dd-4e51-b654-82ff989878a5",
  "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
  "fixtureType": "competition",
  "fixtureId": "926c361b-3030-47de-9a7f-f668b633d5b8",
  "fixtureSharedSessionId": "bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb",
  "sharedSessionId": "bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb",
  "owningMatchId": "3fdc506c-eacb-4646-8e9d-3f7c47494c0d",
  "owningMatchSharedSessionId": "bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb",
  "participantTeamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
  "participantSide": "away",
  "expectedSessionId": "bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb",
  "sheetSessionMatchesFixture": true,
  "status": "correctly_linked",
  "participants": [
    {
      "side": "home",
      "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851"
    },
    {
      "side": "away",
      "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2"
    }
  ],
  "matchSheets": [
    {
      "side": "home",
      "teamId": "a43d597a-ee77-47bd-a1c0-daa8d192a851",
      "matchId": "4cc75dea-3fe9-4f1b-9703-161577d6c4a2"
    },
    {
      "side": "away",
      "teamId": "bc9dbd11-b616-4899-a8a7-16f5411ddac2",
      "matchId": "3fdc506c-eacb-4646-8e9d-3f7c47494c0d"
    }
  ]
}
```

The competition A sheet above was deliberately nulled **after** these identity/diagnostic checks for the guard test below. It remains NULL as fresh negative-test evidence; the four captured diagnostic responses describe their state before fault injection. This is not an automatic repair of historical data. Full actual start/retry bodies are in [http-evidence.json](phase15-validation/http-evidence.json).

## D. Existing-sheet HTTP attachment

Safe sheet `9c13d3f2-f351-440d-b33f-c6a5fec4c3e9`: before retry, session link NULL and stored home side deliberately false. HTTP start retained that ID, attached the existing fixture session, normalized home side to true, and diagnostic returned correctly_linked. Final read-only SQL confirms zero observations, canonical events, operations, reviews, clock operations and projection rows for that safe sheet.

Evidence sheet `313636be-fbf6-4816-a349-eefbc98adc20`: a real flag-off HTTP log created legacy evidence on the deliberately null-linked sheet. Enabled HTTP start returned 409 / SHARED_MATCH_RECONCILIATION_REQUIRED. The owning link stayed NULL and every observation row was byte-for-byte unchanged in the SQL before/after comparison. Nothing was moved or deleted.

## E. HTTP ingestion guard

Direct `POST /matches/:id/events`: 409 / `SHARED_MATCH_SESSION_REQUIRED`. SQL counts remained observations=0, canonical events=0, reviews=0. The same sheet through `POST /sync/upload` returned HTTP 201 with a rejected receipt; the batch transport's successful status does not mean the observation was accepted.

Actual receipt response body:

```json
{
  "receipts": [
    {
      "id": "f3d6f43a-72af-4661-8b37-23a8ad19c1aa",
      "submittedByUserId": "zkQzvNkDb4GigdmwPIiQpim2kTfI454E",
      "matchId": "4cc75dea-3fe9-4f1b-9703-161577d6c4a2",
      "itemType": "observation",
      "payloadHash": "c803261e6968879c9d20b8b5ca0746534a2943c17f519fa4e0d226e2a0ad4611",
      "outcome": "rejected",
      "safeErrorCode": "SHARED_MATCH_SESSION_REQUIRED",
      "processingDurationMs": 1712,
      "canonicalEventId": null,
      "createdAt": "2026-10-04T21:50:07.872Z",
      "updatedAt": "2026-10-04T21:50:07.872Z"
    }
  ]
}
```

## F. Publication guard

`POST /matches/:id/finish` and schema-valid `POST /matches/:id/finalise` returned 409 / `SHARED_MATCH_SESSION_REQUIRED`. The direct internal `syncFixtureResult` legacy source was rejected with the same 409, with flag both true and false. Flag-off HTTP finalisation also rejected it. No private projection finalisation or competition publication occurred.

| State | Before | After |
|---|---|---|
| Fixture status | scheduled | scheduled |
| linked_match_id | NULL | NULL |
| home_score / away_score | NULL / NULL | NULL / NULL |
| Session home/away confirmations | NULL / NULL | NULL / NULL |
| Session finalised_at | NULL | NULL |
| Competition results | 0 | 0 |

Full fixture and session objects, including timestamps, compared equal before/after. The result endpoint used is `GET /competitions/:competitionId`, whose response contains `results` and `standings`. Full SQL snapshots are retained under `invalidPublication` in the response artifact.

## G. Valid bilateral 2?1 result

Fresh fixture `22ec6fca-85de-486d-b233-ba370a05f5ec` in competition `37df2587-a709-49cb-990b-7b3762ed9da2`. Home sheet `10e0721d-e7a1-4cf9-98d2-0bb95df7b0c4` and away sheet `fe33cf3d-8315-451e-9ad0-843c12681271` share session `c17f12e1-6b0d-4893-99fc-bc66a303130c`. Home coach logged two own goals (minutes 5 and 25); away coach logged one own goal (minute 55). Both finished and confirmed through HTTP.

- Home confirmation: `2026-10-04T21:50:56.762Z`.
- Away confirmation: `2026-10-04T21:51:03.261Z`.
- Session finalised_at: `2026-10-04T21:51:03.261Z`.
- Canonical report: score home=2 / away=1; finalStatus=finalised; no reviews.
- Fixture: completed, home_score=2 / away_score=1, linked_match_id=`fe33cf3d-8315-451e-9ad0-843c12681271`.
- Results API: exactly one result for that fixture.
- Standings: both played=1, home GF/GA=2/1 with 3 points; away GF/GA=1/2 with 0 points.
- Legacy/private finalisation attempts from both sheets with the flag off returned 409; the fixture stayed exactly unchanged.

## H. Projection session identity on PostgreSQL

| Branch | Match | session_id | Revision |
|---|---|---|---|
| INSERT | `83b9f3f2-c8dc-492a-b795-d9cebeac10e4` | `2e20a46b-0525-4d6a-85ab-483b3039ce67` | 1 |
| Unchanged-digest refresh | `83b9f3f2-c8dc-492a-b795-d9cebeac10e4` | `2e20a46b-0525-4d6a-85ab-483b3039ce67` | 1 |
| Changed-digest branch | `83b9f3f2-c8dc-492a-b795-d9cebeac10e4` | `2e20a46b-0525-4d6a-85ab-483b3039ce67` | 2 |
| Genuine legacy | `1e4d5926-43eb-456b-a7a3-5f3a3d2c05fe` | NULL | 1 |

The unchanged-digest case cleared only the fresh test projection's session field and refreshed through HTTP: identity was restored without a revision increment. The changed-digest case deliberately forced a stored digest mismatch and cleared that fresh session field: the UPDATE branch restored identity and incremented revision. No historical projections were touched. Feature-off manual/free-text ingestion and a non-generated legacy competition's manual 1?0 publication both passed.

No October fixture/sheet IDs were present before or after migration. All pre-existing public rows were unchanged during migration, so there was no bulk backfill. The final [read-only readback](phase15-validation/final-readback.json) confirms those IDs remain absent. No other branch was queried or mutated during validation.

## I. Automated checks

- Full backend units: 68 suites / 793 tests passed. Initial run 56.286 seconds; final run 60.968 seconds, recorded in `phase15-validation/final-unit.log`. Command from backend: `npm.cmd test -- --runInBand`.
- Focused Phase 1 units: final run 18 passed, 9.004 seconds (earlier run 8.1 seconds). Command: `npm.cmd test -- --runInBand src/matches/shared-session-integrity.spec.ts`.
- Backend build/typecheck: `npm.cmd run build`, passed.
- Changed TypeScript ESLint (all nine changed TypeScript files), runner syntax check and `git diff --check`: passed.
- Focused real-HTTP integrity suite: 4/4 passed in 171.481 seconds (172.261 seconds including guarded startup); first attempt 2 passed / 2 test-input failures, retained separately.
- Real HTTP suites: completed serially with `node node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand` and the four requested suite paths. No experimental VM-module flag is used for HTTP E2E. Result: 3 suites passed, friendly suite failed; 37 cases passed / 4 assertion failures, 722.929 seconds (723.574 seconds including guarded process startup). Competitions 14/14, offline sync 5/5, team isolation 5/5, friendly 13/17. No DB/network failures were reported and no rerun was performed.

## J. Failures / surprising behavior

The friendly suite reports four assertion failures: older lineup expectations include `teamId`, `teamName` and `players`; the feature-enabled response uses `available`, `formation`, `starters` and `bench`. `FriendlyFixturesService` is unchanged by Phase 1 and contains that flag-dependent contract in the base code. These failures are preserved, not retried or corrected by changing privacy behavior.

A sandbox child-process restriction initially blocked the guarded runner before any database mutation. Escalated execution resolved that process/spawn limitation. A preflight parser error involving a stripped leading git-status space was corrected before migration; it did not mutate the database.

The first focused HTTP attempt had 2 passes and 2 assertion failures (153.533 seconds). Both failures were test-input mistakes: finalisation requests sent revision 0, which the HTTP schema rejects with 400 because its minimum is 1. This did not demonstrate a product integrity failure. The payloads were corrected to revision 1, and one fresh-data corrected attempt passed all four cases in 171.481 seconds. The first log and response evidence are retained as `phase15.log` and `http-evidence-first-attempt.json`; the corrected run has separate log/process evidence. The broad suite's four lineup assertion failures were not rerun.

The final SQL readback also shows the existing per-sheet lifecycle: the home projection remains open while the terminal-confirming away projection is finalised; the shared session and published fixture are finalised. No per-sheet lifecycle redesign was performed.

## K. Remaining uncertainty

The corrected focused HTTP run passed 4/4 (171.481 seconds); the broad suite remains 37 passed / 4 assertion failures. The October records are absent from the only authorized branch, so their current values on another branch were not independently reread. This validation did not connect to or mutate that other branch. Existing privacy/lineup contract failures remain outside Phase 1.5 scope.

## PASTE THIS BACK TO THE REVIEWER

- Isolated disposable DB: `br-misty-moon-b2be9vmt`, host `ep-royal-star-b253pvlk-pooler.c-6.eu-central-1.aws.neon.tech`, database `neondb`. Effective endpoint never changed.
- Migration `0052_shared_session_integrity`: applied through the normal repository migrator; journal hash/timestamp and both functions verified; all pre-existing public rows/columns unchanged during migration.
- Friendly coach A sheet `9c13d3f2-f351-440d-b33f-c6a5fec4c3e9`, coach B sheet `e52a1a8c-4d63-4a19-80f7-363a607a1b8e`; shared fixture/session `7dc8eae6-3f02-4ae5-8a7b-78213a4d45fc`.
- Competition coach A sheet `4cc75dea-3fe9-4f1b-9703-161577d6c4a2`, coach B sheet `3fdc506c-eacb-4646-8e9d-3f7c47494c0d`; shared fixture/session `bf97c64d-4c28-4be3-a8f8-8f260b6fb7bb`.
- All four fresh diagnostics were `correctly_linked`, `sheetSessionMatchesFixture=true` at identity capture. Competition A was subsequently deliberately NULL-linked for negative tests and is retained in that state.
- Null-linked start with legacy evidence: HTTP 409 / `SHARED_MATCH_RECONCILIATION_REQUIRED`. Null-linked ingestion/finish/finalise: HTTP 409 / `SHARED_MATCH_SESSION_REQUIRED`.
- `/sync/upload`: HTTP 201 batch response containing one rejected observation receipt / `SHARED_MATCH_SESSION_REQUIRED`; no observation, canonical event or review inserted.
- Invalid publication: HTTP and direct legacy publisher rejected; fixture/session before and after identical, scores/link NULL, result count 0; flag-off defense passed.
- Fresh valid bilateral fixture: both confirmations, finalised shared session, exactly one 2?1 home/away fixture/API result, standings played once per team; private flag-off publication attempts blocked.
- Projection `session_id`: real PostgreSQL INSERT, unchanged-digest refresh and changed-digest UPDATE all maintained the owning session; genuine legacy remained NULL; migration performed no historical bulk backfill.
- Real HTTP: competitions 14/14, offline 5/5, isolation 5/5; friendly 13/17 with four retained lineup-contract assertion failures. Focused Phase 1.5 corrected run 4/4; its initial test-input failures remain recorded. No actual DB/network failure reported.
- Backend units: 68 suites / 793 tests pass; focused Phase 1 18/18; build/typecheck, changed-file ESLint and diff check pass.
- October records untouched: absent from the only authorized branch before/after; no other branch was queried or mutated. Their live values elsewhere were not independently reread.
- Recommend Phase 2: **not yet an unconditional sign-off**. Core Phase 1 integrity is proven on real HTTP/PostgreSQL; reviewer should resolve or explicitly accept the four remaining lineup-contract test failures before proceeding. No Phase 2 work started.


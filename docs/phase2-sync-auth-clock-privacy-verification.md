# Phase 2 verification — 5 October 2026

Status: backend privacy and clock fixes verified; **real PowerSync two-client acceptance remains blocked**. Working changes are uncommitted on `feat/matches-two-sided-live-logging`, based on `549f4808`. The three Phase 1 handoffs were read before investigation. No lineup/layout work was undertaken.

## A. PowerSync authentication diagnosis

`GET /sync/token` authenticates the coach through Better Auth and resolves current team membership through `TeamsService.findTeamForUser`. It signs a five-minute JWT using `POWERSYNC_PRIVATE_KEY` with RS256 when present, otherwise `POWERSYNC_SHARED_SECRET` with HS256. `POWERSYNC_KID` supplies the header key ID. Audience is `POWERSYNC_URL`; no issuer is emitted. Claims are `sub`, `user_id`, `team_id`, `team_role`, `two_sided_live_logging` (string), `aud`, `iat`, and `exp`.

Both independently authenticated fresh coaches emitted `{alg:"HS256",kid:"gaffer-dev",typ:"JWT"}`. Actual claims and Cloud responses are retained in [http-evidence.json](phase2-validation/http-evidence.json), under `auth`. Full JWTs, signatures, cookies, Authorization headers and signing secrets are excluded from evidence.

The repository template specifies `https://gaffer-api-ynaf.onrender.com/sync/jwks`. That public endpoint returned HTTP 200 and only `{kid:"gaffer-production-1",alg:"RS256",kty:"RSA",use:"sig"}`. Local configuration has no RSA private key. [auth-key-diagnosis.json](phase2-validation/auth-key-diagnosis.json) records safe key metadata and a public-key fingerprint.

## B. PSYNC_S2101 root cause

**Reproduced against the actual configured PowerSync endpoint for both fresh coach tokens:** HTTP 401 / `PSYNC_S2101`, “Could not find an appropriate key in the keystore. The key is missing or no key matched the token KID”. Its keystore cannot verify the locally issued `gaffer-dev` HS256 token. The repository JWKS source publishes a different RSA key, confirming local/deployed key-source incompatibility.

The Cloud management configuration was not accessible: no management credential was available and browser bootstrap failed with missing sandbox metadata. The deployed JWKS URI, full keystore, issuer restrictions, replication source and current deployed stream version are **unverified**. Repository configuration is not deployment proof. Audience validation cannot be declared successful because key selection fails first. No evidence establishes key rotation as the cause; the code exposes one active RSA key and has no rotation-overlap mechanism. The current error matches the historical error, but the historical environment itself was not recaptured.

## C. Auth/config changes

Signing and verification were left intact. No secret was changed, copied into source, or published. Aligning the local signer with a trusted development keystore requires external configuration; changing only `kid` would not fix an algorithm/key mismatch.

Added coverage for HS256 header/KID and claims, five-minute TTL, feature-flag claims, team role, RSA preference when both key types are configured, RSA signature verification against the controller's JWKS, and null membership claims. New safe diagnosis and branch-pinned validation scripts retain reviewable evidence.

## D. Shared stream audit

Every shared stream now requires the feature flag, session participation for the token team, and a **live** `team_members` row for the token user. Third teams select zero shared rows; revoked members select zero shared and private rows using old claims. These were tested with real SQL; Cloud bucket removal remains untested.

| Stream | Source / session key | Selected side / exposed field groups |
|---|---|---|
| `shared_session_match_events` | `match_events.session_id` | Peer canonical event metadata and attribution label; no athlete/player IDs; detail is NULL; injuries excluded |
| `shared_session_match_observations` | `match_event_observations.session_id` | Peer event, side, actor and timing metadata; no raw payload, device ID or athlete/player IDs; injuries excluded |
| `shared_session_match_memberships` | `observation_id` → observation `session_id` | Peer observation-to-canonical mapping, revision and creation time; flag and injury filters added |
| `shared_session_match_reviews` | `match_event_reviews.session_id` | Peer review/candidate IDs, observation IDs, reason, status, resolution, resolver/dispute actor and timestamps; injury canonical events excluded |
| `shared_session_match_operations` | `match_event_operations.session_id` | Peer merge/separate decisions and shared causal/event IDs; private corrections excluded; free-text reason NULL; injury canonical events excluded |
| `shared_session_match_projections` | `match_projection_state.session_id` | Peer revision/digest/rules, reversed score columns, aggregate possible effects/card counts, review count and finalisation metadata |
| `shared_session_match_clock_operations` | `match_clock_operations.session_id` | Peer sheet/session identity, actor, period/elapsed/running, revisions, outcome/hash and timestamps |
| `shared_session_report_state` | `match_sessions.id` | Both sides' confirmation/finalisation timestamps |
| `shared_session_report_sheets` | `matches.shared_match_id` | Both sheet IDs and clock anchors/revisions; no private game plan |
| `shared_session_report_fixture_scores` | `competition_fixtures.shared_session_id` | Competition fixture ID, scores and status; no friendly row is expected |

The exact exposed fields, full source queries, session keys, authorization filters, feature condition and own/peer selection for **each** stream are in [shared-stream-audit.json](phase2-validation/shared-stream-audit.json). Own rows use `team_*` streams; the first seven shared streams select opposite sheets. Report streams select both sides.

The missing membership-stream flag was inconsistent with the other shared streams and was fixed. All 13 private streams also gained live membership checks: stale claims previously permitted continued private delivery. Every repository query was executed with actual PostgreSQL-compatible SQL in PGlite, and all 23 queries were executed on real PostgreSQL after revocation. Positive selections for both retained fresh fixture types are recorded in [selected-rows.json](phase2-validation/selected-rows.json). This is supplemental SQL evidence, **not client receipt or Cloud parser/deployment validation**.

## E. Privacy findings and fixes

- Peer review observations previously retained nested raw payload IDs/details. They now use an explicit metadata allowlist, with athlete/player IDs, payload, hash and detail null; device IDs are omitted. Ownership is determined from the requesting team's sheets, including when the URL addresses the peer sheet.
- Peer events now exclude injuries and null athlete/player objects, IDs and detail. Owner event reads retain their private data. Shared event detail is also NULL.
- Shared reports exclude injury timeline entries and injury canonical reviews. Shared observations, memberships, reviews and decisions filter injury events. Private originating-side event streams remain available to their own current members.
- Peer HTTP event-operation reads now select merge/separate decisions only and remove free-text reason, closing another route to private correction payloads. Shared operation reasons are NULL.
- `events.notes` is the calendar's general “Optional session notes” field, not a classified invitation message. Incoming invitations now return `notes:null`; acceptance no longer copies the requester's notes. The origin retains its notes. No invitation-message feature was added.

No tactics, game-plan settings, injury detail, opposing athlete IDs or private notes were added to a shared projection. Existing player name/shirt-number labels and shared actor/event/review identifiers remain part of the shared contract.

## F. Clock 500 diagnosis

For both coaches on both fresh fixture types, start, pause, resume, half-time, second-half, full-time, stale-base updates and exact retries returned HTTP 200. Forty-eight requests record method/path, status, safe clock body, sheet side, match/session ID, operation ID, revision and outcome in `friendlyClock` / `competitionClock` in the HTTP evidence. Exact retries create one ledger row per operation.

A fresh conflicting operation-ID reuse **did** return 500. Its retained backend exception is PostgreSQL `22000`, raised by `apply_match_clock_operation`: `clock operation id reused with different data`. [e2e-first-attempt.log](phase2-validation/e2e-first-attempt.log) retains the matching stack; the initial response is in [http-evidence-first-attempt.json](phase2-validation/http-evidence-first-attempt.json).

The service now maps exactly that proven exception to HTTP 409 / `MATCH_CLOCK_OPERATION_ID_REUSED`; unrelated exceptions still propagate. PGlite and real PostgreSQL/HTTP regressions pass. Four simultaneous clock updates across both sheets returned 200 with linked immutable operation IDs/revisions: [concurrency-http-evidence.json](phase2-validation/concurrency-http-evidence.json). Stale revisions retain the intentional `applied_after_stale_base` behavior.

The historical valid-browser-request 500's exact cause is **unknown** without its original backend stack. The reproduced ID conflict is not presented as proof of that historical cause. No valid linked clock request in these fresh runs produced an unexplained 500.

## G–H. Friendly and competition two-client results

Both fixture types passed real PostgreSQL plus independent authenticated HTTP-agent checks: distinct sheets, same fixture/session, correctly-linked diagnostics, canonical events, clock ledger, shared report, peer events and reviews. Exact fixture/sheet/session IDs are in the `friendly` and `competition` evidence objects.

**Neither real two-browser sync acceptance test is complete.** Tokens are rejected by Cloud; the repository replication template points at the development branch while validation deliberately uses the disposable branch. No actual local synced-row receipt, rendered browser update or deployed-stream selection was proven. HTTP reads and SQL selections are not substituted for those proofs.

## I. Duplicate review

Both fixture types passed HTTP creation of an own goal and peer opponent-goal observation for the same actual side/period within the matcher window. Distinct internal athlete and opponent-player IDs did not prevent a candidate. Both coaches read the same candidate, one resolved it, the other read the resolved decision and disputed it. Stored/shared identity and sanitized peer observations were checked. Actual PowerSync delivery of candidates/decisions remains blocked.

## J. Revocation / third team

Unrelated authenticated teams receive 404 on peer event and session-report HTTP endpoints. SQL authorization tests select zero shared rows for third-team claims. Removing a fresh coach's membership leaves their authentication session intact but protected shared/private HTTP reads return 403; **all 23 queries return zero rows with previously issued claims**. [revocation-http-evidence.json](phase2-validation/revocation-http-evidence.json) retains the result.

Repository predicates require no token refresh to enforce membership removal once deployed and replication has processed it. Actual Cloud access cessation was not tested because the token was already rejected. Cache behavior was inspected in `AuthContext.tsx` and `offline/match-store.ts`: databases are scoped by user/deployment; logout clears React Query/session state and disconnects/closes the old database, but does not erase its stored cache. Remembered sessions can restore cached team state offline. Already downloaded data is not remotely erased while disconnected; same-user revocation is not a tested local-cache purge. Cloud bucket deletion, UI refresh and the intended retained-cache policy require the real-client follow-up.

## K. Offline replay

The existing real HTTP offline suite passes 5/5, including immutable ledger/idempotency/concurrent ingestion checks. It does **not** prove warm-client offline/reconnect PowerSync delivery. The requested real-client replay was not attempted before online authentication succeeds. No mock is used as acceptance proof.

## L. Tests / builds and environment failures

| Check | Final result |
|---|---|
| Focused auth/privacy/clock/integrity | 5 suites, 61 tests passed |
| Full backend units | 69 suites, **824/824** passed; child exit 0 |
| Original Phase 1 integrity | 18/18 included and green |
| Phase 2 real HTTP | 4/4 passed; separate revocation 1/1 and concurrency 1/1 passed |
| Friendly HTTP regressions | 17/17 passed in broad run |
| Team isolation HTTP regressions | 5/5 passed in broad run |
| Competition HTTP regressions | 14/14 passed after restoring missing 0052 |
| Offline HTTP regressions | 5/5 passed after connection recovery |
| Backend build/typecheck | Passed |
| Backend full TypeScript lint | Passed; final added E2E file also checked |
| Frontend tests | 51/51 passed |
| Frontend lint | Passed with existing warnings |
| Frontend build/typecheck | Failed in unchanged `gaffer-stadium.ts` / `landing-scene.ts` (unused symbols, Three.js types and missing properties) |
| Scripts / whitespace | Syntax checked; `git diff --check` passed |

Commands and exit codes are retained in `phase2-validation/*-process.json`, with logs beside them. The first broad run had 36 passed / 5 failed: two competition failures stemmed from absent 0052 and the dependent report setup; three offline failures had database `ECONNRESET`/timeouts and anomalously long elapsed timing. Its log is retained. Corrected competition and offline runs were separate, justified retries, not hidden product failures.

Current branch identity was verified before every database-backed runner. Although the handoff recorded 0052 applied previously, read-only diagnosis proved its function and journal entry currently absent on that exact disposable branch. Only that existing migration was applied through the normal migrator; its journal hash/timestamp and function were verified afterward. [database-before-migration.json](phase2-validation/database-before-migration.json), [database-diagnosis.json](phase2-validation/database-diagnosis.json), and migration log retain the evidence. No new migration was authored. Only four named fresh Phase 2 projections were subsequently refreshed for supplemental selection evidence. No October forensic fixture was repaired and no other database branch was mutated.

Sandbox child-process restrictions initially returned EPERM; guarded escalated runners resolved that. A direct PowerShell-redirection unit run reported a shell exit artifact despite all tests passing; final runner records actual child exit 0. An initial lint-runner scope incorrectly included Babel CJS; it was corrected to the package's TypeScript scope. Neither is a product failure.

## M. Remaining external/manual actions

1. Inspect the actual Cloud JWKS/key source, algorithm/KID, audience/issuer policy, source branch and deployed stream configuration.
2. Configure an isolated validation PowerSync instance against the disposable branch, using a trusted dedicated development signer/JWKS (or a securely configured matching development HS256 keystore). Keep verification and KID checks intact; never expose a symmetric key through public JWKS. Update backend endpoint/key settings to match it through secret configuration.
3. Deploy/validate the revised stream configuration, including live-membership predicates on private streams. Confirm publication/replication covers all source tables.
4. Re-run both fresh fixture flows in independent browser contexts, capturing upload, canonical row, Cloud selection, local synced row and rendered UI. Then verify review delivery, revocation with an already-issued accepted token, bucket/cache behavior and real offline replay.
5. Resolve the unrelated existing frontend landing-scene type errors before a full frontend build can pass.

## N. UI-phase recommendation

**Do not sign off Phase 2 or begin the lineup/layout phase yet.** Backend fixes and HTTP behavior are ready for review; real authenticated PowerSync delivery remains the acceptance blocker. No deployment or commit was made.

## PASTE THIS BACK TO THE REVIEWER

- Local token: HS256 / `gaffer-dev`; deployed public JWKS: RS256 / `gaffer-production-1`. Both fresh coaches reproduce real HTTP 401 / `PSYNC_S2101`. Authentication is not fixed; actual Cloud config/source deployment is unverified.
- Valid linked clocks pass transitions, exact retries and concurrent requests. Proven conflicting ID reuse raised SQL `22000` / HTTP 500; now HTTP 409 / `MATCH_CLOCK_OPERATION_ID_REUSED`. Historical clock root cause remains unknown.
- Friendly and competition: real PostgreSQL/HTTP linked-session, events, clocks, report and review checks pass. Real two-browser PowerSync receipt/rendering remains unproven.
- Duplicate candidate/resolution/dispute works through HTTP for both fixture types despite different internal player IDs; Cloud decision delivery is blocked.
- Privacy fixes: peer review allowlist, peer event/operation sanitization, injury exclusions, private friendly notes, missing shared-membership flag and live membership on private streams.
- Revoked coach loses HTTP access; all 23 stream SQL queries select zero rows using old claims. Cloud removal/cached-client behavior is not verified; existing offline caches persist by user scope.
- Offline HTTP 5/5 passes; actual PowerSync offline replay is blocked by online auth.
- Units 824/824; focused 61/61; Phase 1 integrity 18/18; Phase 2 HTTP 4/4 plus revocation/concurrency; final requested HTTP suites total 41/41 across retained broad passes and justified targeted reruns. Frontend tests 51/51; backend build/lint and diff check pass. Frontend build fails in unchanged landing-scene files.
- Existing 0052 was unexpectedly absent on the pinned disposable branch; restored through the normal migrator and verified. October forensic records untouched; no other branch mutation, UI work, deployment or commit.
- Blockers: Cloud key alignment/configuration access, correct validation replication source, revised stream deployment, actual browser sync/revocation/offline proof and unrelated frontend build errors.

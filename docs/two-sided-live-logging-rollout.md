# Two-sided live logging rollout

Current work is described in [the implementation plan](two-sided-live-logging-plan.md). These notes cover deployment and rollback. Documentation cleanup does not establish that the application fixes have shipped or passed manual testing.

## Current readiness

The 6 October event search/map/pitch follow-up adds public formation geometry
to shared reports and fixes badge attribution and responsive pitch dimensions.
Deploy both apps together for that response contract; this follow-up needs no
additional migration or sync-rule deployment. Existing prerequisites below
still apply. See [the regression follow-up](live-logger-regression-2026-10-06.md#event-search-map-and-pitch-follow-up-6-october)
for verification and limits.

6 October regression work supersedes the older readiness notes below. The
development database has the shared-clock function from `0054`, but today's
paired sheets include mixed shared/legacy identities. Setup now displays and
locks the fixture-assigned side, linked snapshots survive kickoff, stale polls
cannot overwrite acknowledged clocks, and a disabled server rejects writes to
an already enrolled shared fixture. Local rules also remove the current bucket
overflow using the trigger-maintained privacy gate in new migration `0055`.
Apply `0055` to the verified target before deploying the backend or updated
PowerSync rules, deploy both apps, and align both coaches' API flags/credentials.
After the user's migration retry, `0055` is installed on the configured development
database. The runner now skips exact recorded SQL whose journal timestamp moved
after merging; historical records are preserved. Hosted target migration status
must be verified independently. PowerSync rules and application deployments have
not been performed in this assessment. Today's recorded unlinked history needs separate reviewed
reconciliation. See [the regression assessment](live-logger-regression-2026-10-06.md)
for evidence, exact local checks and deployment limitations.

Subsequent historical repair: all five affected fixture pairs now share the correct session/sides and the actual report service returns identical scores/timelines/clocks for both coaches. Competition results remain 1-0, 3-3, 2-1 and 0-3; friendly is 1-1. All observations are retained. Obsolete confirmations were cleared, so both coaches must reconfirm. Historical session-conflict/null-sheet findings are now zero. Journal review is complete without replaying migrations or modifying the journal; two hashes remain without Git provenance. See [the applied repair](two-sided-test-data-repair.md#applied-historical-reconciliation-5-october-subsequent-to-the-assessment-below). The user retains UI retesting and Render/Vercel deployment. Earlier assessment/readiness paragraphs below are historical.

Latest historical assessment after `67a301f3`: the three conflicting fixtures and both null-linked sheets all contain completed recorded games. None qualifies for safe empty-sheet attachment. Exact evidence and the outstanding result/goal decisions are in [the repair assessment](two-sided-test-data-repair.md#exact-record-reconciliation-assessment-5-october-after-67a301f3). No historical writes occurred; reconciliation awaits the user's outcome selection. The release audit still fails for historical findings and journal drift, while 0052/0053 function bodies and publication/grants pass.

## User deployment and testing handoff

Logger clock correction (5 October): apply `0054_shared_session_clock.sql` through the normal migration process before using the updated logger. It serializes clock operations by shared session, updates both linked sheets with one elapsed-time anchor and revision, and reconciles older divergent per-sheet clocks on the next operation. The frontend observes the actual clock fields, rebases a running timer on remote changes, and removes the duplicate shared-result panel from the logger. Shared report polling remains at one second; the private sheet polls every ten seconds, and independent report reads execute concurrently. This migration has been tested against an isolated PGlite database; it has not been applied to the shared development or hosted databases. Browser regression covers unchanged sheet timestamps, halftime, second half, running corrections, score refresh and full-time reload persistence. The real paired-account interaction suite now also asserts home halftime followed by away second-half kickoff.

1. Test locally using two independent coach browser profiles and fresh fixtures, with the root backend `TWO_SIDED_LIVE_LOGGING_ENABLED=true`. Run `npm.cmd run dev` from the root. The configured local API must write to the same blue-hill source used by Development PowerSync. Existing broken historical fixtures are unsuitable as fresh feature acceptance tests.
2. On the **Render backend service**, set `TWO_SIDED_LIVE_LOGGING_ENABLED=true` and deploy the reviewed branch/revision. Keep the hosted RSA signer/JWKS, `POWERSYNC_KID` and `POWERSYNC_URL` aligned with the existing trusted hosted configuration. Do not copy the local validation private key into Render. This setting is a backend runtime variable; no frontend two-sided flag is required.
3. Deploy the frontend code through its existing Vercel hosting process. Production uses same-origin `/api` and `/auth` rewrites to Render from `frontend/vercel.json` (and the root Vercel configuration); `VITE_API_URL` only affects development. Keep those rewrites pointed at the intended backend. Refresh both coaches' authentication/sync credentials after deployment and verify the `GET /sync/token` response (production frontend: `/api/sync/token`) has a token with `two_sided_live_logging: "true"`, with the expected RS256 signer and PowerSync audience. Decode only locally; do not paste credentials into tickets.
4. 0052/0053 and sync-rule revision 16 are already installed on the audited blue-hill/Development target. Reaudit if Render uses a different database/instance. Do not rerun the one-shot deployment helper or blindly replay old migrations to clear journal drift; its historical entries need separate schema/journal review.
5. Run the [short manual test](two-sided-live-logging-plan.md#short-manual-test) locally and after deployment: accepted friendly and generated competition; confirmed lineup/bench privacy; distinct and duplicate goals; alternating pause/resume; warmed-client disconnect/reconnect; both confirmation orders; reload persistence; one competition result per fixture; outsider denial. Include mobile at 390px and a short desktop viewport. Specifically retest **Same event** leaving a queued resolution, peer resume staying paused and competition away-first final report rendering: these remain documented unresolved UI checks despite passing transport tests.
6. For automated API/browser regression, use the separate dedicated test database exclusively, build both applications, then run the paired suite with `TWO_SIDED_LIVE_LOGGING_ENABLED=true` and `UI_TEST_PRODUCTION=true`: `node scripts/run-ui-tests.mjs two-sided-release --project=chromium`. Enable `TWO_SIDED_UI_INTERACTIONS=true` for the documented interaction scenarios. Do not run reset-based integration jobs concurrently. This suite does not replace deployed PowerSync/manual evidence.

Historical reconciliation has subsequently been applied as recorded above. UI regression retesting and deployment remain with the user; reconfirm repaired historical games from both coach accounts after deployment. Journal drift is reviewed and preserved, so the overall release audit remains nonzero.

Checks rerun after this historical assessment: `npm.cmd --prefix backend run build` and `npm.cmd --prefix frontend run build` passed (frontend retains its chunk-size warning); `npm.cmd --prefix backend run test -- --runInBand shared-session-integrity shared-session-privacy session-finalisation sync.controller sync-jwks.controller competition-standings` passed six suites/50 tests; from frontend, `node --test --test-isolation=none "src/**/*.node-test.mjs"` passed 59 tests. The evidence exporter, its syntax check and `git diff --check` pass. No browser suite, new Cloud deployment or Render/Vercel deployment was performed in this assessment.

Latest authorized deployment (5 October): migrations 0052/0053 are installed on blue-hill, and the attachment/projection/confirmation function bodies match their migration sources. Cloud accepts the local RSA signer alongside the hosted JWKS. Revision 16 scopes canonical-event lookups to authorized sessions, fixing the reproduced PSYNC_S2305 failure. Real online delivery, offline-queued upload and warmed-peer reconnect delivery pass for fresh friendly and generated competition fixtures, with exact-ID cleanup. See [the delivery verification](two-sided-delivery-verification.md) for exact results and commands. The user will test locally and deploy Render; the hosted API currently emits valid RSA tokens without the two-sided flag claim. Earlier readiness notes below are historical.

Evening verification on 5 October did not clear the release blockers. A protected competition away-first retry reached confirmation but failed rendering the final shared-result region. Click-based testing verified lineup reconfirmation/peer refresh and player/event controls, but reproduced mobile clipping, peer resume failure, and a duplicate **Same event** decision remaining queued. The corrected friendly interaction run failed; subsequent finalisation was not reached. See the plan's verification wrap-up. No application fix or deployment resulted from this verification.

Fresh browser checks on 5 October passed both friendly confirmation orders and competition home-first. Competition away-first remains incomplete after Neon connection failures and another test-schema change (`match_sessions` was absent during cleanup). This is not a passing release suite. See the [verification record and remaining checks](two-sided-live-logging-plan.md). Obtain exclusive test-database access before rerunning that scenario; apply migrations only to the verified intended target.

The 5 October logger/shared-read and result follow-ups are implemented locally. The read-only configured-development audit still exits 1: migrations 0052 and 0053, the safe attachment function and confirmation-invalidation triggers are missing; historical fixtures include conflicting sessions/null sheet links. Source publication/grants and the enabled clock-session trigger pass. The local feature flag setting does not establish the effective deployed flag. Apply prerequisite migrations through the reviewed deployment process and verify the intended deployed environment before claiming its online or PowerSync convergence. No deployment or historical data repair was performed. Pending migrations were applied only to the separate test database for fresh fixture testing.

## Deploy

The 5 October result follow-up adds migration 0053 to invalidate pending confirmations after public canonical event/review changes and fixes canonical scoring in the 24-hour publication path. Both confirmation orders and one result per fixture have disposable service/SQL coverage, including distinct reverse legs. Deploy 0053 alongside its prerequisite 0052; it adds triggers/functions, no columns or streams. It does not repair existing records or establish paired-browser/PowerSync success.

The earlier read-only Cloud inspection confirmed blue-hill replication and hosted RS256 JWKS, with mismatched local HS256/gaffer-dev auth. The user has since authorized this target; the local RSA public key is now registered and the root local environment uses its private signer. The hosted JWKS and replication source are retained. No new instance was needed. The status indicator distinguishes accepted uploads from the live-update connection.

1. Verify intended backend/database/PowerSync endpoints and the effective feature flag. Apply missing prerequisite migrations through the normal migration process; current integrity/result work includes 0051, 0052 and 0053. Check actual functions/triggers as well as the journal. A migration on one Neon branch does not establish its presence on another.
2. Preserve a recoverable backup before database changes. Deploy code and required additive schema. If streams changed, validate/deploy the exact main powersync/sync-config.yaml to the intended instance, avoiding the stale recovery copy. Keep auth and replication source aligned with the backend.
3. Run the [fresh paired-account browser suite](testing.md#fresh-paired-account-browser-suite), then complete the short manual test in the plan on the intended target: friendly and generated competition, both confirmation orders, one result per fixture. Serialize test-database jobs; the integration migration launcher resets its schema. Automated local API/browser checks do not establish deployed PowerSync peer delivery. Use an existing appropriate environment when available; a new Cloud instance is optional.
4. Enable TWO_SIDED_LIVE_LOGGING_ENABLED=true on the intended backend processes and refresh sync tokens. The flag affects every eligible fixture in that environment.

Investigate concrete identity, upload, privacy or result disagreements before expanding use. Historical checks and Cloud revision 15 do not verify the current deployment. Use the authenticated event-link diagnostic and, for old conflicting data, [the read-only repair query](two-sided-test-data-repair.md).

## Roll back

Disable the flag on affected backend processes and refresh/reconnect clients. Shared report endpoints return 404 while disabled; existing results/schema remain stored. Disabling does not undo a published score or reconcile conflicting sessions.

Retain sessions, observations, results and migrations. Resolve affected fixtures before re-enabling. Restore a backup only as a separately scoped recovery action accounting for writes since that backup.

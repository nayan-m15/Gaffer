# Two-sided live logging rollout

Current work is described in [the implementation plan](two-sided-live-logging-plan.md). These notes cover deployment and rollback. Documentation cleanup does not establish that the application fixes have shipped or passed manual testing.

## Current readiness

Evening verification on 5 October did not clear the release blockers. A protected competition away-first retry reached confirmation but failed rendering the final shared-result region. Click-based testing verified lineup reconfirmation/peer refresh and player/event controls, but reproduced mobile clipping, peer resume failure, and a duplicate **Same event** decision remaining queued. The corrected friendly interaction run failed; subsequent finalisation was not reached. See the plan's verification wrap-up. No application fix or deployment resulted from this verification.

Fresh browser checks on 5 October passed both friendly confirmation orders and competition home-first. Competition away-first remains incomplete after Neon connection failures and another test-schema change (`match_sessions` was absent during cleanup). This is not a passing release suite. See the [verification record and remaining checks](two-sided-live-logging-plan.md). Obtain exclusive test-database access before rerunning that scenario; apply migrations only to the verified intended target.

The 5 October logger/shared-read and result follow-ups are implemented locally. The read-only configured-development audit still exits 1: migrations 0052 and 0053, the safe attachment function and confirmation-invalidation triggers are missing; historical fixtures include conflicting sessions/null sheet links. Source publication/grants and the enabled clock-session trigger pass. The local feature flag setting does not establish the effective deployed flag. Apply prerequisite migrations through the reviewed deployment process and verify the intended deployed environment before claiming its online or PowerSync convergence. No deployment or historical data repair was performed. Pending migrations were applied only to the separate test database for fresh fixture testing.

## Deploy

The 5 October result follow-up adds migration 0053 to invalidate pending confirmations after public canonical event/review changes and fixes canonical scoring in the 24-hour publication path. Both confirmation orders and one result per fixture have disposable service/SQL coverage, including distinct reverse legs. Deploy 0053 alongside its prerequisite 0052; it adds triggers/functions, no columns or streams. It does not repair existing records or establish paired-browser/PowerSync success.

Current read-only Cloud inspection confirms blue-hill replication and the hosted RS256 JWKS; local HS256/gaffer-dev auth remains mismatched. Main sync-rule validation passes. Confirm whether Development serves production before registering a local public key or writing test fixtures there. Use an existing suitable test target; a new instance does not block API/frontend work. The status indicator now distinguishes accepted uploads from the live-update connection.

1. Verify intended backend/database/PowerSync endpoints and the effective feature flag. Apply missing prerequisite migrations through the normal migration process; current integrity/result work includes 0051, 0052 and 0053. Check actual functions/triggers as well as the journal. A migration on one Neon branch does not establish its presence on another.
2. Preserve a recoverable backup before database changes. Deploy code and required additive schema. If streams changed, validate/deploy the exact main powersync/sync-config.yaml to the intended instance, avoiding the stale recovery copy. Keep auth and replication source aligned with the backend.
3. Run the [fresh paired-account browser suite](testing.md#fresh-paired-account-browser-suite), then complete the short manual test in the plan on the intended target: friendly and generated competition, both confirmation orders, one result per fixture. Serialize test-database jobs; the integration migration launcher resets its schema. Automated local API/browser checks do not establish deployed PowerSync peer delivery. Use an existing appropriate environment when available; a new Cloud instance is optional.
4. Enable TWO_SIDED_LIVE_LOGGING_ENABLED=true on the intended backend processes and refresh sync tokens. The flag affects every eligible fixture in that environment.

Investigate concrete identity, upload, privacy or result disagreements before expanding use. Historical checks and Cloud revision 15 do not verify the current deployment. Use the authenticated event-link diagnostic and, for old conflicting data, [the read-only repair query](two-sided-test-data-repair.md).

## Roll back

Disable the flag on affected backend processes and refresh/reconnect clients. Shared report endpoints return 404 while disabled; existing results/schema remain stored. Disabling does not undo a published score or reconcile conflicting sessions.

Retain sessions, observations, results and migrations. Resolve affected fixtures before re-enabling. Restore a backup only as a separately scoped recovery action accounting for writes since that backup.

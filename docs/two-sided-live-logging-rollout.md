# Two-sided live logging rollout

Current work is described in [the implementation plan](two-sided-live-logging-plan.md). These notes cover deployment and rollback. Documentation cleanup does not establish that the application fixes have shipped or passed manual testing.

## Current readiness

The 5 October logger/shared-read follow-up is implemented locally. The read-only configured-development audit still exits 1: migration 0052 is missing from the journal and historical fixtures include conflicting sessions/null sheet links. Source publication/grants and the clock-session trigger pass. The local feature flag setting does not establish the effective deployed flag. Apply prerequisite migrations through the reviewed deployment process and complete fresh paired-account tests before claiming online or PowerSync convergence. No deployment or database repair was performed.

## Deploy

The 5 October result follow-up adds migration 0053 to invalidate pending confirmations after public canonical event/review changes and fixes canonical scoring in the 24-hour publication path. Both confirmation orders and one result per fixture have disposable service/SQL coverage, including distinct reverse legs. Deploy 0053 alongside its prerequisite 0052; it adds triggers/functions, no columns or streams. It does not repair existing records or establish paired-browser/PowerSync success.

Current read-only Cloud inspection confirms blue-hill replication and the hosted RS256 JWKS; local HS256/gaffer-dev auth remains mismatched. Main sync-rule validation passes. Confirm whether Development serves production before registering a local public key or writing test fixtures there. Use an existing suitable test target; a new instance does not block API/frontend work. The status indicator now distinguishes accepted uploads from the live-update connection.

1. Verify intended backend/database/PowerSync endpoints and the effective feature flag. Apply missing prerequisite migrations through the normal migration process; current integrity/result work includes 0051, 0052 and 0053. Check actual functions/triggers as well as the journal. A migration on one Neon branch does not establish its presence on another.
2. Preserve a recoverable backup before database changes. Deploy code and required additive schema. If streams changed, validate/deploy the exact main powersync/sync-config.yaml to the intended instance, avoiding the stale recovery copy. Keep auth and replication source aligned with the backend.
3. Complete the short paired-account manual test in the plan: friendly and generated competition, both confirmation orders, one result per fixture. Use an existing appropriate environment when available; a new Cloud instance is optional.
4. Enable TWO_SIDED_LIVE_LOGGING_ENABLED=true on the intended backend processes and refresh sync tokens. The flag affects every eligible fixture in that environment.

Investigate concrete identity, upload, privacy or result disagreements before expanding use. Historical checks and Cloud revision 15 do not verify the current deployment. Use the authenticated event-link diagnostic and, for old conflicting data, [the read-only repair query](two-sided-test-data-repair.md).

## Roll back

Disable the flag on affected backend processes and refresh/reconnect clients. Shared report endpoints return 404 while disabled; existing results/schema remain stored. Disabling does not undo a published score or reconcile conflicting sessions.

Retain sessions, observations, results and migrations. Resolve affected fixtures before re-enabling. Restore a backup only as a separately scoped recovery action accounting for writes since that backup.

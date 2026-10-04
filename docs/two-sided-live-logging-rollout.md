# Two-sided live logging rollout

## Production checklist

1. Take and verify a restorable database backup.
2. Deploy the additive migrations and application code with `TWO_SIDED_LIVE_LOGGING_ENABLED=false`.
3. Verify the new schema and migration journal in staging; run the friendly two-account scenarios and inspect result/review telemetry.
4. Enable the feature for a small cohort using accepted friendlies first. Check shared access, disputes, timeout finalisation, and cancellation/rematch behavior.
5. After the friendly cohort is stable, enable it for generated competition fixtures. Verify each fixture has one session and one completed result in standings.
6. Expand the cohort while monitoring duplicate-session warnings, rejected-upload warnings, open-dispute warnings, and fixture/session result disagreement errors.

## Recorded status — 2 October 2026

- PowerSync Cloud Sync Streams configuration has been validated and deployed by the operator.
- The full backend unit suite passed locally: 67 suites and 775 tests.
- The four release e2e suites and the two-account browser gate remain unverified. In the current Windows environment, Jest worker creation fails with `spawn EPERM`; a serial retry stalled before reporting results.
- Staging rollback, restorable-backup verification, production migration status, production flag status, and production telemetry require confirmation in the respective environment. This workspace's `.env` is not a reliable indicator of either staging or production.

The feature flag is one global `TWO_SIDED_LIVE_LOGGING_ENABLED` switch. It does not enforce a small team cohort or separate friendly and competition rollouts. Once enabled, all eligible newly started fixtures can create shared sessions; use external traffic controls for a limited pilot, or enable only when ready for all eligible fixtures.

## Rollback

Turn `TWO_SIDED_LIVE_LOGGING_ENABLED` off. Keep the additive schema in place so existing records remain readable. Do not delete sessions, reviews, operations, or observations. Continue to use the legacy single-sided path while investigating; resolve or reconcile existing shared sessions before re-enabling the flag.

## Minimal test-data repair report

Use [the read-only dry-run SQL and manual repair procedure](two-sided-test-data-repair.md) for recent dev fixtures. It reports null-linked sheets, competing linked sessions and duplicate completed result candidates. No script, migration, automatic repair or deletion is involved.

# Two-sided live logging rollout

## Production checklist

1. Take and verify a restorable database backup.
2. Deploy the additive migrations and application code with `TWO_SIDED_LIVE_LOGGING_ENABLED=false`.
3. Verify the new schema and migration journal in staging; run the friendly two-account scenarios and inspect result/review telemetry.
4. Enable the feature for a small cohort using accepted friendlies first. Check shared access, disputes, timeout finalisation, and cancellation/rematch behavior.
5. After the friendly cohort is stable, enable it for generated competition fixtures. Verify each fixture has one session and one completed result in standings.
6. Expand the cohort while monitoring duplicate-session warnings, rejected-upload warnings, open-dispute warnings, and fixture/session result disagreement errors.

## Rollback

Turn `TWO_SIDED_LIVE_LOGGING_ENABLED` off. Keep the additive schema in place so existing records remain readable. Do not delete sessions, reviews, operations, or observations. Continue to use the legacy single-sided path while investigating; resolve or reconcile existing shared sessions before re-enabling the flag.

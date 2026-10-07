# Duplicate review lifecycle repair

Undo and report deletion now close duplicate reviews involving a removed event. The surviving event loses its warning only when it has no other unresolved review. Removed observations and prior coach votes remain in history. Corrections close obsolete candidates and detect new candidates at the corrected minute. Queued votes cannot reopen a review closed by deletion.

Shared detection compares both match sheets, including entries on the same sheet. Live entries retain the five-second window. Manual additions and corrections use their recorded minute and period. Known different players are excluded; a missing player on a manual entry remains a possible duplicate requiring a coach's decision. Merging an anonymous entry with an identified entry on the same sheet preserves the known attribution.

Cross-team resolutions still require both coaches to agree. Same-team reviews require one coach. Report confirmation is a separate bilateral step. Confirmed reports retain their amendment workflow.

The review panel uses a portal dialog, shows loading and refresh errors, and refreshes while open. Online reads work independently of PowerSync storage. Cached fallback never bypasses an access denial. Shared timeline merging replaces a queued preview with its server row by ID, retaining separate observations for review.

## Database rollout

Run `npm --prefix backend run db:migrate` before deploying the updated backend. Migrations `0058_duplicate_review_lifecycle` and `0059_manual_unknown_player_candidates` repair unlocked reports, including historical manual additions that inherited the full-time period. Locked reports are skipped. Original observations are preserved.

Both migrations were applied to the configured development database. Its affected report now has two removed-event reviews closed and one review for the manual re-entry. The coaches still decide whether that entry represents the same goal and confirm the report afterwards.

## Verification

- 80 backend match tests, including real PGlite migrations and service paths.
- 100 frontend tests, including queue fallback, access denial and queued/server ID merging.
- 10 migration tests, including prepared-query execution and migration journal checks.
- Four Chromium checks covering both review buttons, loading, server errors, refresh, bilateral decisions and removal history.
- Frontend and backend builds; frontend lint and lint on the changed backend TypeScript files.

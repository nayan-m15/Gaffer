# Match end confirmation and shared resume

End Match now opens confirmation before changing the clock or either team's match status. Cancelling leaves play running. The second-half check-in timeout also requests confirmation instead of ending the shared clock automatically.

Either participating coach can resume an unlocked match from the live screen or report. Resume restores the latest playing half and saved elapsed time, starts the shared clock, restores both event statuses, and clears pending report confirmations. An opponent viewing the report returns to the live screen when the shared clock resumes. A newer shared clock takes precedence over an older completed sheet while its slower poll catches up.

Migration `0060_match_play_state` makes end/resume atomic, checks the clock revision, preserves confirmed report locks, and rejects delayed full-time commands after newer clock changes. Apply it with `npm --prefix backend run db:migrate` before using the updated backend. The migration has not been applied during this change.

Tests and builds remain deferred at the user's request. The database function and two-client behavior still need verification in the planned final testing pass.

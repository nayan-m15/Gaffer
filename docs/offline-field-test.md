# Offline collaboration field test

Run this checklist against the production build after the database migration,
PowerSync streams, Render API and Vercel frontend are deployed. Keep one match
reserved for testing and use separate coach and assistant accounts.

## Android Chrome and installed PWA

1. Open the match online, select **Prepare for offline use**, and confirm every
   readiness check passes.
2. Install the PWA, enable airplane mode, close it, reopen it, and record every
   supported event type.
3. Pause and resume the clock, close the PWA, reopen it, and confirm the local
   clock anchor is restored. Change the device clock substantially and confirm
   the logger pauses with an uncertainty warning.
4. Export pending items, re-import the file under the same account, and confirm
   duplicate IDs are not added. Confirm another account rejects the import.
5. Sign out with pending work once using **retain** and once using **discard**;
   confirm each choice has the stated effect.
6. Reconnect and confirm states progress through queued, uploading, accepted and
   reconciled without losing the event or double-counting the score.

## iOS Safari and installed PWA

Repeat the Android checklist in Safari and from an installed Home Screen PWA.
Also background the PWA for at least five minutes during a running clock, then
resume it and verify the elapsed time and uncertainty state.

## Collaboration and update safety

1. Open the same match as coach and assistant on two physical devices.
2. Put both offline and record the same goal within five match-clock seconds.
3. Reconnect in both possible orders. Confirm a duplicate review appears and
   resolving it produces one canonical goal and the same projection revision.
4. Queue a correction as the assistant. Confirm it becomes a coach review and
   does not immediately alter the official result.
5. Queue work, deploy a new frontend build, and keep the PWA open. Confirm the
   waiting service worker does not reload the logger. Drain or export the queue,
   close all tabs, reopen, and confirm the update activates safely.
6. Remove the assistant from the team before reconnecting their device. Confirm
   pending work is retained as access-blocked and is not uploaded under another
   account.

Record the device model, operating-system version, browser version, result,
replication time and any screenshots for each run.

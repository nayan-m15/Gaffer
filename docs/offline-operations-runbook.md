# Offline collaboration operations runbook

Use this runbook for the production offline logger, PowerSync replication and
reconciliation pipeline. Metrics contain counts and timings only; they do not
contain match-event payloads.

## Deployment order

1. Back up the production Neon branch and record the currently active Render,
   Vercel and PowerSync versions.
2. Apply migration `0024_offline_operations_hardening.sql`.
3. Run `npm --prefix backend run db:configure:powersync`. This grants and
   publishes match metadata, squads, projections and clock operations.
4. Validate and deploy `powersync/sync-config.yaml`.
5. Deploy Render, then Vercel. Run `npm run test:e2e:pwa` against the production
   frontend build before enabling additional matches.
6. Set `OPERATIONS_HEALTH_TOKEN` to a dedicated high-entropy value in Render.
7. Add GitHub Actions secrets `OPERATIONS_HEALTH_URL` (the full
   `/health/operations` URL) and `OPERATIONS_HEALTH_TOKEN`. The
   `offline-sync-health.yml` workflow checks production every five minutes and
   fails when a documented threshold is exceeded.

## Staged rollout

- `OFFLINE_SYNC_ENABLED=false` pauses every upload as dependency-pending without
  deleting local data.
- `OFFLINE_SYNC_MATCH_IDS=id1,id2` enables uploads only for those matches.
- An empty `OFFLINE_SYNC_MATCH_IDS` enables every match.
- Start with one internal match, then a small field-test group, then remove the
  allowlist after the physical-device checklist passes.

## Two-sided fixture link check

An authenticated current member of either participating team can inspect a
fixture link with `GET /events/{eventId}/link-diagnostic`. Use the event ID from
either team's generated fixture event or accepted friendly. The response
contains fixture/session IDs, participant team IDs and home/away sides, and
linked match-sheet IDs. For an unlinked or manual event it returns null fixture
and session IDs with `status: "unlinked"` and a warning. Names, lineups, notes,
and tactics are not returned; unrelated teams receive 404.

Run the check from both coach accounts after starting each sheet and compare
the fixture and session IDs. Do not use this endpoint to relink or repair rows.

Never disable or remove `/sync/upload` while devices may contain queued work.
Rollback the UI independently and leave schema, receipts and upload contracts
compatible with the previous release.

## Health and alerting

Query the protected endpoint:

```powershell
curl.exe -H "Authorization: Bearer $env:OPERATIONS_HEALTH_TOKEN" `
  https://gaffer-api-ynaf.onrender.com/health/operations
```

The automated health check runs every five minutes. It applies the pending-age
threshold to devices that reported telemetry in the last 15 minutes. Older
telemetry remains visible in `stale_pending_devices` and `stale_pending_items`
so dormant devices do not keep the active sync check failing; review those
queues when their users reconnect. Alert when:

- the oldest pending item from an actively reporting device is older than 15
  minutes;
- rejected uploads exceed 1% of uploads in 24 hours;
- p95 reconciliation processing exceeds 2 seconds;
- unresolved reviews grow continuously for 30 minutes;
- a reporting device has not updated telemetry for 15 minutes during a match;
- retained WAL exceeds the Neon/PowerSync limit agreed for the deployment.

`replicationLagBytes`, `replicationSlotActive` and
`replicationWalRetainedBytes` may be `null` when the application role cannot
read replication slots. In that case use Neon and PowerSync dashboards as the
authoritative replication-lag and WAL monitors.

## Failed upload recovery

1. Check the client state: waiting, rejected or access blocked.
2. Export unsent events before clearing browser data or reinstalling the PWA.
3. For dependency-pending work, restore the missing parent operation or enable
   the match rollout flag, then reconnect and allow the same ID to retry.
4. For rejection, inspect `safe_error_code`; never edit immutable observation
   rows manually.
5. For membership revocation, restore authorised membership or retain the
   export for the original account. Never import it under another account.
6. A lost HTTP response after a successful commit is safe: retry the unchanged
   operation ID and payload.

## Replication and WAL recovery

1. Confirm the Neon source is reachable and logical replication is enabled.
2. Confirm the `powersync` publication contains every table printed by
   `npm --prefix backend run db:configure:powersync`.
3. Inspect the PowerSync source connection, replication lag and last checkpoint.
4. If a slot is inactive, restart the PowerSync source before changing Neon.
5. If WAL retention approaches the provider limit, stop staged rollout, restore
   the consumer, and contact the provider before dropping any slot.
6. Never recreate a slot or publication until pending clients are exported and
   the recovery impact is understood.

## Schema and app updates

Keep local SQLite additions backward-compatible. With pending work, the service
worker waits and displays the update prompt. Drain or export the queue, apply the
update on every match device, then confirm all devices report the same clock and
projection revision.

## Signing-key rotation

Publish the new public JWKS key first, deploy Render with the new private key and
`POWERSYNC_KID`, wait longer than the five-minute token lifetime, then remove the
old public key. Confirm `/sync/jwks` and an authenticated `/sync/token` response
before field use.

## Result amendments

Late evidence after finalisation must create an amendment review. Resolve the
review, reopen the result with a reason, verify the new projection revision, and
finalise again. Keep the original observations and operations for audit.

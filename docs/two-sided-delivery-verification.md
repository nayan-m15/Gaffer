# Two-sided Development deployment and delivery verification

5 October 2026. Scope: the user authorized the existing PowerSync Development instance and blue-hill source, then reserved Render deployment for themselves after local testing. No Git commit or push was requested or performed.

Subsequent authorized follow-up repaired the three historical session conflicts and both null-linked sheets; all five coach pairs now receive identical actual service reports. The journal review is complete, with provenance discrepancies preserved and no migration replay. See [the applied repair](two-sided-test-data-repair.md#applied-historical-reconciliation-5-october-subsequent-to-the-assessment-below). Earlier remaining-history statements below describe the delivery verification baseline. UI retesting and Render/Vercel deployment remain with the user.

## Environment and deployment

- Database: `ep-blue-hill-b1j037cs`, `neondb`, branch `br-odd-cell-b1onih3h`.
- PowerSync: Development, instance `6aac1ed7a77ca1231d28f82d`, active sync-rule revision **16**. Source connection and initial replication pass, without table/rule errors.
- Migrations: 0052 and 0053 installed in one transaction. The normal timestamp-based migrator would skip 0052 because unrelated journal entries have later timestamps. The explicitly pinned deployment helper applies only these missing migrations and preserves the old journal.
- Recovery: affected function/trigger definitions and the journal were saved locally, and the forward install/object rollback restored exact previous function definitions in isolated PGlite. No full database backup, historical relinking, reconciliation or schema reset occurred.
- Installation: attachment, projection and pending-confirmation function bodies match the migration SQL; the two confirmation triggers and clock-session trigger are enabled. Publication/grants pass.
- Authentication: the local environment uses the prepared RSA signer `gaffer-phase25-validation-1`; Cloud now trusts its public key while retaining the hosted production JWKS. The private key and environment backup remain ignored local files. Running local tokens verify cryptographically and carry `two_sided_live_logging: "true"` with the intended Cloud audience.
- Hosted Render: tokens verify under RS256/`gaffer-production-1`, but omit the two-sided feature claim. This does not prove the flag is false; it proves the hosted token behavior is behind the current contract. The user will deploy this branch with `TWO_SIDED_LIVE_LOGGING_ENABLED=true`, then refresh tokens and verify the claim. No Render application deployment is claimed here.

## Delivery blocker and fix

After RSA alignment, real Chromium clients reached Cloud and failed with `PSYNC_S2305: Too many parameter query results (limit of 1000)`. The review/operation streams included canonical-event lookups across all non-injury events in the database. Those lookups are now restricted to sessions authorized by the coach's team and current membership. Injury exclusion, opposite-sheet selection and the feature gate remain enforced. Cloud validated the exact rules and activated revision 16 after its CLI wait timed out; a fresh status fetch confirmed initial replication complete and no errors.

## Verification method

`verify-two-sided-delivery.mjs` starts the built current Nest API and Vite on isolated ports against the authorized source. It creates fresh accounts, teams and an accepted friendly fixture, then uses independent Chromium clients and the actual application SQLite store/queue modules. A minimal browser document keeps report/API polling out of the delivery assertion. Only the exact canonical ID in the other coach's synced SQLite event table can pass it.

The checks cover online home-to-away delivery, an away observation queued while offline and uploaded on reconnection, and a warmed persistent peer closed during a further accepted upload and reopened to catch up. Closing the persistent client terminates its actual SharedWorker and streaming connection; Chromium's `setOffline` alone left an existing stream alive and was rejected as disconnection evidence. The reopened client signs in as the same coach because browser-session cookies expire at process shutdown; its existing SQLite database is retained. This verifies application store/queue and Cloud transport, not the full logger UI or a rendered production frontend.

Friendly run: **passed**, with exact-ID cleanup. Fixture `6d54689d-54aa-42f1-adb8-c09315734449`, session `d03a9208-3f20-4c2b-bfef-ff0f38e56941`. Peer SQLite received online canonical event `47cf9f8d-0f97-46ec-94a6-09217b4cef66`, offline-queued canonical event `3f5c1ea2-4970-4298-8233-c986aa115771`, and reconnect canonical event `a6135217-aa88-455c-b4f7-8d4b9dd19afd`. Retained local evidence: `delivery-friendly.json`.

Generated competition run: **passed**, exit 0, with automatic exact-ID cleanup. Fixture `5fda3a2d-844c-4224-8bb6-37f814083f6d`, session `0610d7a2-5364-4501-81de-42872779ccbc`. Peer SQLite received online canonical event `41de45ba-ae95-4283-a9ca-4e40b579cf54`, offline-queued canonical event `d1edb04d-7a7b-42f0-8bd8-258a3e65cf94`, and reconnect canonical event `317987f8-571e-4cee-beb1-dbaccb1f0452`. Retained local evidence: `delivery-competition.json`. Earlier competition attempts corrected setup/cleanup ordering; rescheduling must precede schedule confirmation, and sheet deletion must precede fixture deletion. Only fresh verification records were affected.

The runner deletes only its exact fresh team/session/user IDs and generated competitions. Competition cleanup clears the test fixture result link and removes sheets before deleting fixtures, avoiding their synchronization-trigger foreign-key failure. Generated evidence, temporary server logs, browser profiles, private signer and backups are excluded from Git. Review the locally retained `docs/phase-delivery-validation/` evidence; never commit its environment backups or profiles.

## Commands and remaining work

```powershell
# From repository root; explicit authorization for this shared target required.
node backend/scripts/verify-two-sided-delivery.mjs --blue-hill
node backend/scripts/verify-two-sided-delivery.mjs --blue-hill --competition
node backend/scripts/check-two-sided-release.mjs dev

# Build before running the delivery helper.
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build

# From backend/
npm.cmd run test -- --runInBand shared-session-integrity sync.controller sync-jwks.controller sync-authorization
npm.cmd run test -- --runInBand sync-authorization shared-session-privacy

# From frontend/
node --test --test-isolation=none "src/**/*.node-test.mjs"
npm.cmd run lint
```

Both builds pass. Focused backend checks pass (61 authentication/integrity/authorization tests, plus 37 authorization/privacy tests; these overlap and must not be summed). All 59 frontend tests pass; lint passes with existing warnings. Script syntax and whitespace checks pass. The final service YAML, source connection and sync rules also pass all three Cloud validation checks.

The database release audit still exits 1 for existing migration drift, 13 unknown journal entries and historical fixture candidates; missing 0052/0053 and missing integrity objects are resolved. Historical conflicts remain under the repair procedure. Render deployment/effective hosted claim and full UI/manual regression testing remain separate release checks. Related work: this document and the implementation plan; no issue/card supplied. Assisted by Codex (GPT-6).

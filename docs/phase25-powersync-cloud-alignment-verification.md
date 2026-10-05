# Phase 2.5 — PowerSync Cloud alignment and client delivery

5 October 2026, Africa/Johannesburg. Read all four required handoffs in full. Their completed backend results remain authoritative. This session stops at the external configuration gate required by Part 3; no Cloud deployment, auth configuration change, database mutation, production fix, or lineup/layout work occurred.

## A. Auth environment

Initial checkout was clean on `feat/matches-two-sided-live-logging`, SHA `4c6218f02e7a02e9aac8063cad6744b524b87aeb`. Current evidence additions are uncommitted. The prior report's uncommitted Phase 2 work is now in that existing commit.

[environment.json](phase25-validation/environment.json) captures root `.env` plus inherited process environment, matching the backend's dotenv precedence. This is configured-process evidence, not an attestation of a running browser backend or hosted deployment SHA.

| Setting | Current inspected configuration |
|---|---|
| Backend / frontend | `http://localhost:3000` / `http://localhost:5173` |
| Environment | Local development by URLs; `NODE_ENV` and `VITE_DEPLOYMENT_ENV` unset |
| Shared logging flag | `TWO_SIDED_LIVE_LOGGING_ENABLED=true` |
| Signer | HS256, `kid=gaffer-dev`; shared secret present, RSA private key absent |
| Issuer | No `iss` emitted by current controller |
| Audience / backend and frontend PowerSync URL | `https://6aac1ed7a77ca1231d28f82d.powersync.journeyapps.com` |
| Application database | `ep-blue-hill-b1j037cs.c-5.eu-central-1.aws.neon.tech/neondb` |
| Authorized disposable validation database | `ep-royal-star-b253pvlk-pooler.c-6.eu-central-1.aws.neon.tech/neondb`; handoff branch `br-misty-moon-b2be9vmt` |
| Key scope | Development fallback by `.env.example`; not production RSA material |

`powersync-recovery/cli.yaml` supplies public linkage: organization `6aac1ea304e93a0007fcb0bf`, project `6aac1ed66860dd000702696f`, instance `6aac1ed7a77ca1231d28f82d`. Both repository service templates name the instance **Development**, reference the blue-hill source, and use `https://gaffer-api-ynaf.onrender.com/sync/jwks`. The main `powersync/` directory has no link file. These are local references; current Cloud project display name, source connection, deployed revision, issuer/audience policy, and complete keystore remain unverified.

Fresh public JWKS fetch: HTTP 200; exactly one published RSA signing key, RS256 / `gaffer-production-1`, fingerprint `ad928487779412d50ebc58d312c6f927e9d18cb50e7333b3e48f4dd00c53cbd1`. `gaffer-dev` is absent **from that public JWKS**. This does not establish that Cloud currently uses this URL or has no other configured keys. Hosted backend SHA, feature flag, and freshly issued hosted-token claims were not established.

## B. Key mismatch resolution

**Choose B for the authorized disposable validation flow:** a dedicated dev/test environment using its own asymmetric key. This follows the handoff's authorized database scope and repository separation of development fallback from production signing. A hosted production test could instead use its intended production issuer, but that would not verify the disposable branch and is not the selected workflow.

The HS256 path is explicitly documented as development setup in `.env.example` and `docs/offline-collaborative-event-logging-plan.md`. RSA signing is already preferred when `POWERSYNC_PRIVATE_KEY` exists, and `/sync/jwks` already publishes only its public counterpart. No backend implementation change is needed to select the existing RSA path. No signature, KID or audience checks were weakened.

Exact operator actions required:

1. In PowerSync organization/project above, inspect current **Development**, instance `6aac1ed7a77ca1231d28f82d`, and record its actual auth configuration, source, deployed revision and operational status. Provision a separate validation instance if this existing instance serves other environments. Record the new instance ID/endpoint; do not silently repoint a shared instance.
2. Configure the validation instance's replication connection to the authorized royal-star disposable branch, using the unpooled endpoint for logical replication and securely supplied replication-role credentials. Verify the database-reported branch/endpoint, publication, SELECT grants, replica identity and replication health. Do not run the existing configuration script against root `DATABASE_URL`: that points at blue-hill.
3. Provision an independent RSA signing key in the validation backend's secret configuration: `POWERSYNC_PRIVATE_KEY`, proposed dedicated `POWERSYNC_KID=gaffer-phase25-validation-1`, `POWERSYNC_URL=<validation-instance-endpoint>`. Pin that backend's `DATABASE_URL` to the disposable branch. Set the shared logging flag true. Point the frontend API and `VITE_POWERSYNC_URL` at these same validation environments. The production private key must stay in production.
4. Under validation **Client Auth**, set `client_auth.jwks_uri` to the publicly reachable validation backend's `/sync/jwks`; expected public key `kid=gaffer-phase25-validation-1`, `alg=RS256`, `kty=RSA`, `use=sig`. That backend origin has not been provisioned/identified here, so a concrete JWKS URL cannot honestly be supplied yet. The existing Render production JWKS is not the proposed validation key source. Publish no private key or HMAC secret. The current token contract has no issuer; do not configure a required issuer absent from tokens. Audience must be the exact validation PowerSync endpoint. Inspect existing restrictions before applying changes.
5. Fetch this validation public JWKS, compare KID and public-key fingerprint with the signer, obtain fresh tokens for two new real coach accounts, inspect header and safe claims, and connect both actual clients. Record accepted authentication, stream status and absence of `PSYNC_S2101` before starting any delivery tests.

External access is unavailable here: no `PS_ADMIN_TOKEN` or other Cloud management credential appears in the inspected configuration, no installed/cached PowerSync CLI is available (`npx --no-install powersync --version` returns `ENOTCACHED`), and the browser tool fails before bootstrap with `codex/sandbox-state-meta: missing field sandboxPolicy`. No dashboard was opened. Stored OS credentials were not exhaustively audited. These limitations prevent an authenticated Cloud inspection or mutation; local linkage IDs alone do not provide access.

## C. Cloud configuration/deployment

Exact current `powersync/sync-config.yaml` SHA-256: `cbbbe2dcb69f66f29e3ec6da1aaf9b6e3ce46ea1863edefc4e7cef35d3e3ead2` (raw file bytes). It contains **22 streams: 12 private and 10 shared**. The prior handoff's count of 23 is not the current file's count.

All requested shared streams are present: `shared_session_match_events`, `shared_session_match_observations`, `shared_session_match_memberships`, `shared_session_match_reviews`, `shared_session_match_operations`, `shared_session_match_projections`, `shared_session_match_clock_operations`, `shared_session_report_state`, `shared_session_report_sheets`, `shared_session_report_fixture_scores`.

All ten shared blocks have feature-flag and live-user-membership predicates; private blocks also enforce live membership. Injury exclusions appear in shared event/observation/membership/review/operation queries. Peer event detail and operation reason are NULL, observation raw payload/player IDs are omitted, and operation selection restricts private corrections. The retained Phase 2 work sanitizes nested review data server-side. This source audit is not Cloud validation or actual peer-row inspection.

**Cloud validation: not performed. Deployment: not performed. Revision and timestamp: unknown.** Recovery sync file hash is `c2d3f8b318359e0197b50b8600d3a4e3ef5d9c2996972259187b427bcedd1c61`, different from current; do not deploy that stale copy.

After operator auth/source setup, use the validation instance's **Sync Streams** editor to upload the exact current main file, validate it against Cloud, and deploy it. Alternatively use the authenticated CLI with the explicit validation instance ID and `--sync-config-file-path` pointing at the main file. Validate before deploying; use the sync-config-only deployment command so the old service template cannot overwrite auth/source settings. Record validation output, deployed revision/time, raw local hash and deployed content comparison. The CLI supports explicit config paths and sync-only deployment: [official CLI reference](https://github.com/powersync-ja/powersync-cli/blob/main/cli/README.md).

## D. Token smoke test

No fresh two-coach token/client smoke test was run after the external gate. Current configured signer remains HS256 / `gaffer-dev`; freshly fetched public key remains RS256 / `gaffer-production-1`. **`PSYNC_S2101` is not demonstrated gone.** The previous handoff's two-token 401 reproduction remains historical evidence, not a new run.

## E. Friendly real-browser sync

Not run; no accepted PowerSync clients. Both-direction receipt, local synced rows, rendered perspective and clock delivery remain unproven. Prior HTTP/SQL success is not browser evidence.

## F. Competition real-browser sync

Not run. Bidirectional delivery, clock/score convergence, bilateral report/result publication and duplicate standings checks through actual clients remain pending.

## G. Duplicate review delivery

Not run through actual clients. Prior HTTP candidate/resolution/dispute results are retained; sync delivery to the opposing browser remains unproven.

## H. Clock verification

No new browser clock requests were made; therefore no new 500 was observed and no browser 500-free claim is made. Prior valid transitions/retries/concurrency and the fixed conflicting-ID 409 remain backend/HTTP evidence only.

## I. Revocation behavior

No connected client was warmed/revoked. No-new-row delivery, bucket removal, stale cached rows, reconnection and token-refresh behavior remain unverified. Prior HTTP denial and SQL predicates do not establish real client revocation. Existing cache retention means downloaded data can remain accessible offline; actual bucket deletion and the product's cache-purge policy still require verification. Third-team Cloud isolation is also pending.

## J. Offline replay

Not run because online authentication has not passed. Queued upload-once behavior, canonical idempotency and peer sync delivery after reconnect remain unproven. Historical HTTP offline 5/5 is not substituted.

## K. Privacy inspection

No actual peer local PowerSync rows were available. Athlete IDs, tactics, plans, notes, injury details, nested private review IDs and correction payload exclusion remain real-client release gates, despite retained source/HTTP coverage.

## L. Frontend build classification

**Unrelated pre-existing build blocker, reproduced on base.** `npm --prefix frontend run build` exits 1 before Vite. A forced TypeScript project build on current SHA and isolated `git archive` of base `e01fe3d18be0c47edc8a56ebcd70d7d83c9a7dec` both exit 2 with byte-equal diagnostics. Current installed dependencies were reused through a junction; this reproduces base source with the current dependency environment, not an independently reconstructed historical install. Both affected source files and frontend manifests/lockfile compare unchanged from base to HEAD. Phase 2 did not touch them.

- `frontend/src/components/landing/gaffer-stadium.ts:160`: TS6133, unused `textures`.
- `frontend/src/components/landing/landing-scene.ts:675–678,692,697`: TS2339, missing `DressingRoomKit.light`.
- Same file `:987`: TS6133, unused `turfCells`.
- Same file `:1065`: TS2353 unsupported `bumpMap`; TS2345 incompatible `onBeforeCompile` callback signature (renderer argument required).
- Same file `:1153`: TS2339, `rotation` on `never`.

Full exact diagnostics and process results: [current log](phase25-validation/frontend-current-build.log), [base log](phase25-validation/frontend-base-build.log), [comparison](phase25-validation/frontend-build-comparison.json). No unrelated frontend fix was made. The first runner attempt failed with sandbox spawn EPERM before export; an approved escalated run completed the comparison.

## M. Test results

This session: public JWKS HTTP 200; current frontend build fails as above; isolated base diagnostics match; new diagnostic/build scripts pass `node --check`; `git diff --check` passes. No new backend or frontend node test totals are claimed. The post-alignment release gate was not reached, so completed backend work was not rerun.

Authoritative prior Phase 2 results, **not rerun here**: backend 824/824, frontend node 51/51, focused 61/61 including Phase 1 18/18, requested HTTP suites 41/41 across retained runs, Phase 2 HTTP 4/4 plus separate revocation/concurrency checks; backend build/lint passed. These do not override Cloud/client blockers.

## N. Remaining blockers

Authenticated Cloud/dashboard access; provisioned independent validation RSA signer and publicly reachable validation JWKS; confirmed validation replication source; exact Cloud stream validation/deployment; working browser runtime; all real client delivery, review, clock, isolation, revocation, offline and privacy gates. Frontend production build separately retains its pre-existing blocker.

## O. Sign-off recommendation

**PHASE 2 BLOCKED — EXTERNAL CONFIGURATION**

The immediate blocker is external auth/source/deployment alignment. Real client verification is also incomplete. No lineup/layout phase should begin.

## PASTE THIS BACK TO THE REVIEWER

- Configured backend HS256 / `gaffer-dev`; fresh public JWKS RS256 / `gaffer-production-1`. Cloud's actual accepted key set/policy not inspected.
- Select dedicated validation RS256 key, proposed `gaffer-phase25-validation-1`, public validation `/sync/jwks`, and disposable royal-star source. No auth change applied; operator must provision/access the validation environment.
- Current streams hash `cbbbe2dcb69f66f29e3ec6da1aaf9b6e3ce46ea1863edefc4e7cef35d3e3ead2`; all ten shared streams present. Cloud validation/deployment revision/time unknown. Recovery config differs and must not be used as the current stream artifact.
- `PSYNC_S2101` not demonstrated resolved. Friendly/competition browser delivery, browser clock 500 status, review sync, revocation/cache, offline replay, third-team sync isolation and peer local-row privacy remain unverified.
- Historical totals only: backend 824/824, frontend node 51/51, requested HTTP 41/41. No post-alignment release-gate run.
- Fresh frontend build fails in unchanged landing files; exact errors reproduce on original base with current dependencies. Classified unrelated pre-existing blocker.
- Recommendation: **PHASE 2 BLOCKED — EXTERNAL CONFIGURATION**. No secrets exposed, no Cloud or database mutation, no UI phase started.

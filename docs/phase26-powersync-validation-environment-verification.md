# Phase 2.6 — validation environment provisioning and client acceptance

5 October 2026, Africa/Johannesburg. Recommendation: **PHASE 2 BLOCKED — POWERSYNC AUTH**. Cloud inspection succeeded; isolated provisioning and client acceptance remain incomplete. All five requested handoffs were read. Initial checkout was clean on `feat/matches-two-sided-live-logging`, HEAD `cd6f14cb`. No application logic, root `.env`, existing Cloud instance, database configuration, forensic fixture, or UI was changed. No commit was made.

## A. Cloud instance inspection

Authenticated PowerSync CLI 0.10.1 used the pre-existing saved local login. No token was printed or copied into repository evidence. The browser failed before connecting with `codex/sandbox-state-meta: missing field sandboxPolicy`; the saved CLI login nevertheless enabled actual Cloud inspection.

| Field | Actual inspected value |
|---|---|
| Organization | `6aac1ea304e93a0007fcb0bf`, Hemesh-P |
| Project | `6aac1ed66860dd000702696f`, Gaffer |
| Instance | `6aac1ed7a77ca1231d28f82d`, Development |
| Endpoint | `https://6aac1ed7a77ca1231d28f82d.powersync.journeyapps.com` (configured client endpoint; corresponds to instance ID) |
| Purpose | Named Development; serves blue-hill, not the authorized validation source |
| Shared use | Existing development usage established by source/configuration; whether production clients also use it is UNKNOWN |
| Source | `ep-blue-hill-b1j037cs.c-5.eu-central-1.aws.neon.tech`, `neondb`, `powersync_role` |
| Replication | Connected; initial replication complete; lag 0 bytes; WAL reserved; no reported connection/table/sync-rule errors |
| Active revision | `15` |
| JWKS URI | `https://gaffer-api-ynaf.onrender.com/sync/jwks` |
| Inline JWKS | Empty key list |
| Issuer | No issuer requirement appears in fetched configuration |
| Audience | No additional audiences configured; instance audience is the endpoint. Fresh token acceptance was not tested |
| Visible public key at configured URI | RS256 / `gaffer-production-1`, RSA, signing use; HTTP 200 |
| Cloud cached accepted key IDs | Not exposed by fetched configuration/status; public JWKS is source evidence, not a cache inspection |
| Latest deployment timestamp | UNKNOWN; not exposed by these responses. Replication checkpoint/keepalive times are not deployment times |

**Safe to use this existing instance for isolated validation: NO.** Its active source is blue-hill. It was not repointed. Project inventory also includes Production `6aac4635a77ca1231d29003d`; it was not inspected or changed.

Evidence: [instances](phase26-validation/cloud-instances.json), [sanitized configuration](phase26-validation/cloud-config.json), [status](phase26-validation/cloud-status.json), [configured public JWKS metadata](phase26-validation/configured-public-jwks.json).

## B. Validation environment topology

The intended separate instance has a schema-valid scaffold at [service.yaml](../powersync-validation/service.yaml): name `Phase 2.6 isolated validation`, region `eu`, organization/project above. It contains no replication connection, JWKS origin, or secrets. It is sufficient for CLI instance creation, not for service deployment. **No validation instance ID or endpoint exists yet.** After an initial automatic approval rejection, the user explicitly approved this exact resource. The approved creation request reached Cloud and failed with `PLAN_LIMIT_REACHED`: "Instance limit reached within active plans." No separate instance was created. Evidence: [provisioning result](phase26-validation/provisioning-result.json). Do not delete an existing instance or change the subscription without separate authorization.

Backend/frontend validation hosting targets remain unidentified. Root configuration still points to blue-hill and the existing Development endpoint; it must not be used to start a validation stack. A future validation launcher must pin backend `DATABASE_URL` to royal-star, backend and frontend PowerSync URLs to the new instance endpoint, frontend API/auth URLs to the validation backend, and the shared logging flag to true. The signer file prepared below does not supply these URLs and must not be used alone as a stack launcher.

Fresh read-only PostgreSQL evidence verifies:

- Branch `br-misty-moon-b2be9vmt`; endpoint `ep-royal-star-b253pvlk`; database `neondb`.
- PostgreSQL `18.6 (4e955f5)`; inspecting connection role `neondb_owner`.
- Pooled host `ep-royal-star-b253pvlk-pooler.c-6.eu-central-1.aws.neon.tech`.
- Direct host `ep-royal-star-b253pvlk.c-6.eu-central-1.aws.neon.tech` also reports the exact branch/endpoint/database. This probe used Neon HTTPS SQL, not a logical replication connection.
- `wal_level=replica`; `max_replication_slots=10`; `max_wal_senders=10`.
- No `powersync_role`, publications, or logical replication slots. SELECT grants cannot be established for the absent replication role; all 16 source tables lack the required publication/grant readiness.
- All source tables have default replica identity and primary keys. Existing two slots are Neon physical slots, not PowerSync logical slots; their presence does not prove CDC readiness.

Neon enables logical replication **per project**, permanently changes WAL configuration for all its databases, and restarts all computes. The royal-star branch authorization does not establish whether every compute in its parent project is disposable. The user requested skipping unresolved hosting/Neon setup and returning reviewer material. Do not enable this setting until the project scope is established as safe; if it includes production, the no-production-configuration constraint requires a revised, separately authorized database topology. The dedicated replication role also requires Neon Console/CLI/API provisioning; SQL-created roles cannot be manually given REPLICATION. Use a direct connection for logical replication. [Official Neon instructions](https://neon.com/docs/guides/logical-replication-neon).

No database mutation occurred. Evidence: [preflight](phase26-validation/preflight.json). Reproduce with `node backend/scripts/inspect-phase26.mjs`; it refuses any other configured/server-reported branch identity and never falls back to root `DATABASE_URL`.

## C. RSA/JWKS alignment

A new dedicated 3072-bit RSA signer was generated in the Git-ignored `.env.phase26-validation.local`. `git check-ignore` confirmed exclusion. No production private key was used. The file contains only the validation private key, KID, and shared logging flag, not an operational stack configuration. The preparation script never overwrites an existing signer.

Prepared public metadata: `kid=gaffer-phase25-validation-1`, `alg=RS256`, `kty=RSA`, `use=sig`. Public-key SHA-256 fingerprint over canonical `{e,kty,n}` JSON: `e95d24eabd9c3f516e737dcc71b309c2f4df7fc973f12588f2b768c878f942bd`. RFC 7638 thumbprint: `6V0k6r2cP1Fuc33McbMJwvTff8lz8SWI8rdoyHj5Qr0`. A local RSA-SHA256 challenge signature verified against the public key.

Evidence: [signer metadata](phase26-validation/validation-signer.json), [public-only JWKS](phase26-validation/validation-public-jwks.json). Reproduce preparation with `node backend/scripts/prepare-phase26-signer.mjs`.

**Not activated in a running backend, not published at `GET /sync/jwks`, not trusted by Cloud.** The current configured backend remains HS256 / `gaffer-dev`. Fresh HTTP 200 at the existing Cloud-configured production JWKS still publishes RS256 / `gaffer-production-1`, fingerprint `ad928487779412d50ebc58d312c6f927e9d18cb50e7333b3e48f4dd00c53cbd1`.

Validation JWKS URL: UNKNOWN until hosting is identified. Configure the new instance to that validation backend's `/sync/jwks` only after verifying the public key and fingerprint. The existing token contract emits no issuer; do not add a required issuer. Before saving, compare token `aud`, new instance endpoint, and accepted audience byte-for-byte. No signature verification was weakened.

## D. Stream validation/deployment

Only `powersync/sync-config.yaml` was used. No recovery sync file was read for deployment or used as a payload.

- Current raw local SHA-256: `5d2f6b9a0241d5e344c00aecac3789dc853cee9e337ded596e088001d788147e`.
- LF-normalized SHA-256: `cbbbe2dcb69f66f29e3ec6da1aaf9b6e3ce46ea1863edefc4e7cef35d3e3ead2`, exactly the authoritative Phase 2.5 hash.
- Explanation: Windows checkout has 640 CRLF line endings. Git reports no sync-config diff; there is no query/content change.
- Fetched existing Development config is **byte-for-byte identical** to current local bytes, with the same raw hash, active revision `15`. This establishes the current file is already present on Development, but does not establish an isolated validation deployment.
- All 22 streams are present: 12 private and 10 shared. Required shared streams: `shared_session_match_events`, `shared_session_match_observations`, `shared_session_match_memberships`, `shared_session_match_reviews`, `shared_session_match_operations`, `shared_session_match_projections`, `shared_session_match_clock_operations`, `shared_session_report_state`, `shared_session_report_sheets`, `shared_session_report_fixture_scores`.
- After an initial automatic approval rejection, the user explicitly approved supplemental read-only validation against Development. The exact main file **passed Cloud sync-config validation**, child exit 0, captured `2026-10-05T09:05:28.559Z` (11:05:28 SAST). Service schema/connection tests were intentionally skipped with `--validate-only sync-config`; their displayed passed flags are skip markers, not test passes. No deployment occurred. Evidence: [Cloud validation](phase26-validation/cloud-validate.json).
- Validation-instance Cloud validation: NOT RUN. Validation deployment: NOT RUN. New revision and timestamp: UNKNOWN.

Evidence: [comparison](phase26-validation/stream-comparison.json), [scaffold schema validation](phase26-validation/scaffold-validation.json). Once the isolated source/auth prerequisites are satisfied, validate the exact main file and use `powersync deploy sync-config` with an explicit validation instance ID and main-file path. The official CLI supports separate sync-config deployment; do not deploy the old service template. [CLI reference](https://github.com/powersync-ja/powersync-cli/blob/main/cli/README.md).

## E. Token/client authentication

No two fresh registered coaches or actual PowerSync clients were created/connected. The isolated endpoint, public validation JWKS, and replication source are not ready. No JWT was printed. **PSYNC_S2101 is not demonstrated gone.** Historical 401/key-selection evidence remains historical, not a new reproduction.

## F. Friendly real-client result

NOT RUN. Fresh fixture identity, independent browser connections, bidirectional action → upload receipt → canonical row → stream row → peer local row → rendered UI remain unproven. No HTTP refetch/polling result is presented as PowerSync delivery.

## G. Competition real-client result

NOT RUN. Distinct sheet IDs/common session, actual sides, event/score/clock convergence, bilateral confirmation, one canonical report/session/competition result and duplicate standings exclusion remain pending.

## H. Review delivery

NOT RUN. Two observations/one candidate with distinct player IDs, candidate delivery, resolution delivery and dispute delivery through real clients remain pending. Prior HTTP coverage is retained separately.

## I. Clock result

NOT RUN in real browsers. No new clock request or backend 500 occurred in this session; this is not a 500-free acceptance result. Prior backend transition/retry/concurrency results and intentional conflicting-operation 409 remain historical coverage only.

## J. Revocation/cache behavior

NOT RUN with a warm connected client. HTTP denial, no new rows using an old accepted token, removal of downloaded rows, reconnect and token-refresh behavior remain acceptance gates. Prior code inspection found persistent per-user caches after logout; offline cached data cannot be assumed erased. Actual revocation/bucket-removal behavior and third-team Cloud isolation are unverified.

## K. Offline replay

NOT RUN, as required before online acceptance. Upload-once, canonical idempotency, peer convergence and review replay remain pending. Historical HTTP offline results are not real PowerSync replay proof.

## L. Peer privacy inspection

NOT RUN. There are no actual synced peer local rows to inspect for athlete IDs, tactics, plans/settings, private notes, injury detail, nested review private IDs, private corrections, or operation reasons. YAML/HTTP coverage cannot satisfy this gate.

## M. Test/release-gate results

Fresh checks: branch-pinned read-only database inspection passed for both endpoint forms; authenticated Cloud inventory/config/status succeeded; public configured JWKS HTTP 200; exact deployed-content comparison passed; explicit Cloud sync-config validation passed; scaffold schema validation passed; dedicated RSA sign/verify passed; syntax checks for all three new scripts and `git diff --check` passed. Approved Cloud creation failed with the account's instance-plan limit. No new backend/frontend test totals or post-alignment acceptance run are claimed.

Historical handoff results only: backend 824/824, frontend node tests 51/51, focused 61/61 including Phase 1 18/18, requested HTTP suites 41/41. The unrelated frontend build blocker remains in unchanged landing files (`gaffer-stadium.ts`, `landing-scene.ts`); Phase 2.5 reproduced identical base/current diagnostics. It was not fixed or rerun here.

The CLI install changed some tracked npm cache entries despite the ignore rule; those session-generated tracked changes were restored to the initially clean checkout. Downloaded CLI files remain in the ignored cache. No application dependency manifest/lockfile was changed.

## N. Remaining blockers

1. PowerSync account instance capacity: the user approved creation, but Cloud rejected it with `PLAN_LIMIT_REACHED`. The schema-valid scaffold is ready. An operator must supply an authorized isolated instance or resolve account capacity; no subscription change/deletion was performed.
2. Safe Neon project scope and management access to enable logical replication and create the dedicated replication role; then branch-only publication/SELECT grants and slot health. Do not alter a project containing production under the current rules.
3. Public validation backend hosting target, RSA secret installation, `GET /sync/jwks` verification, and matching frontend/API/database/PowerSync URLs.
4. Validation instance auth/audience configuration, exact main-file validation and sync-only deployment with recorded revision/time/content comparison.
5. Working browser runtime and all actual-client authentication/delivery/review/clock/revocation/offline/privacy gates, including third-team isolation.
6. Separate unrelated frontend production-build blocker.

Initial automatic approval rejections were resolved by explicit user approval. Read-only validation then succeeded; creation then failed at the Cloud plan limit. No approval request remains for those attempted actions. Hosting and Neon setup were skipped at the user's request; their missing prerequisites remain technical blockers.

## O. Recommendation

**PHASE 2 BLOCKED — POWERSYNC AUTH**. Deployment/source readiness and real client delivery are also blocked. Phase 1 remains accepted; Phase 2 backend work remains provisionally accepted. Do not begin lineup/layout work.

## PASTE THIS BACK TO THE REVIEWER

- Validation PowerSync instance ID: NOT CREATED; prepared name `Phase 2.6 isolated validation`, region `eu`, org `6aac1ea304e93a0007fcb0bf`, project `6aac1ed66860dd000702696f`. User approved creation; Cloud rejected it with `PLAN_LIMIT_REACHED` (instance capacity exhausted).
- Existing instance `6aac1ed7a77ca1231d28f82d` is Development, connected to blue-hill; unsafe for isolated royal-star validation; unchanged.
- Validation DB: branch `br-misty-moon-b2be9vmt`, endpoint `ep-royal-star-b253pvlk`, PostgreSQL 18.6. Both pooled/direct endpoint identities verified. WAL is replica; role/publication/logical slot absent. Logical replication requires a permanent project-wide change; project isolation/access unestablished.
- Current backend signer: HS256 / `gaffer-dev`. Prepared independent validation signer: RS256 / `gaffer-phase25-validation-1`, local ignored secret only; public fingerprint `e95d24eabd9c3f516e737dcc71b309c2f4df7fc973f12588f2b768c878f942bd`.
- Existing PowerSync configured JWKS: `https://gaffer-api-ynaf.onrender.com/sync/jwks`; fresh public source RS256 / `gaffer-production-1`. Cloud cached accepted keys are not directly exposed; validation accepted alg/KID and public JWKS URL remain unconfigured.
- Current sync-config raw hash `5d2f6b9a0241d5e344c00aecac3789dc853cee9e337ded596e088001d788147e`; LF hash equals authoritative `cbbbe2dcb69f66f29e3ec6da1aaf9b6e3ce46ea1863edefc4e7cef35d3e3ead2`. Existing Development revision 15 is byte-identical and healthy. All ten shared streams present. Exact main file passed explicit read-only Cloud sync-config validation on Development. No isolated deployment; deployment timestamp unknown.
- PSYNC_S2101 disappeared: NOT PROVEN. Friendly/competition two-client results, browser clock, review delivery, revocation/cache, offline, third-team isolation and actual peer privacy: NOT RUN.
- Blockers: Cloud instance-plan limit, safe Neon project/replication role, public validation hosting/auth/deployment, browser runtime, real acceptance gates; unrelated frontend build blocker separately retained. User requested unresolved hosting/Neon setup be skipped and this report returned to the reviewer.
- Recommendation: **PHASE 2 BLOCKED — POWERSYNC AUTH**. No production/shared-instance repoint, database mutation, production key use, forensic repair, UI work or commit.

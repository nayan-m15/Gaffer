# S3: Concurrent Event Logging — implementation plan

## Implementation status (26 September 2026)

The current branch implements independent observations and coach-reviewed candidate pairs. Review operations record causal parents and support explicit merge, separate, conflict, late void, and late correction cases. PowerSync carries observation, membership, and operation evidence to the review panel. Uploads retry transient server failures, and match displays derive their score from the event list when available. PGlite migration tests, all 542 backend tests, backend build and lint, and frontend production build and lint pass.

Observation, review, correction and void commands now update evidence, audit operations and projection revisions under one per-match database lock. Migration `0037_concurrent_event_resolution.sql` upgrades databases that already applied S3's first migration. Upload receipts are written separately, with retries regenerating the same result from the immutable observation or operation ID. Competition results publish on finalisation; an amendment keeps the prior linked fixture score. Unresolved candidate events are excluded from player statistic counts. The production PWA test and all six mocked offline logging browser tests pass on both desktop and emulated mobile Chromium.

Rollout still needs a reliable PostgreSQL multi-device integration run and the physical-device checklist. The isolated remote test database accepted the migration, but the end-to-end test repeatedly encountered Neon connection aborts during unrelated auth and match requests; it cannot be counted as a pass. The SQL pair resolver now preserves a second same-event edge and correction details when a three-witness merge is split. More arrival-order combinations and physical devices remain a rollout gate.

## Goal and scope

Two or more authorised coaches/assistants can record the same match independently, including while offline. After reconnecting in any order, every device reaches the same event history and result. A retry creates no second action; a possible duplicate keeps both observations for coach review. This card is the collaboration and convergence slice of the broader [offline collaborative logging plan](offline-collaborative-event-logging-plan.md), not a rebuild of offline capture.

Assumed first release: football match events already supported by the live logger; internet-based eventual sync; coach resolves ambiguous incidents; assistants capture and can propose corrections. Peer-to-peer sync and shootouts are outside this card.

## What is already present

- Browser SQLite/PowerSync storage and an offline upload queue: `frontend/src/offline/match-store.ts`, `frontend/src/features/matches/api.ts`.
- Authenticated bounded uploads, receipts and a retry path: `backend/src/sync/`.
- Immutable observation, membership, review and projection tables, plus a per-match ingestion lock: `backend/drizzle/0021_swift_skullbuster.sql` and later migrations.
- Shared reconciliation logic and ordering fixtures: `packages/match-domain/`.
- A duplicate-review panel and provisional/confirmed score display: `frontend/src/offline/EventReviewPanel.tsx`, `frontend/src/pages/LiveMatchPage.tsx`.
- Database and browser test starting points: `backend/test/offline-sync.e2e-spec.ts`, `e2e/offline-event-logging.spec.ts`, `e2e/pwa-production.spec.ts`.

## Gaps to close before calling S3 done

1. **Independent actions are grouped too early.** The SQL ingestion function assigns observations within five seconds to the same canonical event before the coach decides. The intended rule is to keep independent IDs as separate evidence and mark a _candidate relationship_ for review. Nearby genuine goals must remain recoverable as two goals. The shared `reconcileMatch` function models candidate edges but the backend currently imports only `projectCanonicalEvents`; reconcile the implementations into one authoritative rule set.
2. **Resolution and corrections need replayable semantics.** `resolveEventReview` mutates canonical rows/memberships, and correction/void paths update rows directly. Define operation targets by observation IDs, causal parents, persistent “separate” decisions, superseding decisions, and behavior when a late observation arrives after merge, split, correction or void. Preserve legacy event IDs and an alias/history mapping when canonical identities change.
3. **Atomicity ends before the upload receipt.** Observation ingestion runs inside a PostgreSQL statement transaction, while `syncUploadReceipts` is written afterward by the controller. Make accepted evidence, reconciliation, projection and receipt one durable outcome, or make receipt regeneration on retry provably safe. Apply the same per-match serialization to review/correction/void/finalisation operations and revision updates.
4. **Review is limited in the client.** The panel fetches reviews from the API on open and offers only same/separate. It needs reactive synced review data, observer and event details, correction/void decisions, pending/accepted state, conflict feedback and an audit trail. A queued resolution must remain visible until acknowledged; another coach's decision must invalidate stale actions.
5. **Results can be read across revisions.** Events and projection state are streamed in separate tables and read separately. Render a coherent revision, including the local pending overlay, so a score from revision N never appears with an event list from N−1. Audit match reports, statistics, public outputs and competition fixture results for the same effective-event policy; current statistics and fixture counts include every non-voided goal, including `needs_review`.
6. **Convergence coverage is narrower than the card.** The existing integration test covers two concurrent uploads and a retry. Add multi-account/multi-device arrival-order, genuine close actions, conflicting resolutions, late evidence, membership revocation and production-PWA tests. Run the physical-device checklist in `docs/offline-field-test.md` before rollout.

## Implementation sequence

| Step                            | Work                                                                                                                                                                                                                                                                                                                                     | Exit gate                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Contract and fixtures        | Write versioned observation/operation semantics and expected score states. Add replay fixtures for duplicate, genuine close events, time-window chains, penalty disagreement, card/dismissal, late observation, correction and conflict. Decide whether the live provisional estimate includes ambiguous actions; label it consistently. | Each fixed input set yields the same semantic state and digest across all permutations. No independent observation is silently discarded.         |
| 2. Reconciliation and migration | Use one domain reconciler from the backend; store separate immutable observations, candidate groups, decisions and membership history. Replace the ingestion auto-group rule. Add an additive migration/backfill and compare legacy match outputs before activation.                                                                     | Same/separate/void/correct survive replay and late uploads; old matches retain their published result unless explicitly amended.                  |
| 3. Transactional commands       | Process bounded upload items with per-match serialization and durable receipts. Validate actor/team/match/player scope and operation permissions at upload time. Use expected revisions and causal parents for concurrent decisions; preserve dependency-pending and recoverable rejection behavior.                                     | Parallel upload/retry/crash tests show one outcome, no lost observation, no partial projection, and identical IDs with different payloads reject. |
| 4. Match-day UI                 | Subscribe to canonical events, reviews and projection; merge pending entries by observation ID. Add complete review actions and history, stale-decision handling, clear provisional/confirmed/possible-effect labels and finalisation blocking while reviews are open.                                                                   | Coach and assistant devices show the same revision after queue drain; pending work is never double-counted or silently removed.                   |
| 5. Consumer migration           | Feed reports, player statistics, public match data and competition results from the effective canonical projection or a documented matching view. Keep full-time separate from result finalisation; late uploads after finalisation open an amendment review.                                                                            | All consumers agree for the same revision; no unresolved event changes an official finalised result.                                              |
| 6. Verification and rollout     | Run domain permutation tests, isolated PostgreSQL integration tests, production-build PWA tests and the Android/iOS field checklist. Activate by match/team behind the existing staged rollout controls and watch queue age, rejections, replication lag and unresolved reviews.                                                         | Three devices logging one match converge after reconnect in every tested order; a rollback leaves already queued operations uploadable.           |

## Acceptance scenarios

- A and B independently log the same goal offline: two immutable observations, one review, one goal after a coach selects “same event,” on every device.
- A and B log two genuine goals within five seconds: “separate events” preserves two goals and the decision persists through replay and later evidence.
- The same ID is uploaded repeatedly, including after a lost response: one effect. Reusing the ID with changed content is rejected and recoverable.
- A correction or void arrives before a late duplicate: the previous decision is not silently reversed; new evidence reopens review when needed.
- Two coaches make incompatible decisions: no upload-order winner; a later explicit resolution supersedes the conflict.
- Simultaneous uploads, a failed transaction and a process restart leave no partial score/event/review state.
- An assistant loses membership while offline: their pending data stays with that account, cannot upload under another identity, and is not exposed through team streams.
- After all queues drain, canonical events, score, cards, review state and digest converge across three devices. Finalisation requires a coach and no known open reviews; late evidence triggers an amendment path.

## Decisions to settle in step 1

- Which event families trigger candidate review and what clock-confidence/time window each uses. Five seconds is only an initial heuristic.
- Whether unresolved candidate actions contribute to a clearly labelled live estimate. They never contribute to the confirmed subtotal or a finalised result without a decision.
- Whether a review decision may be made offline; if yes, it must carry expected revision/causal parents and present a clear conflict on reconnect.

Do not mark S3 complete based on the existing plan's “completed” status. That document covers the broader offline slice; the code paths and acceptance gates above are the specific remaining work for concurrent logging.

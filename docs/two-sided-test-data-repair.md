# Two-sided fixture test-data repair (read-only dry run)

Run only against the intended dev/test database. Save the database identity, timestamp and query output with the review ticket. The report makes no changes. Fixture UUIDs distinguish reverse round-robin legs; never group by the unordered team pair.

```sql
BEGIN TRANSACTION READ ONLY;
WITH fixtures AS (
  SELECT 'competition'::text AS kind, id, shared_session_id
  FROM competition_fixtures
  UNION ALL
  SELECT 'friendly', id, shared_session_id FROM friendly_fixtures
), sheets AS (
  SELECT f.kind, f.id AS fixture_id, f.shared_session_id AS fixture_session_id,
         e.id AS event_id, e.team_id, e.status AS event_status,
         m.id AS match_id, m.shared_match_id AS match_session_id,
         m.is_home, ps.finalisation_state,
         ps.confirmed_team_score, ps.confirmed_opponent_score
  FROM fixtures f
  JOIN events e ON (f.kind = 'competition' AND e.competition_fixture_id = f.id)
               OR (f.kind = 'friendly' AND e.friendly_fixture_id = f.id)
  JOIN matches m ON m.event_id = e.id
  LEFT JOIN match_projection_state ps ON ps.match_id = m.id
), candidates AS (
  SELECT kind, id AS fixture_id, shared_session_id AS session_id FROM fixtures
  UNION
  SELECT kind, fixture_id, match_session_id FROM sheets
), multiple_sessions AS (
  SELECT kind, fixture_id, array_agg(session_id ORDER BY session_id) AS session_ids
  FROM candidates WHERE session_id IS NOT NULL
  GROUP BY kind, fixture_id HAVING count(*) > 1
), completed AS (
  SELECT kind, fixture_id, count(*) AS completed_count
  FROM sheets WHERE event_status = 'completed'
  GROUP BY kind, fixture_id HAVING count(*) > 1
)
SELECT 'null_linked_sheet' AS finding, s.kind, s.fixture_id,
       jsonb_build_object('fixtureSessionId', s.fixture_session_id,
         'eventId', s.event_id, 'teamId', s.team_id, 'matchId', s.match_id,
         'isHome', s.is_home) AS evidence,
       'Inspect participants and observations; relink only an unambiguous recent test sheet.' AS suggested_action
FROM sheets s
WHERE s.fixture_session_id IS NOT NULL AND s.match_session_id IS NULL
UNION ALL
SELECT 'multiple_candidate_sessions', c.kind, c.fixture_id,
       jsonb_build_object('sessionIds', c.session_ids,
         'sheets', (SELECT jsonb_agg(to_jsonb(s)) FROM sheets s
                    WHERE s.kind = c.kind AND s.fixture_id = c.fixture_id)),
       'Stop relinking; preserve both sessions and observations for explicit reconciliation.'
FROM multiple_sessions c
UNION ALL
SELECT 'duplicate_completed_fixture_result_candidates', c.kind, c.fixture_id,
       jsonb_build_object('completedCount', c.completed_count,
         'sheets', (SELECT jsonb_agg(to_jsonb(s)) FROM sheets s
                    WHERE s.kind = c.kind AND s.fixture_id = c.fixture_id
                      AND s.event_status = 'completed')),
       'Compare completed sheet results with the single fixture result and API standings; do not delete sheets.'
FROM completed c
ORDER BY kind, fixture_id, finding;
ROLLBACK;
```

The third finding deliberately reports **candidate** duplicate results: two completed owning sheets are normal after both teams finish. They must contribute only one fixture result to standings. Inspect `competition_fixtures` (including `linked_match_id`, `manual_match_id`, home/away scores), the report API and competition results API to determine whether a candidate is an actual historical duplicate. The fixture primary key prevents two stored fixture rows with the same ID. Orphan sessions without a fixture/sheet link cannot safely be assigned from team-pair similarity; inspect them separately and preserve them.

Manual repair, limited to recent dev test fixtures:

1. Take a database snapshot/backup and verify it can be restored into a separate test database. Export the exact fixture, both events/sheets, participants, projections, observations, operations, reviews and session rows, including original values and IDs. Record the database identity and reviewer approval.
2. Compare both coaches' authenticated event-link diagnostics. Verify the fixture's exact home/away participants (friendlies: requester-home/acceptor-away), current membership, both event foreign keys and every session candidate. Inspect observations and decisions on both sheets. A conflict, orphan observation, already published/finalised result or uncertain participant assignment requires explicit reconciliation; stop this relink procedure.
3. In an operator-controlled transaction, lock the exact fixture, events and sheets; rerun the report and checks. For an unambiguous null-linked test sheet only, set `matches.shared_match_id` to the verified fixture session and `is_home` to the verified participant side, with an exact match-ID predicate plus `shared_match_id IS NULL`. Require exactly one affected row. Do not overwrite a non-null link, alter event/fixture/session IDs, move observations, merge sessions or delete anything. Save before/after values in the review ticket. Run the diagnostics/report again before committing; roll back if any assertion fails.
4. After commit, check both accounts' session report, timeline, clock, confirmations and private squad. For a generated fixture, check that standings contain one result only after review/confirmation rules allow publication. Keep the backup and review evidence.
5. Rollback: before commit use `ROLLBACK`. After commit, stop writes on the affected test fixture, inspect all changes since the repair, then restore only the recorded sheet link/side in a reviewed transaction with an exact-ID and expected-after-value predicate. If new observations or finalisation occurred, do not unlink underneath them: restore the backup into a separate database for comparison and obtain a new reconciliation review. Never restore an entire shared environment over unrelated newer data.

Validation recipe (no mutation by this document): in an isolated fixture dataset, include one null-linked sheet with a fixture session, one fixture whose sheets reference two different sessions, and two completed sheets for one fixture. The query must return the three corresponding findings, retain all IDs, and leave row counts and link values unchanged. Validation on 2026-10-04: the exact query ran successfully in a read-only transaction on the isolated test database (zero findings). A second read-only query shadowed the source tables with synthetic VALUES rows and returned exactly the three required findings. No persistent rows were inserted, updated or deleted.

## Latest dry-run review

### Applied historical reconciliation (5 October, subsequent to the assessment below)

The user authorized choosing results because these historical scores need only agree for both coaches. Applied `reconcile-two-sided-history.mjs --apply-blue-hill` to the pinned Development source in one transaction. Kept published competition results: `35f00ca4` **1-0**, `71cc8d48` **3-3**, `ccc81418` **2-1**, `fd41392c` **0-3**; chose **1-1** for friendly `16ab1963`. These are administrative test-data choices, not claims about the actual games.

Both sheets now reference each exact fixture's common session, with participant-derived home/away identity. Reassigned dependent observation/canonical/projection/review/operation/clock session identities together. Retained the earliest non-voided goals per true side needed for the chosen scores and marked ten excess canonical goals voided. Preserved all observation payloads, observation IDs, memberships, original sessions, sheet IDs, private setup and competition results. Refreshed projections and cleared obsolete finalisation/confirmations; no coach confirmations were fabricated. **Both coaches must reconfirm these repaired results.** Existing published competition scores remain stored and were not republished by this operation.

Before the write, exported all public-table rows plus table/enum/constraint/index/PLpgSQL function/trigger definitions under ignored `docs/phase-history-validation/repair-backup-*.json`. Restored the actual public schema/data into PGlite, including live constraints/triggers, rehearsed the repair and proved transaction rollback restored all affected tables exactly. This backup excludes platform roles, replication slots, managed extensions and sequence counters; it supports scoped row recovery, not a complete hosted database restore. The repair SQL/selected canonical IDs and result are retained locally. Its live transaction locks affected tables, compares exact affected rows against the snapshot and asserts final scores/session/participant counts. The helper refuses already reconciled sheets.

`verify-reconciled-history.mjs --blue-hill` calls the current built `MatchesService.getSessionReportForSheet` using each owning coach's actual identity. All five pairs produce identical complete report DTOs: score, session, public timeline, full-time clock, participants and `awaiting_confirmation`. Observation payloads and membership identity links remain unchanged; membership projection revisions advance with projection refresh. Competition fixture scores/manual results remain unchanged. The release audit now reports **zero multiple-session or null-linked-sheet findings**. Completed-sheet candidate findings remain expected because both sheets were retained; they do not establish duplicate standings.

Journal review: `review-migration-journal.mjs --blue-hill` compared all 61 recorded journal rows with current SQL and historical Git blobs (LF/CRLF equivalents), and exported the live catalog. Of the 13 rows at unfamiliar timestamps, five match current SQL at shifted timestamps, seven match historical Git SQL, and one has an unmatched hash. Another unmatched hash occurs at the current concurrent-event timestamp: **two hashes lack Git provenance in total** (journal IDs 2 and 41). Historical hashes for 0028 and 0042 match older Git versions. The source journal also assigns the same timestamp to 0024 offline hardening and 0027 fixtures; a timestamp alone cannot identify either migration. Current schema objects cannot prove past season/competition backfills ran.

Corrected the release audit to recognize matching SQL content recorded at a different timestamp, removing false missing/changed reports for 0003, 0012 and concurrent-event candidates. Eleven current files still lack exact matching journal content; that is preserved provenance drift, not authorization to replay their SQL. No journal rows/hashes/timestamps were changed, no old migrations were replayed, and no new schema migration is required for this repair. The release audit still exits 1 for journal drift and retained completed-sheet candidates. The requested journal **review** is complete; a future journal rewrite would need independently established provenance, particularly for the two unmatched hashes.

### Exact-record reconciliation assessment (5 October, after 67a301f3)

Read all four two-sided documents and reviewed the last six branch commits, from `1b79e97a` through `67a301f3`. The latest commit installed 0052/0053 and verified transport; none repaired historical data. Reran the development release audit: all three integrity function bodies match and source publication/grants pass. Three conflicting competition fixtures and two null-linked sheets remain, alongside migration-journal drift (13 unknown entries).

`node backend/scripts/inspect-two-sided-history.mjs --blue-hill` now exports the exact affected fixtures, events, sheets, participants, session state, projections, observations, memberships, operations, reviews, clocks, competition teams/results and current team memberships in one repeatable-read, read-only transaction. It pins endpoint/branch identity and saves timestamped evidence under ignored `docs/phase-history-validation/`. This is evidence containing private data, not a full recoverable database backup; keep it out of Git. The run exported 12 sheets, eight sessions and 55 observations/canonical events across six candidate fixtures. The sixth fixture has only the completed-sheet candidate finding, which alone does not prove duplicate standings.

Goal counts below are non-voided recorded canonical goals in **home/away fixture perspective**, calculated from the owning team's actual participant identity. They are evidence, not approved final scores or duplicate decisions.

| Fixture | Finding | Published home-away score | Recorded home sheet / away sheet | Required decision |
| --- | --- | --- | --- | --- |
| `35f00ca4-642e-410e-a4b2-9190f759fd85` | Two one-sided sessions | 1-0 | 2-0 / 0-3 | Identify authoritative goals/result; neither sheet agrees with publication. |
| `71cc8d48-d7b4-4bb0-89dc-e6a9644d353d` | Two sessions; away sheet incorrectly home | 3-3 | 3-3 / 0-0 | Retain or amend published result; correct side and preserve voided card evidence. |
| `ccc81418-259c-430a-a0b0-2bbc2ccea8ae` | Two finalised projections; away sheet incorrectly home | 2-1 | 2-1 / 2-1 | Decide which goal observations describe the same events; do not sum to 4-2. |
| `fd41392c-429f-42ee-80a3-f72af3195323` | Away sheet null-linked, with observations and finalised projection | 0-3 | 2-1 / 0-3 | Choose authoritative goals/result; existing home confirmation must be reconsidered. |
| `16ab1963-b32d-4f81-bc42-cd203a59839d` | Friendly away sheet null-linked, with observations and finalised projection | No published fixture score | 1-0 / 0-1 | Determine whether these are distinct goals (1-1) or erroneous observations. |

Every affected sheet is completed and contains observations. **Zero sheets qualify for the empty-sheet attachment procedure.** Merely setting `shared_match_id` would leave canonical events/observations/projections/clock operations on their original sessions (or null), and could retain stale confirmation/publication. Choosing a session alone cannot reconcile these records.

No historical writes were performed. Requested an explicit outcome: preserve historical records with authoritative result/goal decisions, or replace confirmed disposable test fixtures. Before applying a selected outcome, preserve a recoverable database snapshot, rehearse it on a separate restore, lock/revalidate exact records, retain original IDs/evidence and verify both reports and one standings result per fixture. Do not manufacture confirmations or silently change published scores.

Fresh validation after this assessment: the existing six focused backend suites pass **50 tests**; all **59 frontend tests** pass. Build results and the remaining deployment/UI work are recorded in the rollout notes. These tests do not approve any historical reconciliation.

Latest deployment follow-up (5 October): the user authorized blue-hill/Development. Migrations 0052/0053 were installed atomically after backing up their affected function/trigger definitions and journal, and proving object rollback in isolated PGlite. This is an object backup, not a full database backup or historical repair. The final audit verifies all three function bodies, enabled confirmation/clock triggers and source publication/grants. Existing journal drift/13 unknown entries, three conflicting fixtures and two null-linked sheets remain; the release audit correctly still exits 1. Fresh delivery fixtures use exact-ID cleanup. See [the delivery verification](two-sided-delivery-verification.md). The older reports below describe the source before deployment.

Evening follow-up (5 October): the separate test target's nine pending migrations were restored through 0053 without a schema reset. The final read-only audit reports zero historical findings, no missing/changed migrations and all required integrity objects; its release exit 1 reflects missing PowerSync publication/grants. Browser checks remain failed/incomplete as recorded in the plan. Development data was not migrated, relinked or reconciled. One longer browser run lost its schema-reset guard to an idle-transaction timeout; the schema remained present in the final audit.

The 5 October canonical result follow-up adds migration 0053 for future pending-confirmation invalidation. It performs no historical backfill, relinking or session reconciliation. Disposable tests prove both confirmation orders count one result per fixture and preserve reverse legs; they do not resolve the historical findings below. The configured blue-hill journal still lacks prerequisite 0052. Select the actual intended test source before migrations or any repair.

The 4 October configured-source audit found competing sessions with existing observations and published scores; these are outside the safe repair procedure. The original audit remains in Git history; current work is described in [the implementation plan](two-sided-live-logging-plan.md). Preserve these rows for explicit reconciliation review. Run `node scripts/check-two-sided-release.mjs dev` from backend for a read-only migration/source/link audit; use `test` for TEST_DATABASE_URL.

Follow-up on 5 October: rerunning `node scripts/check-two-sided-release.mjs dev` remains a failed read-only audit. It identifies three competition fixtures with competing session candidates and two null-linked sheets, plus completed-sheet result candidates. Migration 0052 is absent from the configured source journal. No relinking, reconciliation, deletion or migration was performed; these findings still require the exact-fixture procedure and deployment checks above.

Fresh-fixture verification follow-up (5 October): the development audit still reports those three conflicting competition fixtures and two null-linked sheets; both 0052 and 0053 are absent, along with their required attachment function/confirmation triggers. Development records were preserved. Only the separate `TEST_DATABASE_URL` received nine pending migrations through 0053 for fresh paired-account browser testing. Its read-only historical query returns zero findings, with no missing/changed migrations or integrity objects; the overall release audit still exits 1 because that API-only test database has no PowerSync publication/grants. A concurrent test-schema reset was identified and paused before restoring the test migrations. This is test-environment setup, not historical repair or development deployment.

The audit now reports `missingSchemaColumns` and stops before the historical query when shared-session prerequisites are absent. With the schema present, it also checks enabled clock/confirmation triggers and the safe attachment function rather than relying only on journal entries. These object checks establish installation, not deployed application flags or complete function-body equivalence.

At wrap-up, the last competition browser scenario encountered connection failures and then an absent `match_sessions` table during cleanup. The zero-finding/migration evidence above describes the earlier restored test schema, not its final state. Reaudit the dedicated test target after obtaining exclusive access; no additional migration, reset or historical repair was performed during wrap-up.

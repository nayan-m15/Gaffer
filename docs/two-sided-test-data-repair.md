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

Evening follow-up (5 October): the separate test target's nine pending migrations were restored through 0053 without a schema reset. The final read-only audit reports zero historical findings, no missing/changed migrations and all required integrity objects; its release exit 1 reflects missing PowerSync publication/grants. Browser checks remain failed/incomplete as recorded in the plan. Development data was not migrated, relinked or reconciled. One longer browser run lost its schema-reset guard to an idle-transaction timeout; the schema remained present in the final audit.

The 5 October canonical result follow-up adds migration 0053 for future pending-confirmation invalidation. It performs no historical backfill, relinking or session reconciliation. Disposable tests prove both confirmation orders count one result per fixture and preserve reverse legs; they do not resolve the historical findings below. The configured blue-hill journal still lacks prerequisite 0052. Select the actual intended test source before migrations or any repair.

The 4 October configured-source audit found competing sessions with existing observations and published scores; these are outside the safe repair procedure. The original audit remains in Git history; current work is described in [the implementation plan](two-sided-live-logging-plan.md). Preserve these rows for explicit reconciliation review. Run `node scripts/check-two-sided-release.mjs dev` from backend for a read-only migration/source/link audit; use `test` for TEST_DATABASE_URL.

Follow-up on 5 October: rerunning `node scripts/check-two-sided-release.mjs dev` remains a failed read-only audit. It identifies three competition fixtures with competing session candidates and two null-linked sheets, plus completed-sheet result candidates. Migration 0052 is absent from the configured source journal. No relinking, reconciliation, deletion or migration was performed; these findings still require the exact-fixture procedure and deployment checks above.

Fresh-fixture verification follow-up (5 October): the development audit still reports those three conflicting competition fixtures and two null-linked sheets; both 0052 and 0053 are absent, along with their required attachment function/confirmation triggers. Development records were preserved. Only the separate `TEST_DATABASE_URL` received nine pending migrations through 0053 for fresh paired-account browser testing. Its read-only historical query returns zero findings, with no missing/changed migrations or integrity objects; the overall release audit still exits 1 because that API-only test database has no PowerSync publication/grants. A concurrent test-schema reset was identified and paused before restoring the test migrations. This is test-environment setup, not historical repair or development deployment.

The audit now reports `missingSchemaColumns` and stops before the historical query when shared-session prerequisites are absent. With the schema present, it also checks enabled clock/confirmation triggers and the safe attachment function rather than relying only on journal entries. These object checks establish installation, not deployed application flags or complete function-body equivalence.

At wrap-up, the last competition browser scenario encountered connection failures and then an absent `match_sessions` table during cleanup. The zero-finding/migration evidence above describes the earlier restored test schema, not its final state. Reaudit the dedicated test target after obtaining exclusive access; no additional migration, reset or historical repair was performed during wrap-up.

-- Read-only integrity audit for a generated competition fixture.
-- Substitute the fixture UUID below. Run against the SAME Neon database used by Gaffer.
-- Source of truth: match_events, not PDF output or cached player stats.
-- One fixture should have a completed record and up to two own-side match sheets.
WITH fixture AS (
  SELECT id, competition_id, status, linked_match_id, shared_session_id
  FROM competition_fixtures
  WHERE id = '77f19d86-a5ad-4a8f-bfa9-e2c94e261d61'::uuid
), sheets AS (
  SELECT m.id AS match_id, e.team_id, e.status AS event_status,
         m.shared_match_id, e.competition_fixture_id,
         mps.finalisation_state, ms.finalised_at AS shared_finalised_at
  FROM fixture f
  JOIN events e ON e.competition_fixture_id = f.id
  JOIN matches m ON m.event_id = e.id
  LEFT JOIN match_projection_state mps ON mps.match_id = m.id
  LEFT JOIN match_sessions ms ON ms.id = m.shared_match_id
)
SELECT s.match_id, s.team_id, s.event_status, s.finalisation_state,
       s.shared_finalised_at, s.competition_fixture_id,
       count(me.id) FILTER (WHERE me.lifecycle_status NOT IN ('voided','needs_review')) AS stored_active_events,
       count(me.id) FILTER (WHERE me.team = 'own' AND me.event_type = 'goal' AND me.lifecycle_status NOT IN ('voided','needs_review')) AS own_goals,
       count(me.id) FILTER (WHERE me.team = 'own' AND me.event_type = 'assist' AND me.lifecycle_status NOT IN ('voided','needs_review')) AS own_assists,
       count(me.id) FILTER (WHERE me.team = 'own' AND me.event_type = 'goalkeeper_save' AND me.lifecycle_status NOT IN ('voided','needs_review')) AS own_saves,
       count(me.id) FILTER (WHERE me.team = 'own' AND me.event_type = 'yellow_card' AND me.lifecycle_status NOT IN ('voided','needs_review')) AS own_yellows,
       count(me.id) FILTER (WHERE me.team = 'own' AND me.event_type = 'red_card' AND me.lifecycle_status NOT IN ('voided','needs_review')) AS own_reds,
       count(me.id) FILTER (WHERE me.team = 'own' AND me.event_type IN ('goal','assist','goalkeeper_save','yellow_card','red_card') AND me.athlete_id IS NULL AND me.lifecycle_status NOT IN ('voided','needs_review')) AS unattributed_own_statistics
FROM sheets s
LEFT JOIN match_events me ON me.match_id = s.match_id
GROUP BY s.match_id, s.team_id, s.event_status, s.finalisation_state,
         s.shared_finalised_at, s.competition_fixture_id
ORDER BY s.team_id, s.match_id;

-- If own-side stat events are missing from these persisted rows, the problem
-- is upstream in event recording or publication, not in the leaderboard.
-- Opponent-side observations typically have opponent_player_id instead of
-- athlete_id; do NOT blindly credit them as a second copy of own-side events.

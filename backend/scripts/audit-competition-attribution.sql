-- READ ONLY: run in Neon SQL Editor. Includes only the two investigated fixtures.
-- Each unresolved or ambiguous opponent label is shown for manual review.
WITH affected_fixtures(id) AS (
  VALUES ('1bdea8a2-ec35-43ae-a998-7521546ac3fa'::uuid),
         ('77f19d86-a5ad-4a8f-bfa9-e2c94e261d61'::uuid)
), candidate_events AS (
 SELECT f.id AS fixture_id, me.id AS event_id, me.match_id,
        me.event_type, me.minute, me.opponent_label,
        CASE WHEN ct.id = f.home_competition_team_id THEN away_ct.team_id
             ELSE home_ct.team_id END AS opponent_team_id
 FROM match_events me
 JOIN matches m ON m.id = me.match_id
 JOIN events e ON e.id = m.event_id
 JOIN competition_fixtures f ON f.id = e.competition_fixture_id
 JOIN affected_fixtures af ON af.id = f.id
 JOIN competition_teams ct ON ct.team_id = e.team_id AND ct.competition_id = f.competition_id
 JOIN competition_teams home_ct ON home_ct.id = f.home_competition_team_id
 JOIN competition_teams away_ct ON away_ct.id = f.away_competition_team_id
 WHERE f.status = 'completed' AND e.status = 'completed'
   AND ct.id IN (f.home_competition_team_id, f.away_competition_team_id)
   AND (m.shared_match_id IS NULL OR m.shared_match_id = f.shared_session_id)
   AND me.team = 'opponent'
   AND me.event_type IN ('goal','assist','goalkeeper_save','yellow_card','red_card')
   AND me.lifecycle_status NOT IN ('voided','needs_review')
)
SELECT ce.fixture_id, ce.event_id, ce.match_id, ce.event_type,
       ce.minute, ce.opponent_label, ce.opponent_team_id,
       COUNT(a.id)::int AS roster_matches,
       (array_agg(a.id) FILTER (WHERE a.id IS NOT NULL))[1]::text AS matched_athlete_id,
       CASE WHEN COUNT(a.id) = 1 THEN 'resolved'
            WHEN COUNT(a.id) = 0 THEN 'not_matched'
            ELSE 'ambiguous' END AS attribution_status
FROM candidate_events ce
LEFT JOIN athletes a ON a.team_id = ce.opponent_team_id
  AND ce.opponent_label ~ '^#[0-9]+[[:space:]]+'
  AND a.squad_number::text = substring(ce.opponent_label from '^#([0-9]+)')
  AND lower(trim(a.first_name || ' ' || a.last_name)) =
      lower(trim(regexp_replace(ce.opponent_label, '^#[0-9]+[[:space:]]+', '')))
GROUP BY ce.fixture_id, ce.event_id, ce.match_id, ce.event_type,
         ce.minute, ce.opponent_label, ce.opponent_team_id
ORDER BY ce.fixture_id, ce.minute, ce.event_id;

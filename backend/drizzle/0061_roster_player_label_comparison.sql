-- An opponent event that points at a roster player stores a generated display
-- label ("Opponent #1", "Opponent #9 Smith"). Reading that label as the
-- player's name made an unnamed roster player "conflict" with every named
-- scorer on the other sheet, so genuine cross-sheet duplicates were never
-- offered for review. The roster row is authoritative; only free-text entries
-- without a roster player fall back to parsing the label.
CREATE OR REPLACE FUNCTION match_event_player_comparison(p_left match_events, p_right match_events)
RETURNS integer LANGUAGE plpgsql STABLE AS $$
DECLARE v_left_name text; v_right_name text; v_left_number integer; v_right_number integer;
BEGIN
  IF p_left.athlete_id IS NOT NULL AND p_right.athlete_id IS NOT NULL THEN
    RETURN CASE WHEN p_left.athlete_id = p_right.athlete_id THEN 1 ELSE -1 END;
  END IF;
  IF p_left.match_id = p_right.match_id AND p_left.opponent_player_id IS NOT NULL AND p_right.opponent_player_id IS NOT NULL THEN
    RETURN CASE WHEN p_left.opponent_player_id = p_right.opponent_player_id THEN 1 ELSE -1 END;
  END IF;
  SELECT lower(trim(first_name || ' ' || last_name)), squad_number INTO v_left_name, v_left_number
    FROM athletes WHERE id = p_left.athlete_id;
  IF p_left.athlete_id IS NULL AND p_left.opponent_player_id IS NOT NULL THEN
    SELECT lower(trim(name)), shirt_number INTO v_left_name, v_left_number
      FROM opponent_match_players WHERE id = p_left.opponent_player_id;
  ELSIF p_left.athlete_id IS NULL THEN
    v_left_number := (substring(p_left.opponent_label FROM '^#([0-9]{1,3})(?:\s|$)'))::integer;
    v_left_name := NULLIF(lower(trim(regexp_replace(p_left.opponent_label, '^#[0-9]+\s*', ''))), '');
  END IF;
  SELECT lower(trim(first_name || ' ' || last_name)), squad_number INTO v_right_name, v_right_number
    FROM athletes WHERE id = p_right.athlete_id;
  IF p_right.athlete_id IS NULL AND p_right.opponent_player_id IS NOT NULL THEN
    SELECT lower(trim(name)), shirt_number INTO v_right_name, v_right_number
      FROM opponent_match_players WHERE id = p_right.opponent_player_id;
  ELSIF p_right.athlete_id IS NULL THEN
    v_right_number := (substring(p_right.opponent_label FROM '^#([0-9]{1,3})(?:\s|$)'))::integer;
    v_right_name := NULLIF(lower(trim(regexp_replace(p_right.opponent_label, '^#[0-9]+\s*', ''))), '');
  END IF;
  IF v_left_number IS NOT NULL AND v_right_number IS NOT NULL THEN
    RETURN CASE WHEN v_left_number = v_right_number THEN 1 ELSE -1 END;
  END IF;
  IF NULLIF(v_left_name, '') IS NOT NULL AND NULLIF(v_right_name, '') IS NOT NULL THEN
    RETURN CASE WHEN v_left_name = v_right_name THEN 1 ELSE -1 END;
  END IF;
  RETURN 0;
END;
$$;

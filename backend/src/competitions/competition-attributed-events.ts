import { sql } from 'drizzle-orm';

/**
 * Read-only attribution of events from both finalized fixture sheets.
 * Own-side athlete IDs are authoritative; opponent-side labels are resolved
 * only against the actual OTHER competition team and only when exactly one
 * active roster member matches both shirt number and full name.
 *
 * Mirror deduplication pairs the Nth occurrence on each sheet for the same
 * player/event/minute. This avoids counting a mirrored event twice without
 * collapsing two genuinely distinct same-minute events on the same sheet.
 * Unresolved labels remain in the ledger and are intentionally NOT credited.
 */
export const competitionAttributedEvents = sql`
  with fixture_events as (
    select f.id as fixture_id, me.id as event_id, me.match_id,
           me.event_type::text as event_type, me.minute,
           me.team::text as recorded_team, me.athlete_id,
           me.opponent_label, e.team_id as logger_team_id,
           case
             when me.team = 'own' then e.team_id
             when me.team = 'opponent' then
               case when own_ct.id = f.home_competition_team_id then away_ct.team_id
                    when own_ct.id = f.away_competition_team_id then home_ct.team_id
                    else null end
             else null end as credited_team_id
    from match_events me
    join matches m on m.id = me.match_id
    join events e on e.id = m.event_id
    join competition_fixtures f on f.id = e.competition_fixture_id
    join competition_teams own_ct on own_ct.team_id = e.team_id
       and own_ct.competition_id = f.competition_id
    join competition_teams home_ct on home_ct.id = f.home_competition_team_id
    join competition_teams away_ct on away_ct.id = f.away_competition_team_id
    where own_ct.id in (f.home_competition_team_id, f.away_competition_team_id)
      and f.status = 'completed' and e.status = 'completed'
      and e.competition_id = f.competition_id
      and (m.shared_match_id is null or m.shared_match_id = f.shared_session_id)
      and me.lifecycle_status not in ('voided', 'needs_review')
      and me.event_type in ('goal','assist','goalkeeper_save','yellow_card','red_card')
  ), resolved as (
    select fe.*, coalesce(own_player.id, opponent_player.id) as resolved_athlete_id
    from fixture_events fe
    left join athletes own_player on fe.recorded_team = 'own'
      and own_player.id = fe.athlete_id and own_player.team_id = fe.credited_team_id
    left join lateral (
      select case when count(*) = 1 then (array_agg(a.id))[1] else null end as id
      from athletes a
      where fe.recorded_team = 'opponent'
        and a.team_id = fe.credited_team_id
        and fe.opponent_label ~ '^#[0-9]+[[:space:]]+'
        and a.squad_number::text = substring(fe.opponent_label from '^#([0-9]+)')
        and lower(trim(a.first_name || ' ' || a.last_name)) =
            lower(trim(regexp_replace(fe.opponent_label, '^#[0-9]+[[:space:]]+', '')))
    ) opponent_player on true
  ), numbered as (
    select r.*,
      row_number() over (
        partition by fixture_id, resolved_athlete_id, event_type, minute, recorded_team
        order by event_id
      ) as occurrence
    from resolved r where resolved_athlete_id is not null
  ), deduplicated as (
    select distinct on (fixture_id, resolved_athlete_id, event_type, minute, occurrence)
      fixture_id, resolved_athlete_id as athlete_id, credited_team_id as team_id,
      event_type, minute, event_id
    from numbered
    order by fixture_id, resolved_athlete_id, event_type, minute, occurrence,
      case when recorded_team = 'own' then 0 else 1 end, event_id
  )
`;

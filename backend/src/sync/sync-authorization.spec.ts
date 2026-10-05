import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('PowerSync shared session authorization', () => {
  const config = readFileSync(
    resolve(__dirname, '../../../powersync/sync-config.yaml'),
    'utf8',
  );

  function streamQuery(name: string) {
    const start = config.indexOf(`  ${name}:`);
    if (start < 0) throw new Error(`Missing PowerSync stream ${name}`);
    const nextMatch = /\n {2}[a-z][a-z0-9_]*:/g;
    nextMatch.lastIndex = start + 3;
    const next = nextMatch.exec(config)?.index ?? -1;
    const block = config.slice(start, next < 0 ? undefined : next);
    const query = block.split(/query:\s*\|\s*\n/)[1];
    if (!query) throw new Error(`Missing query for PowerSync stream ${name}`);
    return query;
  }

  it('delivers shared event rows to current session participants only', () => {
    const query = streamQuery('shared_session_match_events');
    expect(query).toMatch(/match_events\.session_id/);
    expect(query).toMatch(/match_session_participants/);
    expect(query).toMatch(/team_members/);
    expect(query).toMatch(/auth\.parameter\('team_id'\)/);
    expect(query).toMatch(/auth\.parameter\('user_id'\)/);
    expect(query).toMatch(/auth\.parameter\('two_sided_live_logging'\)/);
    expect(query).toMatch(/match_events\.opponent_label/);
    expect(query).not.toMatch(/match_events\.opponent_player_id/);
    expect(query).not.toMatch(/match_events\.athlete_id\s*,/);
    expect(query).toMatch(/match_events\.session_id AS match_id/);
    expect(query).toMatch(/match_events\.match_id IN/);
    expect(query).toMatch(/matches\.is_home IN/);
    expect(query).not.toMatch(/NOT EXISTS|LEFT JOIN|concat_ws|COALESCE/i);
  });

  it('delivers review candidates to both current participants only', () => {
    const query = streamQuery('shared_session_match_reviews');
    expect(query).toMatch(/match_event_reviews\.session_id/);
    expect(query).toMatch(/match_session_participants/);
    expect(query).toMatch(/team_members/);
    expect(query).toMatch(/auth\.parameter\('team_id'\)/);
    expect(query).toMatch(/auth\.parameter\('user_id'\)/);
    expect(query).toMatch(/auth\.parameter\('two_sided_live_logging'\)/);
    expect(query).toMatch(/match_event_reviews\.session_id AS match_id/);
    expect(query).toMatch(/match_event_reviews\.match_id IN/);
    expect(query).toMatch(/matches\.is_home IN/);
    expect(query).not.toMatch(/NOT EXISTS|JOIN/i);
    const observations = streamQuery('shared_session_match_observations');
    expect(observations).toMatch(/match_session_participants/);
    expect(observations).toMatch(/team_members/);
    expect(observations).toMatch(/match_event_observations\.match_id IN/);
    expect(observations).not.toMatch(/athlete_id|opponent_player_id|payload/);
  });

  it('shares review decisions without exporting private correction payloads', () => {
    const query = streamQuery('shared_session_match_operations');
    expect(query).toMatch(
      /match_event_operations\.operation_type = 'merge' OR match_event_operations\.operation_type = 'separate'/,
    );
    expect(query).toMatch(/match_event_operations\.decision/);
    expect(query).not.toMatch(/jsonb_build_object|replacement/i);
    expect(query).not.toMatch(/'replacement'/);
    expect(query).toMatch(/team_members/);
    expect(query).toMatch(/match_event_operations\.match_id IN/);
  });

  it('keeps private sheet streams scoped to their owning team', () => {
    const query = streamQuery('team_matches');
    expect(query).toMatch(/matches\.event_id IN/);
    expect(query).toMatch(/events\.team_id = auth\.parameter\('team_id'\)/);
    expect(query).not.toMatch(/match_session_participants/);
    expect(query).not.toMatch(/JOIN/i);
  });

  it('associates new clock operations with their linked session sheet', () => {
    const query = streamQuery('shared_session_match_clock_operations');
    // Offline reconciliation compares revisions per sheet before combining
    // the shared clock. Preserve both identities rather than aliasing them.
    expect(query).toMatch(/match_clock_operations\.match_id,/);
    expect(query).toMatch(/match_clock_operations\.session_id,/);
    expect(query).not.toMatch(/session_id AS match_id/);
    expect(query).toMatch(/match_clock_operations\.match_id IN/);
    expect(query).toMatch(/match_session_participants/);
    expect(query).toMatch(/team_members/);
    expect(query).not.toMatch(/COALESCE|JOIN/i);
  });

  it('uses the PowerSync-supported query subset throughout the config', () => {
    expect(config).not.toMatch(/\b(?:LEFT|RIGHT|FULL)\s+JOIN\b/i);
    expect(config).not.toMatch(/\bJOIN\b/i);
    expect(config).not.toMatch(/\bNOT\s+EXISTS\b/i);
    expect(config).not.toMatch(
      /\b(?:COALESCE|CONCAT_WS|JSONB_BUILD_OBJECT)\s*\(/i,
    );
    expect(config).not.toMatch(/\b(?:jsonb\s*-|->|->>)\s*/i);
  });

  it.each([
    'shared_session_match_events',
    'shared_session_match_reviews',
    'shared_session_match_observations',
    'shared_session_match_memberships',
    'shared_session_match_operations',
    'shared_session_match_projections',
    'shared_session_match_clock_operations',
    'shared_session_report_state',
    'shared_session_report_sheets',
    'shared_session_report_fixture_scores',
  ])('%s requires flag, participant identity and live membership', (name) => {
    const query = streamQuery(name);
    expect(query).toContain(
      "auth.parameter('two_sided_live_logging') = 'true'",
    );
    expect(query).toContain(
      "match_session_participants.team_id = auth.parameter('team_id')",
    );
    expect(query).toContain("team_members.user_id = auth.parameter('user_id')");
  });

  it('excludes injuries from shared events, observations and memberships', () => {
    expect(streamQuery('shared_session_match_events')).toContain(
      "match_events.event_type <> 'injury'",
    );
    for (const name of [
      'shared_session_match_observations',
      'shared_session_match_memberships',
    ])
      expect(streamQuery(name)).toContain(
        "match_event_observations.event_type <> 'injury'",
      );
    expect(streamQuery('shared_session_match_events')).not.toContain(
      'match_events.detail',
    );
    expect(streamQuery('shared_session_match_operations')).not.toContain(
      'match_event_operations.reason',
    );
  });

  it.each(
    [...config.matchAll(/^ {2}(team_[a-z_]+):/gm)].map((match) => match[1]),
  )('%s checks live membership even with an already-issued token', (name) => {
    expect(streamQuery(name)).toContain(
      "team_members.user_id = auth.parameter('user_id')",
    );
  });
});

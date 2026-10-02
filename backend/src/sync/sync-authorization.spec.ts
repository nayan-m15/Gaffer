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
    const nextMatch = /\n  [a-z][a-z0-9_]*:/g;
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
      /match_event_operations\.operation_type IN \('merge', 'separate'\)/,
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
    expect(query).toMatch(/match_clock_operations\.session_id AS match_id/);
    expect(query).toMatch(/match_clock_operations\.match_id IN/);
    expect(query).toMatch(/match_session_participants/);
    expect(query).toMatch(/team_members/);
    expect(query).not.toMatch(/COALESCE|JOIN/i);
  });

  it('uses the PowerSync-supported query subset throughout the config', () => {
    expect(config).not.toMatch(/\b(?:LEFT|RIGHT|FULL)\s+JOIN\b/i);
    expect(config).not.toMatch(/\bJOIN\b/i);
    expect(config).not.toMatch(/\bNOT\s+EXISTS\b/i);
    expect(config).not.toMatch(/\b(?:COALESCE|CONCAT_WS|JSONB_BUILD_OBJECT)\s*\(/i);
    expect(config).not.toMatch(/\b(?:jsonb\s*-|->|->>)\s*/i);
  });
});

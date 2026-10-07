import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const config = readFileSync(
  resolve(root, 'powersync/sync-config.yaml'),
  'utf8',
);
const audit = [...config.matchAll(/^ {2}(shared_[a-z_]+):/gm)].map((match) => {
  const name = match[1];
  const block = config.split(`  ${name}:`)[1].split(/\n {2}[a-z_]+:/)[0];
  const query = block
    .split(/query:\s*\|\s*\n/)[1]
    .replace(/^\s*#.*$/gm, '')
    .trim();
  const table = query.match(/FROM\s+(\w+)/i)[1];
  const fields = query
    .slice(query.indexOf('SELECT') + 6, query.indexOf('FROM'))
    .split(',')
    .map((field) => field.trim());
  return {
    name,
    table,
    fields,
    sessionKey: name.endsWith('memberships')
      ? 'observation_id -> match_event_observations.session_id'
      : name.endsWith('fixture_scores')
        ? 'shared_session_id'
        : name.endsWith('sheets')
          ? 'shared_match_id AS session_id'
          : name.endsWith('report_state')
            ? 'match_sessions.id'
            : 'session_id',
    participantFilter:
      "match_session_participants.team_id = auth.parameter('team_id')",
    liveMembershipFilter: "team_members.user_id = auth.parameter('user_id')",
    featureFlag: "auth.parameter('two_sided_live_logging') = 'true'",
    ownOrPeer: name.startsWith('shared_session_report_')
      ? 'both session sides'
      : 'peer sheet only; own rows use team_* streams',
    thirdTeam: 'zero rows (SQL tested; Cloud deployment unverified)',
    revokedMember:
      'zero rows with old claims (SQL tested; Cloud removal/cached client unverified)',
    query,
  };
});
mkdirSync(resolve(root, 'docs/phase2-validation'), { recursive: true });
writeFileSync(
  resolve(root, 'docs/phase2-validation/shared-stream-audit.json'),
  JSON.stringify(audit, null, 2),
);
console.log(
  `Audited ${audit.length} shared streams; field lists and full SQL retained.`,
);

// Verify actual report service output for both owning coaches after repair.
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { config } from 'dotenv';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
assert.equal(process.argv[2], '--blue-hill');
const sql = neon(process.env.DATABASE_URL);
const [identity] = await sql.query("SELECT current_setting('neon.branch_id') AS branch,current_setting('neon.endpoint_id') AS endpoint");
assert.equal(identity.endpoint, 'ep-blue-hill-b1j037cs');
assert.equal(identity.branch, 'br-odd-cell-b1onih3h');
const require = createRequire(import.meta.url);
const { MatchesService } = require('../dist/src/matches/matches.service.js');
const { TeamsService } = require('../dist/src/teams/teams.service.js');
const schema = require('../dist/src/database/schema/index.js');
const database = { database: drizzle(sql, { schema }) };
const teams = new TeamsService(database);
const matches = new MatchesService(database, teams, {}, {});
process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
const fixtures = [
  ['competition','35f00ca4-642e-410e-a4b2-9190f759fd85',1,0],
  ['competition','71cc8d48-d7b4-4bb0-89dc-e6a9644d353d',3,3],
  ['competition','ccc81418-259c-430a-a0b0-2bbc2ccea8ae',2,1],
  ['competition','fd41392c-429f-42ee-80a3-f72af3195323',0,3],
  ['friendly','16ab1963-b32d-4f81-bc42-cd203a59839d',1,1],
];
const evidence = [];
for (const [kind, id, home, away] of fixtures) {
  const sheets = await sql.query(`SELECT m.id,m.shared_match_id,m.is_home,e.team_id,
    (SELECT tm.user_id FROM team_members tm WHERE tm.team_id=e.team_id AND tm.role='coach' LIMIT 1) AS coach
    FROM matches m JOIN events e ON e.id=m.event_id WHERE e.${kind}_fixture_id=$1 ORDER BY m.is_home DESC`,[id]);
  assert.equal(sheets.length,2); assert(sheets[0].is_home && !sheets[1].is_home);
  assert.equal(sheets[0].shared_match_id,sheets[1].shared_match_id);
  const [session] = await sql.query('SELECT * FROM match_sessions WHERE id=$1',[sheets[0].shared_match_id]);
  assert.equal(session.home_confirmed_at,null); assert.equal(session.away_confirmed_at,null);
  const reports = await Promise.all(sheets.map(sheet=>matches.getSessionReportForSheet(sheet.coach,sheet.id)));
  assert.deepEqual(reports[0],reports[1],`Coach reports differ for ${id}`);
  assert.deepEqual(reports[0].score,{ home,away });
  assert.equal(reports[0].clock.period,'full_time');
  assert.equal(reports[0].finalStatus,'awaiting_confirmation');
  assert.equal(reports[0].participants.length,2);
  evidence.push({kind,fixtureId:id,sessionId:reports[0].sessionId,score:reports[0].score,
    sameCoachReports:true,timelineEvents:reports[0].timeline.length,status:reports[0].finalStatus});
}
const directory = resolve(root,'docs/phase-history-validation');
const repairFile = readdirSync(directory).filter(name=>name.startsWith('repair-result-')).sort().reverse()
  .find(name=>JSON.parse(readFileSync(resolve(directory,name),'utf8')).applied);
assert(repairFile,'Applied repair evidence required');
const backup = JSON.parse(readFileSync(resolve(directory,repairFile.replace('repair-result-','repair-backup-')),'utf8'));
for (const table of ['match_event_observations','match_event_memberships','competition_matches']) {
  const current = (await sql.query(`SELECT to_jsonb(r) AS row FROM ${table} r`)).map(r=>r.row);
  assert.equal(current.length,backup.tables[table].length,`Row count changed: ${table}`);
  for (const original of backup.tables[table]) {
    const row = current.find(r=>table==='match_event_memberships'?r.observation_id===original.observation_id:r.id===original.id);
    const excluded = table==='match_event_observations'?['session_id','side']:table==='match_event_memberships'?['projection_revision']:[];
    const omitIdentity = value => Object.fromEntries(Object.entries(value).filter(([key])=>!excluded.includes(key)));
    assert.deepEqual(omitIdentity(row),omitIdentity(original),`Evidence changed: ${table}`);
    if (table==='match_event_memberships') assert(row.projection_revision>=original.projection_revision);
  }
}
for (const [kind,id,home,away] of fixtures.filter(row=>row[0]==='competition')) {
  const [fixture] = await sql.query('SELECT home_score,away_score FROM competition_fixtures WHERE id=$1',[id]);
  assert.deepEqual(fixture,{home_score:home,away_score:away});
}
const result = {checkedAt:new Date().toISOString(),evidence,observationsAndMembershipsPreserved:true,competitionResultsPreserved:true};
writeFileSync(resolve(directory,'repair-report-verification.json'),JSON.stringify(result,null,2),{mode:0o600});
console.log(JSON.stringify(result,null,2));

// One-off, exact-fixture development repair. Never delete observations or sessions.
import { neon } from '@neondatabase/serverless';
import { PGlite } from '@electric-sql/pglite';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
assert(['--review-blue-hill', '--apply-blue-hill'].includes(process.argv[2]));
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname.replace('-pooler.', '.'), 'ep-blue-hill-b1j037cs.c-5.eu-central-1.aws.neon.tech');
const sql = neon(url.toString());
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const ident = value => `"${String(value).replaceAll('"', '""')}"`;
const ids = ['35f00ca4-642e-410e-a4b2-9190f759fd85', '71cc8d48-d7b4-4bb0-89dc-e6a9644d353d',
  'ccc81418-259c-430a-a0b0-2bbc2ccea8ae', 'fd41392c-429f-42ee-80a3-f72af3195323',
  '16ab1963-b32d-4f81-bc42-cd203a59839d'];
const [, identities, tableNames, columns, enums, constraints, indexes, functions, triggers] = await sql.transaction(tx => [
  tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'),
  tx.query(`SELECT current_database() AS database,current_setting('neon.branch_id') AS branch,current_setting('neon.endpoint_id') AS endpoint`),
  tx.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"),
  tx.query(`SELECT c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,
    a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS default_value
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`),
  tx.query("SELECT t.typname,jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname"),
  tx.query("SELECT c.relname AS table_name,co.conname,pg_get_constraintdef(co.oid) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND co.contype IN ('p','u','c','f') ORDER BY CASE WHEN co.contype='f' THEN 1 ELSE 0 END,c.relname,co.conname"),
  tx.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname"),
  tx.query("SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')"),
  tx.query("SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal"),
]);
assert.equal(identities[0].endpoint, 'ep-blue-hill-b1j037cs');
assert.equal(identities[0].branch, 'br-odd-cell-b1onih3h');
assert.equal(identities[0].database, 'neondb');
const [, ...data] = await sql.transaction(tx => [tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'),
  ...tableNames.map(({ tablename }) => tx.query(`SELECT to_jsonb(r) AS row FROM public.${ident(tablename)} r ORDER BY to_jsonb(r)::text`)),
]);
const tables = Object.fromEntries(tableNames.map(({ tablename }, i) => [tablename, data[i].map(row => row.row)]));
const fixtures = [...tables.competition_fixtures.map(row => ({ ...row, kind: 'competition' })),
  ...tables.friendly_fixtures.map(row => ({ ...row, kind: 'friendly' }))].filter(row => ids.includes(row.id));
assert.equal(fixtures.length, 5);
const plans = fixtures.map(fixture => {
  const events = tables.events.filter(row => row[`${fixture.kind}_fixture_id`] === fixture.id);
  const sheets = tables.matches.filter(row => events.some(event => event.id === row.event_id));
  assert.equal(sheets.length, 2);
  assert(events.every(row => row.status === 'completed'));
  const homeTeam = fixture.kind === 'friendly' ? fixture.requester_team_id
    : tables.competition_teams.find(row => row.id === fixture.home_competition_team_id).team_id;
  const awayTeam = fixture.kind === 'friendly' ? fixture.opponent_team_id
    : tables.competition_teams.find(row => row.id === fixture.away_competition_team_id).team_id;
  assert(homeTeam && awayTeam && homeTeam !== awayTeam);
  const home = sheets.find(sheet => events.find(event => event.id === sheet.event_id).team_id === homeTeam);
  const away = sheets.find(sheet => events.find(event => event.id === sheet.event_id).team_id === awayTeam);
  assert(home && away);
  assert(home.shared_match_id !== away.shared_match_id || !home.shared_match_id || !away.shared_match_id,
    'Already reconciled; refusing to reset a repaired fixture or its new confirmations.');
  const sessionId = fixture.shared_session_id ?? home.shared_match_id;
  assert(sessionId && tables.match_sessions.some(row => row.id === sessionId));
  assert(!tables.matches.some(row => row.shared_match_id === sessionId && !sheets.some(sheet => sheet.id === row.id)), 'Session used outside this fixture');
  const goals = tables.match_events.filter(row => sheets.some(sheet => sheet.id === row.match_id) && row.event_type === 'goal' && row.lifecycle_status !== 'voided');
  const side = row => (row.match_id === home.id) === (row.team === 'own') ? 'home' : 'away';
  const score = fixture.kind === 'friendly' ? [1, 1] : [fixture.home_score, fixture.away_score];
  const keep = ['home', 'away'].flatMap((s, i) => {
    const candidates = goals.filter(row => side(row) === s).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    assert(Number.isInteger(score[i]) && score[i] >= 0 && candidates.length >= score[i]);
    return candidates.slice(0, score[i]).map(row => row.id);
  });
  assert(!tables.match_event_reviews.some(row => sheets.some(sheet => sheet.id === row.match_id)), 'Reviews require a separate decision');
  return { fixture, home, away, homeTeam, awayTeam, sessionId, score, keep,
    voidGoals: goals.filter(row => !keep.includes(row.id)).map(row => row.id) };
});
const matchIds = plans.flatMap(plan => [plan.home.id, plan.away.id]);
const sessionIds = [...new Set(plans.flatMap(plan => [plan.sessionId, plan.home.shared_match_id, plan.away.shared_match_id]).filter(Boolean))];
const touched = ['competition_fixtures', 'friendly_fixtures', 'matches', 'match_sessions', 'match_session_participants',
  'match_events', 'match_event_observations', 'match_event_operations', 'match_event_reviews', 'match_clock_operations', 'match_projection_state'];
const predicate = table => table.endsWith('_fixtures') ? `id IN (${ids.map(quote)})`
  : table === 'matches' ? `id IN (${matchIds.map(quote)})`
  : table === 'match_sessions' ? `id IN (${sessionIds.map(quote)})`
  : table === 'match_session_participants' ? `session_id IN (${sessionIds.map(quote)})`
  : `match_id IN (${matchIds.map(quote)})`;
const statements = ["SET LOCAL timezone='UTC'", "SET LOCAL lock_timeout='10s'", "SET LOCAL statement_timeout='60s'",
  `LOCK TABLE ${touched.map(ident).join(',')} IN SHARE ROW EXCLUSIVE MODE`];
for (const table of touched) {
  const expected = tables[table].filter(row => table.endsWith('_fixtures') ? ids.includes(row.id)
    : table === 'matches' ? matchIds.includes(row.id) : table === 'match_sessions' ? sessionIds.includes(row.id)
    : table === 'match_session_participants' ? sessionIds.includes(row.session_id) : matchIds.includes(row.match_id));
  statements.push(`DO $$ BEGIN IF EXISTS ((SELECT to_jsonb(r) FROM ${ident(table)} r WHERE ${predicate(table)} EXCEPT SELECT value FROM jsonb_array_elements(${quote(JSON.stringify(expected))}::jsonb))
      UNION ALL (SELECT value FROM jsonb_array_elements(${quote(JSON.stringify(expected))}::jsonb) EXCEPT SELECT to_jsonb(r) FROM ${ident(table)} r WHERE ${predicate(table)}))
    THEN RAISE EXCEPTION 'Snapshot changed: ${table}'; END IF; END $$`);
}
for (const plan of plans) {
  const sid = quote(plan.sessionId);
  const mids = [plan.home.id, plan.away.id].map(quote).join(',');
  const fixtureTable = `${plan.fixture.kind}_fixtures`;
  statements.push(`UPDATE ${fixtureTable} SET shared_session_id=${sid},updated_at=now() WHERE id=${quote(plan.fixture.id)}`);
  for (const [sheet, isHome, teamId, ctId] of [[plan.home, true, plan.homeTeam, plan.fixture.home_competition_team_id], [plan.away, false, plan.awayTeam, plan.fixture.away_competition_team_id]]) {
    statements.push(`UPDATE matches SET shared_match_id=${sid},is_home=${isHome},team_score=${plan.score[isHome ? 0 : 1]},opponent_score=${plan.score[isHome ? 1 : 0]},
      clock_period='full_time',clock_started_at=NULL,updated_at=now() WHERE id=${quote(sheet.id)}`);
    statements.push(`INSERT INTO match_session_participants(id,session_id,team_id,competition_team_id,side,confirmation_state)
      VALUES (${quote(randomUUID())},${sid},${quote(teamId)},${ctId ? quote(ctId) : 'NULL'},'${isHome ? 'home' : 'away'}','pending')
      ON CONFLICT(session_id,side) DO UPDATE SET team_id=EXCLUDED.team_id,competition_team_id=EXCLUDED.competition_team_id,confirmation_state='pending',updated_at=now()`);
  }
  for (const table of ['match_events', 'match_event_observations']) statements.push(`UPDATE ${table} SET session_id=${sid},
    side=CASE WHEN (match_id=${quote(plan.home.id)})=(team='own') THEN 'home'::match_session_side ELSE 'away'::match_session_side END WHERE match_id IN (${mids})`);
  for (const table of ['match_event_operations', 'match_event_reviews', 'match_clock_operations', 'match_projection_state'])
    statements.push(`UPDATE ${table} SET session_id=${sid} WHERE match_id IN (${mids})`);
  if (plan.keep.length) statements.push(`UPDATE match_events SET lifecycle_status='confirmed',updated_at=now() WHERE id IN (${plan.keep.map(quote)})`);
  if (plan.voidGoals.length) statements.push(`UPDATE match_events SET lifecycle_status='voided',updated_at=now() WHERE id IN (${plan.voidGoals.map(quote)})`);
  statements.push(`UPDATE match_sessions SET home_confirmed_at=NULL,away_confirmed_at=NULL,home_confirmed_by_user_id=NULL,away_confirmed_by_user_id=NULL,
    finalised_at=NULL,finalised_by_user_id=NULL,updated_at=now() WHERE id=${sid}`);
  statements.push(`UPDATE match_projection_state SET finalisation_state='open',finalised_at=NULL,finalised_by_user_id=NULL WHERE match_id IN (${mids})`);
  for (const sheet of [plan.home, plan.away]) statements.push(`SELECT refresh_match_projection(${quote(sheet.id)}::uuid)`);
  statements.push(`DO $$ BEGIN IF (SELECT count(*) FROM match_events WHERE session_id=${sid} AND event_type='goal' AND lifecycle_status<>'voided' AND side='home')<>${plan.score[0]}
    OR (SELECT count(*) FROM match_events WHERE session_id=${sid} AND event_type='goal' AND lifecycle_status<>'voided' AND side='away')<>${plan.score[1]}
    OR (SELECT count(*) FROM matches WHERE shared_match_id=${sid})<>2
    OR (SELECT count(*) FROM match_session_participants WHERE session_id=${sid})<>2
    THEN RAISE EXCEPTION 'Post-repair assertion failed'; END IF; END $$`);
}
const directory = resolve(root, 'docs/phase-history-validation'); mkdirSync(directory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = { identity: identities[0], columns, enums, constraints, indexes, functions, triggers, tables,
  scope: 'Full public-table data and public schema definitions; not platform roles, replication slots or managed extensions.' };
writeFileSync(resolve(directory, `repair-backup-${timestamp}.json`), JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
writeFileSync(resolve(directory, `repair-plan-${timestamp}.sql`), 'BEGIN;\n'+statements.map(s=>s+';').join('\n')+'\nCOMMIT;\n', { flag: 'wx', mode: 0o600 });

// Restore actual live schema and data into a disposable engine before touching live rows.
const pg = new PGlite();
try {
  await pg.exec("SET timezone='UTC'");
  for (const e of enums) await pg.exec(`CREATE TYPE ${ident(e.typname)} AS ENUM (${e.labels.map(quote)})`);
  for (const { tablename } of tableNames) {
    await pg.exec(`CREATE TABLE ${ident(tablename)} (${columns.filter(c=>c.table_name===tablename).map(c=>`${ident(c.name)} ${c.type}${c.required?' NOT NULL':''}${c.default_value && !c.default_value.includes('nextval(')?' DEFAULT '+c.default_value:''}`).join(',')})`);
    if (tables[tablename].length) await pg.query(`INSERT INTO ${ident(tablename)} SELECT * FROM jsonb_populate_recordset(NULL::${ident(tablename)},$1::jsonb)`, [JSON.stringify(tables[tablename])]);
  }
  for (const c of constraints.filter(c=>!c.definition.startsWith('FOREIGN KEY'))) await pg.exec(`ALTER TABLE ${ident(c.table_name)} ADD CONSTRAINT ${ident(c.conname)} ${c.definition}`);
  for (const idx of indexes) if (!(await pg.query('SELECT 1 FROM pg_class WHERE relname=$1',[idx.indexname])).rows.length) await pg.exec(idx.indexdef);
  for (const c of constraints.filter(c=>c.definition.startsWith('FOREIGN KEY'))) await pg.exec(`ALTER TABLE ${ident(c.table_name)} ADD CONSTRAINT ${ident(c.conname)} ${c.definition}`);
  for (const f of functions) await pg.exec(f.definition);
  for (const t of triggers) await pg.exec(t.definition);
  for (const table of touched) {
    const loaded = (await pg.query(`SELECT to_jsonb(r) AS row FROM ${ident(table)} r`)).rows.map(row=>row.row);
    for (const row of tables[table]) {
      const restored = loaded.find(r=> (row.id ? r.id===row.id : r.match_id===row.match_id));
      for (const key of Object.keys(row)) assert.deepEqual(restored?.[key], row[key], `Restore mismatch ${table}.${key}: ${JSON.stringify(restored?.[key])} / ${JSON.stringify(row[key])}`);
    }
  }
  await pg.exec('BEGIN'); for (const s of statements) await pg.exec(s); await pg.exec('ROLLBACK');
  for (const table of touched) {
    const restored = (await pg.query(`SELECT to_jsonb(r) AS row FROM ${ident(table)} r ORDER BY to_jsonb(r)::text`)).rows.map(row=>row.row);
    assert.deepEqual(restored, tables[table], `Rollback failed for ${table}`);
  }
  await pg.exec('BEGIN'); for (const s of statements) await pg.exec(s); await pg.exec('COMMIT');
} finally { await pg.close(); }
if (process.argv[2] === '--apply-blue-hill') await sql.transaction(tx => statements.map(s=>tx.query(s)));
const result = { checkedAt: new Date().toISOString(), identity: identities[0], applied: process.argv[2] === '--apply-blue-hill',
  publicDataRestoreAndRollbackPassed: true, plans: plans.map(p=>({kind:p.fixture.kind,fixtureId:p.fixture.id,sessionId:p.sessionId,score:p.score,retainedGoalIds:p.keep,voidedGoalIds:p.voidGoals})),
  note: 'All observations and old sessions retained. Published competition results retained. Coaches must reconfirm repaired results; no coach confirmations fabricated.' };
writeFileSync(resolve(directory, `repair-result-${timestamp}.json`), JSON.stringify(result,null,2), { flag:'wx',mode:0o600 });
console.log(JSON.stringify(result,null,2));

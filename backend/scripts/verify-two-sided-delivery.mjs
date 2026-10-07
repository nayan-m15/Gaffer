// Fresh identities only. Uses real application SQLite/queue functions and
// Cloud replication; no report polling or sync-table fixtures can satisfy it.
import { chromium, request } from '../../node_modules/playwright/index.mjs';
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { createPublicKey, randomUUID, verify } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFileSync, mkdirSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
assert.equal(process.argv[2], '--blue-hill', 'Explicit authorized target required.');
const sql = neon(process.env.DATABASE_URL);
const [identity] = await sql.query(`SELECT current_database() AS database, current_setting('neon.endpoint_id') AS endpoint`);
assert.equal(identity.endpoint, 'ep-blue-hill-b1j037cs');
assert(process.env.POWERSYNC_PRIVATE_KEY, 'RSA signer required');
async function port() {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const value = server.address().port;
  await new Promise(r => server.close(r));
  return value;
}
const api = `http://127.0.0.1:${await port()}`;
const frontend = `http://127.0.0.1:${await port()}`;
const directory = resolve(root, 'docs/phase-delivery-validation');
mkdirSync(directory, { recursive: true });
const env = { ...process.env, PORT: new URL(api).port, BETTER_AUTH_URL: api,
  FRONTEND_URL: frontend, VITE_API_URL: api, TWO_SIDED_LIVE_LOGGING_ENABLED: 'true',
  OFFLINE_SYNC_ENABLED: 'true', BREVO_API_KEY: '', GEMINI_API_KEY: '' };
const servers = [
  spawn(process.execPath, ['dist/src/main.js'], { cwd: resolve(root, 'backend'), env, windowsHide: true, stdio: ['ignore', openSync(resolve(directory, 'backend.log'), 'w'), openSync(resolve(directory, 'backend-errors.log'), 'w')] }),
  spawn(process.execPath, [resolve(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', new URL(frontend).port, '--strictPort'],
    { cwd: resolve(root, 'frontend'), env, windowsHide: true, stdio: ['ignore', openSync(resolve(directory, 'frontend.log'), 'w'), openSync(resolve(directory, 'frontend-errors.log'), 'w')] }),
];
const kind = process.argv.includes('--competition') ? 'competition' : 'friendly';
const evidence = { capturedAt: new Date().toISOString(), kind, identity, api, frontend, events: [] };
const contexts = [];
const users = [], teams = [], sessions = [], competitions = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, description, timeout = 90000) {
  console.log(`Verifying ${description}...`);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await sleep(500);
  }
  throw new Error(`Timed out: ${description}`);
}
async function call(client, method, path, data, base = api) {
  const response = await client[method](base + path, { data });
  if (!response.ok()) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`${method} ${path}: HTTP ${response.status()} ${JSON.stringify({ code: error.code, message: error.message })}`);
  }
  return response.json();
}
async function store(page, name, args = []) {
  return page.evaluate(async ({ name, args }) => {
    const module = await import('/src/offline/match-store.ts');
    return module[name](...args);
  }, { name, args });
}
async function verifyHosted(home) {
  const hosted = await request.newContext();
  try {
    const base = 'https://gaffer-api-ynaf.onrender.com';
    await call(hosted, 'post', '/auth/sign-in', { email: home.email, password: home.password }, base);
    const token = await call(hosted, 'get', '/sync/token', undefined, base);
    const [h, p, s] = token.token.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url'));
    const claims = JSON.parse(Buffer.from(p, 'base64url'));
    const jwks = await call(hosted, 'get', '/sync/jwks', undefined, base);
    const key = jwks.keys.find(key => key.kid === header.kid);
    evidence.hostedAuth = { base, kid: header.kid, alg: header.alg, audience: claims.aud,
      effectiveFlag: claims.two_sided_live_logging ?? null,
      signatureVerified: verify('RSA-SHA256', Buffer.from(h + '.' + p), createPublicKey({ key, format: 'jwk' }), Buffer.from(s, 'base64url')) };
    console.log('Hosted token verified; effective flag: ' + evidence.hostedAuth.effectiveFlag);
  } catch (error) { evidence.hostedAuth = { error: error.message }; }
  finally { await hosted.dispose(); }
}
async function openClient(profile, side) {
  const context = await chromium.launchPersistentContext(profile, { headless: true, permissions: ['local-network-access'] });
  contexts.push(context);
  const page = context.pages()[0] ?? await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const value = message.text().replace(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g, '[REDACTED]');
      console.log(`Browser ${side}: ${value.slice(0, 600)}`);
    }
  });
  await page.route(frontend + '/', route => route.fulfill({ contentType: 'text/html', body: '<html><body>PowerSync delivery verification</body></html>' }));
  await page.goto(frontend);
  return { context, page };
}
try {
  await until(async () => { try { return (await fetch(api + '/health/database')).ok; } catch { return false; } }, 'local API');
  await until(async () => { try { return (await fetch(frontend)).ok; } catch { return false; } }, 'frontend');
  const coaches = [];
  for (const side of ['home', 'away']) {
    const profile = resolve(directory, `profile-${side}-${randomUUID()}`);
    const { context, page } = await openClient(profile, side);
    const email = `delivery-${randomUUID()}@example.test`;
    const password = randomUUID() + 'Aa1!';
    await call(context.request, 'post', '/auth/sign-up', { name: 'Delivery verification', email, password });
    const [user] = await sql.query('SELECT id FROM public."user" WHERE email = $1', [email]);
    assert(user);
    users.push(user.id);
    await sql.query('UPDATE public."user" SET email_verified = true WHERE id = $1', [user.id]);
    await call(context.request, 'post', '/auth/sign-in', { email, password });
    const { team } = await call(context.request, 'post', '/teams', { name: `Delivery ${randomUUID()}` });
    teams.push(team.id);
    const squad = await sql.query(`INSERT INTO athletes (team_id,first_name,last_name,squad_number)
      SELECT $1, 'Delivery', 'Player ' || n, n FROM generate_series(1,11) n RETURNING id`, [team.id]);
    // Minimal document keeps API polling out of the proof. All store/queue
    // code below is the actual app module served by Vite.
    await store(page, 'setOfflineUserScope', [user.id]);
    coaches.push({ context, page, profile, user, team, squad, email, password });
  }
  const [home, away] = coaches;
  await verifyHosted(home);
  let homeEventId, awayEventId, fixtureId;
  if (kind === 'friendly') {
    const event = await call(home.context.request, 'post', '/events', { title: 'PowerSync delivery verification', type: 'match',
      scheduledAt: new Date().toISOString(), friendlyOpponentTeamId: away.team.id });
    const accepted = await call(away.context.request, 'post', `/friendly-fixtures/${event.friendlyFixtureId}/accept`, {});
    homeEventId = event.id; awayEventId = accepted.event.id; fixtureId = event.friendlyFixtureId;
  } else {
    const competition = await call(home.context.request, 'post', '/competitions', {
      name: `Delivery ${randomUUID()}`, type: 'league', format: 'league', configuredTeamCount: 2,
      startDate: '2027-01-01', allowedPlayingDays: [6],
    });
    competitions.push(competition.id);
    const slot = await call(home.context.request, 'post', `/competitions/${competition.id}/teams`, { displayName: away.team.name });
    await sql.query('UPDATE competition_teams SET team_id = $1 WHERE id = $2', [away.team.id, slot.id]);
    const [fixture] = await call(home.context.request, 'post', `/competitions/${competition.id}/fixtures/generate`, {});
    fixtureId = fixture.id;
    // Rescheduling invalidates confirmation through a database trigger.
    await sql.query("UPDATE competition_fixtures SET scheduled_at = now() - interval '1 day' WHERE id = $1", [fixture.id]);
    await sql.query(`UPDATE competition_fixtures SET
      schedule_confirmed_at = now(), home_schedule_response = 'external_confirmed', away_schedule_response = 'external_confirmed'
      WHERE id = $1`, [fixture.id]);
    await sql.query("UPDATE events SET scheduled_at = now() - interval '1 day' WHERE competition_fixture_id = $1", [fixture.id]);
    const events = await sql.query('SELECT id, team_id FROM events WHERE competition_fixture_id = $1', [fixture.id]);
    homeEventId = events.find(event => event.team_id === home.team.id).id;
    awayEventId = events.find(event => event.team_id === away.team.id).id;
  }
  for (const [coach, eventId, opponent] of [[home, homeEventId, away], [away, awayEventId, home]]) {
    await call(coach.context.request, 'put', `/events/${eventId}/lineup`, {
      startingAthleteIds: coach.squad.map(p => p.id), benchAthleteIds: [], formationId: '4-3-3',
    });
    coach.sheet = await call(coach.context.request, 'post', `/events/${eventId}/start-match`, {
      opponentName: opponent.team.name, isHome: coach === home, startingAthleteIds: coach.squad.map(p => p.id), benchAthleteIds: [], formationId: '4-3-3',
    });
    sessions.push(coach.sheet.sharedMatchId);
    const token = await call(coach.context.request, 'get', '/sync/token');
    const [header, payload, signature] = token.token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.two_sided_live_logging, 'true');
    const keys = await call(coach.context.request, 'get', '/sync/jwks');
    const kid = JSON.parse(Buffer.from(header, 'base64url')).kid;
    const key = keys.keys.find(key => key.kid === kid);
    assert(verify('RSA-SHA256', Buffer.from(header + '.' + payload), createPublicKey({ key, format: 'jwk' }), Buffer.from(signature, 'base64url')));
    evidence.localAuth = { kid, alg: 'RS256', audience: claims.aud, effectiveFlag: claims.two_sided_live_logging, signatureVerified: true };
    await until(async () => await store(coach.page, 'getPeerSyncStatus') === 'connected', `${coach === home ? 'home' : 'away'} PowerSync authentication`);
    await until(async () => await store(coach.page, 'hasSyncedPreparedMatch', [coach.sheet.id]), 'initial sheet download');
  }
  assert.equal(home.sheet.sharedMatchId, away.sheet.sharedMatchId);
  assert.notEqual(home.sheet.id, away.sheet.id);
  evidence.fixtureId = fixtureId;
  evidence.sessionId = home.sheet.sharedMatchId;
  evidence.sheetIds = coaches.map(c => c.sheet.id);
  async function upload(sender, peer, minute, offline = false) {
    const payload = { clientRequestId: randomUUID(), team: 'own', eventType: 'goal', athleteId: sender.squad[0].id,
      minute, period: 'first_half', matchElapsedMs: minute * 60000 };
    if (offline) await sender.context.setOffline(true);
    await store(sender.page, 'enqueueEvent', [sender.sheet.id, payload]);
    if (offline) {
      const queued = await store(sender.page, 'listQueuedEvents', [sender.sheet.id]);
      assert(queued.some(row => row.id === payload.clientRequestId && row.state === 'queued'));
      await sender.context.setOffline(false);
    }
    await sender.page.evaluate(async () => { const api = await import('/src/features/matches/api.ts'); await api.flushOfflineMatchEvents(); });
    let receipt;
    await until(async () => {
      const rows = await store(sender.page, 'listQueuedEvents', [sender.sheet.id]);
      receipt = rows.find(row => row.id === payload.clientRequestId);
      return receipt?.state === 'accepted' && !!receipt.canonical_event_id;
    }, 'accepted upload receipt');
    await until(async () => (await store(peer.page, 'readSyncedMatchEvents', [peer.sheet.id]))
      .some(row => row.id === receipt.canonical_event_id && row.clientRequestId === payload.clientRequestId), 'canonical event in peer SQLite');
    evidence.events.push({ clientRequestId: payload.clientRequestId, canonicalEventId: receipt.canonical_event_id,
      senderSheet: sender.sheet.id, peerSheet: peer.sheet.id, offlineQueue: offline, deliveredToPeerSQLite: true });
  }
  await upload(home, away, 7);
  await upload(away, home, 17, true);
  const before = await store(away.page, 'readSyncedMatchEvents', [away.sheet.id]);
  assert(before.length >= 2, 'Peer must be warmed before disconnecting.');
  // Closing the persistent client actually terminates its SharedWorker and
  // streaming socket. Chromium setOffline alone leaves existing streams alive.
  await away.context.close();
  const payload = { clientRequestId: randomUUID(), team: 'own', eventType: 'goal', athleteId: home.squad[1].id,
    minute: 31, period: 'first_half', matchElapsedMs: 1860000 };
  const response = await call(home.context.request, 'post', '/sync/upload', { items: [{ kind: 'observation', matchId: home.sheet.id, payload }] });
  const receipt = response.receipts.find(row => row.id === payload.clientRequestId);
  assert.equal(receipt.outcome, 'accepted');
  assert.equal(receipt.canonicalEventId, payload.clientRequestId);
  Object.assign(away, await openClient(away.profile, 'away-reconnected'));
  // Browser-session cookies expire when the persistent browser is closed.
  // Reauthenticate the same coach; retain its existing SQLite database.
  await call(away.context.request, 'post', '/auth/sign-in', { email: away.email, password: away.password });
  await store(away.page, 'setOfflineUserScope', [away.user.id]);
  await until(async () => (await store(away.page, 'readSyncedMatchEvents', [away.sheet.id])).some(row => row.id === receipt.canonicalEventId), 'warmed peer reconnect delivery');
  evidence.reconnect = { canonicalEventId: receipt.canonicalEventId, cachedEventsBeforeDisconnect: before.length,
    persistentClientClosedDuringUpload: true, deliveredToPeerSQLite: true };

  evidence.deliveryPassed = true;
} catch (error) {
  evidence.deliveryPassed = false;
  evidence.failure = error.message;
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  for (const server of servers) server.kill();
  // Delete only exact fresh IDs created by this run. Historical fixtures stay.
  evidence.testIds = { users, teams, sessions: [...new Set(sessions)], competitions };
  try {
    for (const competition of competitions) await sql.query('UPDATE competition_fixtures SET linked_match_id = NULL WHERE competition_id = $1', [competition]);
    for (const session of new Set(sessions)) if (session) await sql.query('DELETE FROM matches WHERE shared_match_id = $1', [session]);
    for (const competition of competitions) await sql.query('DELETE FROM competition_fixtures WHERE competition_id = $1', [competition]);
    for (const competition of competitions) await sql.query('DELETE FROM competitions WHERE id = $1', [competition]);
    for (const team of teams) await sql.query('DELETE FROM teams WHERE id = $1', [team]);
    for (const session of new Set(sessions)) if (session) await sql.query('DELETE FROM match_sessions WHERE id = $1', [session]);
    for (const user of users) await sql.query('DELETE FROM public."user" WHERE id = $1', [user]);
    evidence.cleanupPassed = true;
  } catch (error) { evidence.cleanupPassed = false; evidence.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(resolve(directory, `delivery-${kind}.json`), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}

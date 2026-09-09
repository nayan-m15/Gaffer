/**
 * Seeds a demo coach with two seasons and a full 10-match season, so the
 * Statistics page has enough history to show trends, period splits and a
 * meaningful player comparison.
 *
 * Run with the dev servers up:  node backend/seed-demo.mjs
 * Remove it again with:         node backend/seed-demo.mjs --clean
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const API = 'http://localhost:3000';
const EMAIL = 'demo.coach@example.com';
const PASSWORD = 'password123';
const TEAM = 'Demo Coach FC';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL'))
  .split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const sql = neon(url);

if (process.argv.includes('--clean')) {
  await sql`delete from teams where name = ${TEAM}`;
  await sql`delete from "user" where email = ${EMAIL}`;
  console.log('Removed the demo account.');
  process.exit(0);
}

let cookie = '';
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const pastIso = (d) => { const x = new Date(); x.setUTCDate(x.getUTCDate() - d); x.setUTCHours(12, 0, 0, 0); return x.toISOString(); };
const pastDate = (d) => pastIso(d).slice(0, 10);

// Start clean so the script is re-runnable.
await sql`delete from teams where name = ${TEAM}`;
await sql`delete from "user" where email = ${EMAIL}`;

await call('/auth/sign-up', { method: 'POST', body: { name: 'Demo Coach', email: EMAIL, password: PASSWORD } });
await sql`update "user" set email_verified = true where email = ${EMAIL}`;
await call('/auth/sign-in', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
await call('/teams', { method: 'POST', body: { name: TEAM } });

const roster = [
  ['Alex', 'Morgan'], ['Sam', 'Kerr'], ['Vivianne', 'Miedema'], ['Beth', 'Mead'],
  ['Lucy', 'Bronze'], ['Leah', 'Williamson'], ['Keira', 'Walsh'], ['Lauren', 'Hemp'],
  ['Ella', 'Toone'], ['Mary', 'Earps'], ['Chloe', 'Kelly'],
];
const squad = [];
for (const [firstName, lastName] of roster) {
  squad.push((await call('/athletes', { method: 'POST', body: { firstName, lastName } })).id);
}

await call('/seasons', { method: 'POST', body: { name: '2024/25', startDate: pastDate(500), endDate: pastDate(151), isCurrent: false } });
await call('/seasons', { method: 'POST', body: { name: '2025/26', startDate: pastDate(150), endDate: pastDate(2), isCurrent: true } });

// A season that visibly improves, spread over four months so the period
// comparison switches to month-by-month.
const fixtures = [
  { daysAgo: 140, opponent: 'Riverside United',   own: 1, opp: 3, scorers: [0] },
  { daysAgo: 128, opponent: 'Kingsway FC',        own: 0, opp: 2, scorers: [] },
  { daysAgo: 116, opponent: 'Northgate Athletic', own: 2, opp: 2, scorers: [0, 1] },
  { daysAgo: 100, opponent: 'Eastvale Rovers',    own: 1, opp: 1, scorers: [2] },
  { daysAgo: 86,  opponent: 'Harbour Town',       own: 3, opp: 1, scorers: [0, 1, 2] },
  { daysAgo: 72,  opponent: 'Southfield City',    own: 2, opp: 0, scorers: [1, 3] },
  { daysAgo: 58,  opponent: 'Ashford Wanderers',  own: 4, opp: 1, scorers: [0, 0, 2, 3] },
  { daysAgo: 44,  opponent: 'Brookvale FC',       own: 2, opp: 1, scorers: [0, 1] },
  { daysAgo: 30,  opponent: 'Clifton Park',       own: 3, opp: 0, scorers: [0, 2, 4] },
  { daysAgo: 16,  opponent: 'Westmoor Albion',    own: 5, opp: 1, scorers: [0, 0, 1, 2, 3] },
];

for (const f of fixtures) {
  const ev = await call('/events', { method: 'POST', body: { title: `vs ${f.opponent}`, type: 'match', scheduledAt: pastIso(f.daysAgo), location: 'Riverside Park' } });
  const m = await call(`/events/${ev.id}/start-match`, { method: 'POST', body: { opponentName: f.opponent, isHome: f.daysAgo % 2 === 0, startingAthleteIds: squad } });
  let minute = 8;
  for (const s of f.scorers) {
    await call(`/matches/${m.id}/events`, { method: 'POST', body: { team: 'own', eventType: 'goal', athleteId: squad[s], minute } });
    await call(`/matches/${m.id}/events`, { method: 'POST', body: { team: 'own', eventType: 'assist', athleteId: squad[(s + 1) % 5], minute } });
    minute += 9;
  }
  for (let i = 0; i < f.opp; i += 1) {
    await call(`/matches/${m.id}/events`, { method: 'POST', body: { team: 'opponent', eventType: 'goal', opponentLabel: 'Striker', minute: 20 + i * 11 } });
  }
  await call(`/matches/${m.id}/finish`, { method: 'POST' });
  process.stdout.write('.');
}

console.log(`\n\nSign in at http://localhost:5173/login\n  email:    ${EMAIL}\n  password: ${PASSWORD}\n\nThen open Stats in the sidebar.`);

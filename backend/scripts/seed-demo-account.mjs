/**
 * Seeds (and keeps) a shared demo coach account with a full season of match
 * history, so the Statistics page always has enough data to demonstrate
 * season totals, trends, period comparisons and player comparison.
 *
 * The account lives in whichever database `DATABASE_URL` points at, so it
 * persists for everyone on the team until someone explicitly removes it.
 *
 * Requires the backend to be running (`npm run dev` from the repo root).
 *
 *   node backend/scripts/seed-demo-account.mjs           create if missing (safe to re-run)
 *   node backend/scripts/seed-demo-account.mjs --reset   rebuild from scratch
 *   node backend/scripts/seed-demo-account.mjs --clean   remove it
 *
 * Credentials are intentionally throwaway and this is a dev-only fixture —
 * never point it at a production database.
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const API = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const EMAIL = 'demo.coach@example.com';
const PASSWORD = 'password123';
const TEAM = 'Demo Coach FC';

const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
const databaseUrl = env
  .split('\n')
  .find((line) => line.startsWith('DATABASE_URL'))
  ?.split('=')
  .slice(1)
  .join('=')
  .trim()
  .replace(/^["']|["']$/g, '');

if (!databaseUrl) {
  throw new Error('DATABASE_URL not found in the repo-root .env file.');
}

const sql = neon(databaseUrl);
const reset = process.argv.includes('--reset');
const clean = process.argv.includes('--clean');

/** Deletes the team first so its athletes, events and matches cascade. */
async function removeDemoAccount() {
  await sql`delete from teams where name = ${TEAM}`;
  await sql`delete from "user" where email = ${EMAIL}`;
}

if (clean) {
  await removeDemoAccount();
  console.log(`Removed ${EMAIL}.`);
  process.exit(0);
}

const [existing] = await sql`
  select t.name as team,
    (select count(*)::int from events e
      where e.team_id = t.id and e.type = 'match' and e.status = 'completed') as completed
  from "user" u
  join team_members tm on tm.user_id = u.id
  join teams t on t.id = tm.team_id
  where u.email = ${EMAIL}`;

// Non-destructive by default: an existing account is left exactly as it is, so
// re-running this can never wipe data someone is in the middle of using.
if (existing && !reset) {
  console.log(
    `${EMAIL} already exists (${existing.team}, ${existing.completed} completed matches).\n` +
      'Nothing to do. Pass --reset to rebuild it, or --clean to remove it.',
  );
  process.exit(0);
}

if (existing) {
  await removeDemoAccount();
}

let cookie = '';

async function call(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) {
    cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

/** An ISO timestamp `days` in the past, at midday UTC. */
function pastIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

const pastDate = (days) => pastIso(days).slice(0, 10);

// Sign-up withholds the session until the address is verified, so the flag is
// flipped directly rather than sending real mail through Brevo.
await call('/auth/sign-up', {
  method: 'POST',
  body: { name: 'Demo Coach', email: EMAIL, password: PASSWORD },
});
await sql`update "user" set email_verified = true where email = ${EMAIL}`;
await call('/auth/sign-in', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD },
});
await call('/teams', { method: 'POST', body: { name: TEAM } });

const roster = [
  ['Alex', 'Morgan'],
  ['Sam', 'Kerr'],
  ['Vivianne', 'Miedema'],
  ['Beth', 'Mead'],
  ['Lucy', 'Bronze'],
  ['Leah', 'Williamson'],
  ['Keira', 'Walsh'],
  ['Lauren', 'Hemp'],
  ['Ella', 'Toone'],
  ['Mary', 'Earps'],
  ['Chloe', 'Kelly'],
];

const squad = [];
for (const [firstName, lastName] of roster) {
  const athlete = await call('/athletes', {
    method: 'POST',
    body: { firstName, lastName },
  });
  squad.push(athlete.id);
}

// A finished prior season plus the current one, so the season filter has
// something to switch between.
await call('/seasons', {
  method: 'POST',
  body: {
    name: '2024/25',
    startDate: pastDate(500),
    endDate: pastDate(151),
    isCurrent: false,
  },
});
await call('/seasons', {
  method: 'POST',
  body: {
    name: '2025/26',
    startDate: pastDate(150),
    endDate: pastDate(2),
    isCurrent: true,
  },
});

// Form improves steadily across the season and spans four months, so the
// period comparison switches from halves to month-by-month and every delta
// reads as improving.
const fixtures = [
  { daysAgo: 140, opponent: 'Riverside United', own: 1, opp: 3, scorers: [0] },
  { daysAgo: 128, opponent: 'Kingsway FC', own: 0, opp: 2, scorers: [] },
  {
    daysAgo: 116,
    opponent: 'Northgate Athletic',
    own: 2,
    opp: 2,
    scorers: [0, 1],
  },
  { daysAgo: 100, opponent: 'Eastvale Rovers', own: 1, opp: 1, scorers: [2] },
  { daysAgo: 86, opponent: 'Harbour Town', own: 3, opp: 1, scorers: [0, 1, 2] },
  { daysAgo: 72, opponent: 'Southfield City', own: 2, opp: 0, scorers: [1, 3] },
  {
    daysAgo: 58,
    opponent: 'Ashford Wanderers',
    own: 4,
    opp: 1,
    scorers: [0, 0, 2, 3],
  },
  { daysAgo: 44, opponent: 'Brookvale FC', own: 2, opp: 1, scorers: [0, 1] },
  { daysAgo: 30, opponent: 'Clifton Park', own: 3, opp: 0, scorers: [0, 2, 4] },
  {
    daysAgo: 16,
    opponent: 'Westmoor Albion',
    own: 5,
    opp: 1,
    scorers: [0, 0, 1, 2, 3],
  },
];

for (const fixture of fixtures) {
  const event = await call('/events', {
    method: 'POST',
    body: {
      title: `vs ${fixture.opponent}`,
      type: 'match',
      scheduledAt: pastIso(fixture.daysAgo),
      location: 'Riverside Park',
    },
  });

  const match = await call(`/events/${event.id}/start-match`, {
    method: 'POST',
    body: {
      opponentName: fixture.opponent,
      isHome: fixture.daysAgo % 2 === 0,
      startingAthleteIds: squad,
    },
  });

  // Scores are derived from logged goal events, exactly as the live logger
  // produces them — they are never set directly.
  let minute = 8;
  for (const scorer of fixture.scorers) {
    await call(`/matches/${match.id}/events`, {
      method: 'POST',
      body: { team: 'own', eventType: 'goal', athleteId: squad[scorer], minute },
    });
    await call(`/matches/${match.id}/events`, {
      method: 'POST',
      body: {
        team: 'own',
        eventType: 'assist',
        athleteId: squad[(scorer + 1) % 5],
        minute,
      },
    });
    minute += 9;
  }

  for (let i = 0; i < fixture.opp; i += 1) {
    await call(`/matches/${match.id}/events`, {
      method: 'POST',
      body: {
        team: 'opponent',
        eventType: 'goal',
        opponentLabel: 'Striker',
        minute: 20 + i * 11,
      },
    });
  }

  await call(`/matches/${match.id}/finish`, { method: 'POST' });
  process.stdout.write('.');
}

console.log(
  '\n\nDemo account ready.\n' +
    '  URL:      http://localhost:5173/login\n' +
    `  email:    ${EMAIL}\n` +
    `  password: ${PASSWORD}\n`,
);

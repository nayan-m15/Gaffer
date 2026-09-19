import { expect, test, type Page, type Route } from '@playwright/test';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const LOG_ID = '33333333-3333-4333-8333-333333333333';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function session(name: string, teamName: string, userId: string) {
  return {
    user: {
      id: userId,
      name,
      email: `${userId}@example.com`,
      image: null,
      emailVerified: true,
    },
    team: {
      id: `team-${userId}`,
      name: teamName,
      role: 'coach',
      primaryColor: '#00D99A',
    },
    claimedAthletes: [],
  };
}

async function mockAuthenticatedMatch(page: Page, completed = false) {
  await page.route('**/auth/session', (route) =>
    json(route, session('Test Coach', 'Test FC', 'test-coach')),
  );
  await page.route(`**/api/matches/${MATCH_ID}/squad`, (route) =>
    json(route, []),
  );
  await page.route(`**/api/matches/${MATCH_ID}/opponent-squad`, (route) =>
    json(route, []),
  );
  await page.route(`**/api/matches/${MATCH_ID}`, (route) =>
    json(route, {
      id: MATCH_ID,
      eventId: EVENT_ID,
      competitionId: null,
      opponentName: 'Rivals FC',
      isHome: true,
      teamScore: 1,
      opponentScore: 0,
      gamePlanId: null,
      gamePlanSnapshot: null,
      opponentSquadVisibility: 'none',
      teamColor: '#00D99A',
      opponentColor: '#FF5B5F',
      clockPeriod: completed ? 'full_time' : 'first_half',
      clockElapsedMs: 754000,
      clockStartedAt: null,
      createdAt: '2026-09-11T10:00:00.000Z',
      updatedAt: '2026-09-11T10:00:00.000Z',
      eventTitle: 'Test match',
      eventStatus: completed ? 'completed' : 'scheduled',
      eventScheduledAt: '2026-09-11T10:00:00.000Z',
      eventLocation: 'Main field',
      competitionName: null,
      opponentSquad: [],
    }),
  );
}

test('account switching clears private dashboard cache', async ({ page }) => {
  let active = 'a';
  await page.route('**/auth/session', (route) =>
    json(
      route,
      active === 'a'
        ? session('Coach A', 'Alpha FC', 'coach-a')
        : session('Coach B', 'Beta FC', 'coach-b'),
    ),
  );
  await page.route('**/auth/sign-out', (route) => {
    active = 'signed-out';
    return json(route, { success: true });
  });
  await page.route('**/auth/sign-in', (route) => {
    active = 'b';
    return json(route, { success: true });
  });
  await page.route('**/api/dashboard', (route) =>
    json(route, {
      activeAthletesCount: active === 'a' ? 11 : 2,
      totalEventsCount: 0,
      upcomingEvents: [],
    }),
  );

  await page.goto('/dashboard');
  await expect(
    page.getByText('Welcome back, Coach A · Alpha FC', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /11 Active Athletes/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Sign Out' }).click();
  await page.goto('/login');
  await page.getByLabel('Email address').fill('coach-b@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: /sign in to dugout/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText('Welcome back, Coach B · Beta FC', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /2 Active Athletes/ }),
  ).toBeVisible();
});

test('authenticated sidebar navigates on mobile and preserves history', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/auth/session', (route) =>
    json(route, session('Mobile Coach', 'Pocket FC', 'mobile-coach')),
  );
  await page.route('**/api/dashboard', (route) =>
    json(route, {
      activeAthletesCount: 8,
      totalEventsCount: 0,
      upcomingEvents: [],
    }),
  );
  await page.route('**/api/events**', (route) => json(route, []));

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const mobileSidebar = page.locator('aside:visible');
  await expect(mobileSidebar.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await mobileSidebar.getByRole('link', { name: 'Events' }).click();

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('desktop sidebar collapse persists and theme toggle remains usable', async ({ page }) => {
  await page.route('**/auth/session', (route) =>
    json(route, session('Desktop Coach', 'Wide FC', 'desktop-coach')),
  );
  await page.route('**/api/dashboard', (route) =>
    json(route, {
      activeAthletesCount: 11,
      totalEventsCount: 2,
      upcomingEvents: [],
    }),
  );

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gaffer-sidebar-expanded'))).toBe('false');

  await page.getByRole('button', { name: /Switch to (light|dark) mode/ }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sport-coaching-theme'))).not.toBeNull();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
});

test('live match clock resumes from the persisted value', async ({ page }) => {
  await mockAuthenticatedMatch(page);
  await page.route(`**/api/matches/${MATCH_ID}/events`, (route) =>
    json(route, []),
  );

  await page.goto(`/matches/${MATCH_ID}/live`);

  await expect(page.getByText('12:34', { exact: true })).toBeVisible();
  await expect(page.getByText('1ST HALF', { exact: true })).toBeVisible();
});

test('post-match correction updates the visible timeline', async ({ page }) => {
  await mockAuthenticatedMatch(page, true);
  let event = {
    id: LOG_ID,
    matchId: MATCH_ID,
    athleteId: null,
    team: 'own',
    opponentLabel: null,
    opponentPlayerId: null,
    eventType: 'goal',
    minute: 10,
    detail: null,
    loggedByUserId: 'test-coach',
    manuallyAdjusted: false,
    clientRequestId: null,
    createdAt: '2026-09-11T10:10:00.000Z',
    updatedAt: '2026-09-11T10:10:00.000Z',
    athlete: null,
    opponentPlayer: null,
  };
  await page.route(`**/api/matches/${MATCH_ID}/events`, (route) =>
    json(route, [event]),
  );
  await page.route(
    `**/api/matches/${MATCH_ID}/events/${LOG_ID}`,
    async (route) => {
      event = {
        ...event,
        ...((await route.request().postDataJSON()) as object),
        manuallyAdjusted: true,
      };
      return json(route, event);
    },
  );

  await page.goto(`/matches/${MATCH_ID}/report`);
  await expect(
    page.getByRole('heading', { name: 'Match Events' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /10' Goal/i }).click();
  await page.getByLabel('Minute').fill('12');
  await page.getByLabel('Event type').selectOption('yellow_card');
  await page.getByRole('button', { name: 'SAVE CHANGES' }).click();

  await expect(page.getByRole('button', { name: /12' Yellow Card/i })).toBeVisible();
  await expect(page.getByText('Manually adjusted')).toBeVisible();
});

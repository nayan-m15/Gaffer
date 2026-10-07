import { test, expect, type Page } from '@playwright/test';

const positions = ['ST', 'CF', 'LW', 'RW', 'CM', 'CAM', 'AM', 'CDM', 'DM', 'LM', 'RM', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'GK', 'goalkeeper', 'centre-forward', 'defensive midfielder'];
const squad = positions.map((position, index) => ({
  id: 'player-' + index, firstName: 'Player' + index, lastName: 'Test', position,
  squadNumber: index === 0 ? null : index + 1, team: { id: 'team-1', name: 'Test Team' },
  statistics: { appearances: 9, starts: 7, minutesPlayed: 600, goals: 2, assists: 3, saves: 12, yellowCards: 1, redCards: 0 },
}));
const carousel = (page: Page) => page.getByRole('group', { name: 'Squad showcase player cards' });
const cards = (page: Page) => page.locator('.depth-carousel__card');
const activeCard = (page: Page) => page.locator('.depth-carousel__card[data-active="true"]');

async function openDashboard(page: Page, options: { players?: typeof squad; authenticated?: boolean } = {}) {
  let tokenRequests = 0;
  let authenticated = options.authenticated;
  await page.route('**/sync/token', route => { tokenRequests++; authenticated = false; return route.fulfill({ status: 401, json: {} }); });
  await page.route('**/v1/public-dashboard/**', async route => {
    const resource = new URL(route.request().url()).pathname.split('/').pop();
    const data = resource === 'players' ? options.players ?? squad : resource === 'filters'
      ? { teams: [{ id: 'team-1', name: 'Test Team' }], seasons: [], competitions: [] } : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.route('**/auth/session', route => route.fulfill(authenticated
    ? { json: { user: { id: 'test-user', name: 'Test User', email: 'test@example.com', image: null, emailVerified: true }, team: null } }
    : { status: 401, json: {} }));
  await page.route('**/auth/get-session', route => route.fulfill({ json: null }));
  await page.goto('/public-dashboard');
  await expect(page.getByRole('heading', { name: 'Squad Showcase', exact: true })).toBeVisible();
  return Object.assign(() => tokenRequests, { expire: () => { authenticated = false; } });
}

test('upright cards, arrows, keyboard and looping preserve readable statistics', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const tokens = await openDashboard(page);
  await expect(cards(page)).toHaveCount(squad.length);
  await expect(activeCard(page).locator('h3')).toHaveText('Player0 Test');
  await expect(activeCard(page).getByText('No number', { exact: true })).toBeVisible();
  await expect(activeCard(page)).toHaveCSS('filter', 'none');
  await expect(activeCard(page).locator('dl').first().locator('dt')).toHaveText(['Appearances', 'Goals', 'Assists']);
  const details = activeCard(page).locator('summary');
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(activeCard(page).getByText('Minutes played', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(activeCard(page).locator('h3')).toHaveText('Player1 Test');
  await carousel(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(activeCard(page).locator('h3')).toHaveText('Player0 Test');
  await page.keyboard.press('ArrowLeft');
  await expect(activeCard(page).locator('h3')).toHaveText('Player19 Test');
  await page.getByRole('button', { name: 'Goalkeepers', exact: true }).click();
  await expect(activeCard(page).locator('dl').first().locator('dt')).toHaveText(['Appearances', 'Saves', 'Starts']);
  await expect(page.getByText('No upcoming fixtures currently scheduled.')).toBeVisible();
  expect(tokens()).toBe(0);
  expect(errors).toEqual([]);
});

test('position and search filters feed both views, including one and zero players', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  for (const [label, expectedPositions] of [
    ['Forwards', ['ST', 'CF', 'LW', 'RW', 'centre-forward']],
    ['Midfielders', ['CM', 'CAM', 'AM', 'CDM', 'DM', 'LM', 'RM', 'defensive midfielder']],
    ['Defenders', ['CB', 'LB', 'RB', 'LWB', 'RWB']],
    ['Goalkeepers', ['GK', 'goalkeeper']],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const names = squad.filter(player => (expectedPositions as readonly string[]).includes(player.position)).map(player => player.firstName + ' Test');
    await expect(cards(page).locator('h3')).toHaveText(names);
    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await expect(page.locator('#players article h3')).toHaveText(names);
    await page.getByRole('button', { name: 'Carousel', exact: true }).click();
    await expect(activeCard(page).locator('h3')).toHaveText(names[0]);
  }
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search players by name').fill('Player0 Test');
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Next slide', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.locator('#players article')).toHaveCount(1);
  await page.getByLabel('Search players by name').fill('missing player');
  await expect(page.locator('#players article')).toHaveCount(0);
  await expect(page.getByText('No players found matching “missing player”.')).toBeVisible();
  await page.getByRole('button', { name: 'Carousel', exact: true }).click();
  await expect(carousel(page)).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`both views fit mobile and desktop in ${theme} theme with reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme as 'light' | 'dark' });
    await page.addInitScript(theme => localStorage.setItem('sport-coaching-theme', theme), theme);
    await openDashboard(page, { authenticated: true, players: [{ ...squad[0], firstName: 'Alexandertheexceptionallylongunbrokenfirstname', lastName: 'A very long family name' }, ...squad.slice(1)] });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ['Carousel', 'Grid']) {
        await page.getByRole('button', { name: view, exact: true }).click();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const card = page.locator('#players article').first();
        await expect.poll(() => card.evaluate(el => { const bounds = el.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth; })).toBe(true);
        if ((width === 1440 && view === 'Grid') || (width === 390 && view === 'Carousel')) {
          await page.locator('#players').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/dashboard-${theme}-${width}-${view.toLowerCase()}.png` });
        }
      }
    }
    await page.getByRole('button', { name: 'Carousel', exact: true }).click();
    await carousel(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(activeCard(page).locator('h3')).toHaveText('Player1 Test');
    expect(await activeCard(page).evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
  });
}

test('swipe uses native horizontal scrolling without taking over vertical page scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await carousel(page).scrollIntoViewIfNeeded();
  const track = page.locator('.depth-carousel__stage');
  const bounds = await track.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 80);
  await page.mouse.wheel(320, 0);
  await expect.poll(() => track.evaluate(el => el.scrollLeft)).toBeGreaterThan(200);
  await expect(activeCard(page).locator('h3')).toHaveText('Player1 Test');
});

test('empty squads never produce demo slides or image requests', async ({ page }) => {
  const images: string[] = [];
  page.on('request', request => { if (request.url().includes('picsum')) images.push(request.url()); });
  await openDashboard(page, { players: [] });
  await expect(page.getByText('No players found matching the selected filters.')).toBeVisible();
  await expect(carousel(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.locator('#players article')).toHaveCount(0);
  expect(images).toEqual([]);
});


test('session expiry stops token retries while the public squad remains usable', async ({ page }) => {
  const tokens = await openDashboard(page, { authenticated: true });
  await page.goto('/dashboard');
  await expect.poll(async () => page.url().includes('/login') || await page.getByRole('button', { name: 'Sign Out', exact: true }).isVisible()).toBe(true);
  tokens.expire();
  const expiredSession = page.waitForResponse(response => response.url().endsWith('/auth/session') && response.status() === 401);
  await page.evaluate(() => window.dispatchEvent(new Event('gaffer-session-expired')));
  await expiredSession;
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  const signedOutRequests = tokens();
  // Allow the SDK retry interval to pass after the mocked session expires.
  await page.waitForTimeout(6000);
  expect(tokens()).toBe(signedOutRequests);
  await page.goto('/public-dashboard');
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.locator('#players article')).toHaveCount(squad.length);
});

test('next match precedes the squad, with recent results beside standings on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openDashboard(page);
  const fixture = { id: 'match-1', eventId: 'event-1', title: 'League match', status: 'scheduled', scheduledAt: '2026-10-10T12:00:00Z', location: 'Test ground', opponentName: 'Next Rivals', isHome: true, teamScore: 0, opponentScore: 0, team: { id: 'team-1', name: 'Test Team' }, competition: null, season: null };
  await page.route('**/v1/public-dashboard/matches*', route => route.fulfill({ json: { success: true, data: [
    { ...fixture, id: 'later', opponentName: 'Later Rivals', scheduledAt: '2026-11-10T12:00:00Z' },
    fixture,
    { ...fixture, id: 'cancelled', opponentName: 'Cancelled Rivals', status: 'cancelled', scheduledAt: '2026-10-09T12:00:00Z' },
    { ...fixture, id: 'completed', opponentName: 'Previous Rivals', status: 'completed', teamScore: 2, opponentScore: 1 },
  ] } }));
  await page.reload();
  await expect(page.locator('#next-match').getByText('Next Rivals', { exact: true })).toBeVisible();
  await expect(page.locator('#next-match').getByText('Later Rivals', { exact: true })).toHaveCount(0);
  await expect(page.locator('#matches').getByText('Previous Rivals', { exact: true })).toBeVisible();
  const layout = await page.evaluate(() => {
    const next = document.querySelector('#next-match')!.getBoundingClientRect();
    const squad = document.querySelector('#players')!.getBoundingClientRect();
    const results = document.querySelector('#matches')!.getBoundingClientRect();
    const standings = document.querySelector('#team-statistics')!.getBoundingClientRect();
    return { order: next.top < squad.top && squad.top < results.top, aligned: Math.abs(results.top - standings.top) < 2, beside: results.right <= standings.left };
  });
  expect(layout).toEqual({ order: true, aligned: true, beside: true });
});

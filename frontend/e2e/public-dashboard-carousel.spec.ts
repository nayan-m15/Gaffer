import { test, expect, type Page } from '@playwright/test';

const positions = ['ST', 'CF', 'LW', 'RW', 'CM', 'CAM', 'AM', 'CDM', 'DM', 'LM', 'RM', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'GK', 'goalkeeper', 'centre-forward', 'defensive midfielder'];
const squad = positions.map((position, index) => ({
  id: 'player-' + index, firstName: 'Player' + index, lastName: 'Test', position,
  squadNumber: index + 1, team: { id: 'team-1', name: 'Test Team' },
  statistics: { appearances: 9, starts: 7, minutesPlayed: 600, goals: 2, assists: 3, saves: 12, yellowCards: 1, redCards: 0 },
}));
const track = (page: Page) => page.locator('.flex-carousel__track');
const previous = (page: Page) => page.getByRole('button', { name: 'Previous players', exact: true });
const next = (page: Page) => page.getByRole('button', { name: 'Next players', exact: true });
const left = (page: Page) => track(page).evaluate(element => element.scrollLeft);

async function openDashboard(page: Page, getSquad = () => squad) {
  await page.route('**/v1/public-dashboard/**', async route => {
    const resource = new URL(route.request().url()).pathname.split('/').pop();
    const data = resource === 'players' ? getSquad() : resource === 'filters'
      ? { teams: [{ id: 'team-1', name: 'Test Team' }], seasons: [], competitions: [] } : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.route('**/auth/get-session', route => route.fulfill({ json: null }));
  await page.goto('/public-dashboard');
  // Keep document scrolling instant so the unrelated sticky bar cannot chase test clicks.
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await expect(page.locator('.flex-carousel__card')).toHaveCount(squad.length);
  await track(page).scrollIntoViewIfNeeded();
}

async function assertLayout(page: Page, columns: number) {
  await expect.poll(() => track(page).evaluate(element => {
    const card = element.firstElementChild as HTMLElement;
    return Math.round((element.clientWidth + 12) / (card.offsetWidth + 12));
  })).toBe(columns);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Resting visible cards and their stats stay inside the scrolling viewport.
  await expect.poll(() => track(page).evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [...element.children].filter(child => {
      const card = child.getBoundingClientRect();
      return card.left >= bounds.left - 1 && card.right <= bounds.right + 1;
    }).every(child => {
      const card = child.querySelector('article')!.getBoundingClientRect();
      return card.left >= bounds.left - 1 && card.right <= bounds.right + 1 && card.top >= bounds.top && card.bottom <= bounds.bottom;
    });
  })).toBe(true);
}

test('desktop drag, trackpad, controls and first/last slide boundaries', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openDashboard(page);
  await assertLayout(page, 4);
  await expect(previous(page)).toBeDisabled();
  await expect(next(page)).toBeEnabled();
  await next(page).click();
  await expect.poll(() => left(page)).toBe(307);
  await previous(page).click();
  await expect.poll(() => left(page)).toBe(0);

  const bounds = (await track(page).boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height - 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height - 100, { steps: 20 });
  await page.mouse.up();
  await expect.poll(() => left(page)).toBe(614);
  await page.mouse.wheel(650, 0);
  await expect.poll(() => left(page)).toBeGreaterThan(614);

  await track(page).focus();
  await page.keyboard.press('End');
  await expect(next(page)).toBeDisabled();
  await expect(previous(page)).toBeEnabled();
  await expect.poll(() => track(page).evaluate(element => Math.abs(element.scrollWidth - element.clientWidth - element.scrollLeft))).toBeLessThanOrEqual(1);
  await assertLayout(page, 4);
  await previous(page).click();
  await expect(next(page)).toBeEnabled();
  await track(page).focus();
  await page.keyboard.press('Home');
  await expect(previous(page)).toBeDisabled();
  await expect.poll(() => left(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('position/search filters reset navigation and preserve public card stats', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  for (const [label, expectedPositions] of [
    ['Forwards', ['ST', 'CF', 'LW', 'RW', 'centre-forward']],
    ['Midfielders', ['CM', 'CAM', 'AM', 'CDM', 'DM', 'LM', 'RM', 'defensive midfielder']],
    ['Defenders', ['CB', 'LB', 'RB', 'LWB', 'RWB']],
    ['Goalkeepers', ['GK', 'goalkeeper']],
  ] as const) {
    await track(page).focus();
    await page.keyboard.press('End');
    await expect(next(page)).toBeDisabled();
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.flex-carousel__card')).toHaveCount(expectedPositions.length);
    await expect.poll(() => left(page)).toBe(0);
    await expect(previous(page)).toBeDisabled();
    await expect(next(page)).toBeEnabled();
    const expectedNames = squad.filter(player => (expectedPositions as readonly string[]).includes(player.position)).map(player => player.firstName + ' Test');
    await expect(page.locator('.flex-carousel__card h3')).toHaveText(expectedNames);
    await expect(page.locator('.flex-carousel__card dt', { hasText: /^Starts$/ })).toHaveCount(expectedPositions.length);
    await expect(page.locator('.flex-carousel__card dt', { hasText: /Minutes/ })).toHaveCount(0);
    if (label === 'Goalkeepers') await expect(page.locator('.flex-carousel__card dt', { hasText: /^Saves$/ })).toHaveCount(2);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(previous(page)).toBeDisabled();
  await expect(next(page)).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(next(page)).toBeEnabled();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search players by name').fill('Player0 Test');
  await expect(page.locator('.flex-carousel__card')).toHaveCount(1);
  await expect(next(page)).toHaveCount(0);
  await page.getByLabel('Search players by name').fill('missing player');
  await expect(track(page)).toHaveCount(0);
  await expect(page.getByText('No players found matching “missing player”.')).toBeVisible();
  await page.getByLabel('Search players by name').fill('');
  await expect(page.locator('.flex-carousel__card')).toHaveCount(squad.length);
  await expect(previous(page)).toBeDisabled();
  await expect(next(page)).toBeEnabled();
});

test('responsive resizing and native touch swipe', async ({ page, browserName }) => {
  await openDashboard(page);
  for (const [width, columns] of [[1440, 4], [1100, 3], [768, 2], [390, 1], [320, 1]]) {
    await page.setViewportSize({ width, height: 900 });
    await track(page).focus();
    await page.keyboard.press('Home');
    await expect(previous(page)).toBeDisabled();
    await expect.poll(() => left(page)).toBe(0);
    await assertLayout(page, columns);
  }
  // Chromium's input protocol sends native touch events, not synthetic React events.
  test.skip(browserName !== 'chromium', 'Native swipe uses the Chromium input protocol');
  await track(page).scrollIntoViewIfNeeded();
  const session = await page.context().newCDPSession(page);
  const bounds = (await track(page).boundingBox())!;
  const x = bounds.x + bounds.width * 0.85;
  const y = bounds.y + 150;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 12; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 18, y }] });
    await page.waitForTimeout(16);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => left(page)).toBeGreaterThan(100);
  await expect(previous(page)).toBeEnabled();
  await track(page).focus();
  await page.keyboard.press('End');
  await expect(next(page)).toBeDisabled();
  await assertLayout(page, 1);
});

test('same-count squad refetch resets scroll and recalculates controls', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  let currentSquad = squad;
  await openDashboard(page, () => currentSquad);
  await track(page).focus();
  await page.keyboard.press('End');
  await expect(next(page)).toBeDisabled();
  currentSquad = squad.map(player => ({ ...player, id: 'new-' + player.id, firstName: 'New' + player.firstName }));
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.flex-carousel__card h3').first()).toHaveText('NewPlayer0 Test');
  await expect.poll(() => left(page)).toBe(0);
  await expect(previous(page)).toBeDisabled();
  await expect(next(page)).toBeEnabled();
});

test('reference lens, caption and click-to-focus preserve live player statistics', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openDashboard(page);
  await expect.poll(() => page.locator('.flex-carousel__viewport').evaluate(element => getComputedStyle(element).filter)).toContain('url(');
  await expect(page.locator('.flex-carousel__title')).toHaveText('Player0 Test');
  const card = page.locator('.flex-carousel__card').nth(1);
  await card.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await card.click({ position: { x: 140, y: 230 } });
  await expect(page.locator('.flex-carousel__focus-card')).toBeVisible();
  await expect(page.locator('.flex-carousel__focus-card h3')).toHaveText('Player1 Test');
  await expect(page.locator('.flex-carousel__title')).toHaveText('Player1 Test');
  await expect(page.locator('.flex-carousel__focus-card dt', { hasText: /^Starts$/ })).toHaveCount(1);
  await expect(page.locator('.flex-carousel__viewport')).toHaveCSS('filter', 'none');
  await page.keyboard.press('Escape');
  await expect(page.locator('.flex-carousel__focus-card')).toHaveCount(0);
  await expect.poll(() => page.locator('.flex-carousel__viewport').evaluate(element => getComputedStyle(element).filter)).toContain('url(');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.flex-carousel__viewport')).toHaveCSS('filter', 'none');
  await next(page).click();
  await expect(previous(page)).toBeEnabled();
});

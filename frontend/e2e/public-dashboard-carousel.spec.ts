import { test, expect, type Page } from '@playwright/test';

const positions = ['ST', 'CF', 'LW', 'RW', 'CM', 'CAM', 'AM', 'CDM', 'DM', 'LM', 'RM', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'GK', 'goalkeeper', 'centre-forward', 'defensive midfielder'];
const squad = positions.map((position, index) => ({
  id: 'player-' + index, firstName: 'Player' + index, lastName: 'Test', position,
  squadNumber: index + 1, team: { id: 'team-1', name: 'Test Team' },
  statistics: { appearances: 9, starts: 7, minutesPlayed: 600, goals: 2, assists: 3, saves: 12, yellowCards: 1, redCards: 0 },
}));

const carousel = (page: Page) => page.getByRole('group', { name: 'Squad showcase player cards' });
const cards = (page: Page) => page.locator('.depth-carousel__card');
const activeCard = (page: Page) => page.locator('.depth-carousel__card[aria-hidden="false"]');

async function openDashboard(page: Page) {
  await page.route('**/v1/public-dashboard/**', async route => {
    const resource = new URL(route.request().url()).pathname.split('/').pop();
    const data = resource === 'players' ? squad : resource === 'filters'
      ? { teams: [{ id: 'team-1', name: 'Test Team' }], seasons: [], competitions: [] } : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.route('**/auth/get-session', route => route.fulfill({ json: null }));
  await page.goto('/public-dashboard');
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await expect(cards(page)).toHaveCount(squad.length);
  await carousel(page).scrollIntoViewIfNeeded();
  await carousel(page).focus();
}

test('depth stack, controls, keyboard and looping preserve live player cards', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openDashboard(page);
  await expect(activeCard(page).locator('h3')).toHaveText('Player0 Test');
  await expect(carousel(page)).toHaveCSS('perspective', '1650px');
  await expect(carousel(page)).toHaveCSS('height', '500px');
  await expect(cards(page).first()).toHaveCSS('border-radius', '23px');
  await expect.poll(() => cards(page).evaluateAll(elements => elements.filter(el => getComputedStyle(el).opacity === '1').length)).toBe(5);
  await page.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(activeCard(page).locator('h3')).toHaveText('Player1 Test');
  await carousel(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(activeCard(page).locator('h3')).toHaveText('Player0 Test');
  await page.keyboard.press('ArrowLeft');
  await expect(activeCard(page).locator('h3')).toHaveText('Player19 Test');
  await page.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(activeCard(page).locator('h3')).toHaveText('Player0 Test');
  await page.getByRole('button', { name: 'Go to slide 17', exact: true }).click();
  await expect(activeCard(page).locator('h3')).toHaveText('Player16 Test');
  await expect(activeCard(page).locator('dt', { hasText: /^Saves$/ })).toHaveCount(1);
  await expect(activeCard(page).locator('dt', { hasText: /^Starts$/ })).toHaveCount(1);
  await expect(activeCard(page).locator('dt', { hasText: /Minutes/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('position and search filters reset the stack and preserve statistics', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  for (const [label, expectedPositions] of [
    ['Forwards', ['ST', 'CF', 'LW', 'RW', 'centre-forward']],
    ['Midfielders', ['CM', 'CAM', 'AM', 'CDM', 'DM', 'LM', 'RM', 'defensive midfielder']],
    ['Defenders', ['CB', 'LB', 'RB', 'LWB', 'RWB']],
    ['Goalkeepers', ['GK', 'goalkeeper']],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await carousel(page).focus();
    await expect(cards(page)).toHaveCount(expectedPositions.length);
    const names = squad.filter(player => (expectedPositions as readonly string[]).includes(player.position)).map(player => player.firstName + ' Test');
    await expect(cards(page).locator('h3')).toHaveText(names);
    await expect(activeCard(page).locator('h3')).toHaveText(names[0]);
    await expect(cards(page).locator('dt', { hasText: /^Starts$/ })).toHaveCount(names.length);
  }
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search players by name').fill('Player0 Test');
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Next slide', exact: true })).toHaveCount(0);
  await page.getByLabel('Search players by name').fill('missing player');
  await expect(carousel(page)).toHaveCount(0);
  await expect(page.getByText('No players found matching “missing player”.')).toBeVisible();
});

test('responsive stack and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => activeCard(page).evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth;
    })).toBe(true);
  }
  await carousel(page).evaluate(el => (el as HTMLElement).blur());
  await page.mouse.move(0, 0);
  await page.waitForTimeout(3500);
  await expect(activeCard(page).locator('h3')).toHaveText('Player0 Test');
  await page.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(activeCard(page).locator('h3')).toHaveText('Player1 Test');
});

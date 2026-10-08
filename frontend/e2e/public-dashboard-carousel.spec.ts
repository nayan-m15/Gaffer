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

async function openDashboard(page: Page, players = squad) {
  await page.route('**/v1/public-dashboard/**', async route => {
    const resource = new URL(route.request().url()).pathname.split('/').pop();
    const data = resource === 'players' ? players : resource === 'filters'
      ? { teams: [{ id: 'team-1', name: 'Test Team' }], seasons: [], competitions: [] } : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.route('**/auth/get-session', route => route.fulfill({ json: null }));
  await page.goto('/public-dashboard');
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await expect(cards(page)).toHaveCount(players.length);
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
  await expect(carousel(page)).toHaveCSS('height', '580px');
  await expect(cards(page).first()).toHaveCSS('border-radius', '26px');
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

const primaryLabels = ['Appearances', 'Goals', 'Starts', 'Assists', 'Yellow cards', 'Red cards'];

test('primary stats and goalkeeper saves fit both themes at common widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [filter, labels, values] of [
        ['Forwards', primaryLabels, ['9', '2', '7', '3', '1', '0']],
        ['Goalkeepers', [...primaryLabels, 'Saves'], ['9', '2', '7', '3', '1', '0', '12']],
      ] as const) {
        await page.getByRole('button', { name: filter, exact: true }).click();
        await expect(activeCard(page).locator('dt')).toHaveText([...labels]);
        await expect(activeCard(page).locator('dd')).toHaveText([...values]);
        await expect.poll(() => activeCard(page).evaluate(el => {
          const card = el.getBoundingClientRect();
          const stats = el.querySelector('dl')!.getBoundingClientRect();
          return stats.bottom < card.bottom - 12 && stats.left >= card.left && stats.right <= card.right;
        })).toBe(true);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const colors = await activeCard(page).locator('article').evaluate(el => ({
          actual: getComputedStyle(el).backgroundColor,
        }));
        expect(colors.actual).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(17, 19, 21)');
      }
    }
  }
});

test('long names truncate and missing statistics remain unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const player = { ...squad[0], firstName: 'Alexandertheverylongfirstname', lastName: 'Van der extraordinarily long surname', statistics: { ...squad[0].statistics, goals: undefined as unknown as number } };
  await openDashboard(page, [player]);
  await expect(activeCard(page).locator('h3')).toHaveAttribute('title', player.firstName + ' ' + player.lastName);
  await expect(activeCard(page).locator('dd')).toHaveText(['9', '—', '7', '3', '1', '0']);
  await expect(activeCard(page).getByRole('img', { name: player.firstName + ' ' + player.lastName + ' avatar' })).toBeVisible();
  await expect(activeCard(page).locator('article')).toHaveJSProperty('scrollWidth', await activeCard(page).locator('article').evaluate(el => el.clientWidth));
});

test('touch pointer swipes preserve carousel navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 900 });
  await openDashboard(page);
  const bounds = await carousel(page).boundingBox();
  if (!bounds) throw new Error('Carousel is missing');
  const session = await page.context().newCDPSession(page);
  const y = bounds.y + bounds.height / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 220, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + 120, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + 20, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await expect(activeCard(page).locator('h3')).not.toHaveText('Player0 Test');
});


test('large squad indicators stay on one scrollable line below the cards', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const players = Array.from({ length: 240 }, (_, index) => ({ ...squad[0], id: 'large-squad-' + index, firstName: 'Player' + index }));
  await openDashboard(page, players);
  const dots = page.locator('.public-player-carousel .depth-carousel__dots');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => dots.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const tops = Array.from(el.children, child => Math.round(child.getBoundingClientRect().top));
      const card = document.querySelector('.depth-carousel__card[aria-hidden="false"]')!.getBoundingClientRect();
      return new Set(tops).size === 1 && bounds.height === 24 && bounds.top > card.bottom && bounds.left >= 0 && bounds.right <= innerWidth && el.scrollWidth > el.clientWidth;
    }), { timeout: 15_000 }).toBe(true);
  }
  await carousel(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(activeCard(page).locator('h3')).toHaveText('Player239 Test');
  await expect.poll(() => dots.evaluate(el => {
    const selected = el.querySelector('[aria-pressed="true"]')!.getBoundingClientRect();
    const bounds = el.getBoundingClientRect();
    return selected.left >= bounds.left && selected.right <= bounds.right;
  }), { timeout: 15_000 }).toBe(true);
  await dots.hover();
  await page.mouse.wheel(-200, 0);
  await expect(activeCard(page).locator('h3')).toHaveText('Player239 Test');
});

import { expect, test, type Page } from '@playwright/test';
import { cleanupUser, uniqueTestIdentity } from '../backend/test/utils/test-db';

const PASSWORD = 'password123';

/**
 * Every assertion that waits on a write reaching a remote Postgres gets this
 * instead of the 5s expect default — the round-trip regularly exceeds it on a
 * hosted database, and a too-short wait fails on latency, not on behaviour.
 */
const NETWORK = { timeout: 30_000 };

/**
 * Injury & Recovery through the real UI.
 *
 * Covers the manual log flow end to end: specifying an injury produces a
 * return estimate resolved by the backend's guidance table, saving it creates
 * a record with a seeded timeline, the 3D body model renders and marks the
 * injured region, the player is marked injured on the roster, and the record
 * appears in the injury history.
 *
 * Sign-up requires email verification, so the token is minted the same way
 * Better Auth does and redeemed through the real endpoint — matching
 * `team-management-status.spec.ts`.
 */

const sidebarLink = (page: Page, name: string) =>
  page.getByLabel('Main navigation').getByRole('link', { name });

async function registerCoachWithTeam(
  page: Page,
  email: string,
  teamName: string,
) {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Injury Test Coach');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /join the dugout/i }).click();
  await expect(page).toHaveURL(/\/verify-email$/, NETWORK);

  const { signJWT } = await import('better-auth/crypto');
  const token = await signJWT(
    { email: email.toLowerCase() },
    process.env.BETTER_AUTH_SECRET!,
    60 * 60,
  );
  const callbackURL = encodeURIComponent(
    'http://localhost:5173/login?verified=1',
  );
  await page.goto(`/auth/verify-email?token=${token}&callbackURL=${callbackURL}`);
  await expect(page).toHaveURL(/\/login\?verified=1$/, NETWORK);

  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in to dugout/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/, NETWORK);

  await page.getByRole('button', { name: 'Add Team' }).click();
  const teamDialog = page.getByRole('dialog', { name: 'Add your team' });
  await teamDialog.getByLabel('Team name').fill(teamName);
  await teamDialog.getByRole('button', { name: 'Create Team' }).click();
  await expect(teamDialog).toBeHidden(NETWORK);
}

test('a logged injury produces a record, a 3D model and an unavailable player', async ({
  page,
}) => {
  /* Sign-up, email verification, sign-in and team creation alone are a dozen
   * round-trips to a remote Postgres before this spec reaches its subject, so
   * the default per-test budget is raised rather than split across specs that
   * would each pay that setup cost again. */
  test.setTimeout(180_000);

  const { email, teamName } = uniqueTestIdentity('injury-e2e');

  try {
    await test.step('register a coach with a team', async () => {
      await registerCoachWithTeam(page, email, teamName);
    });

    await test.step('add an athlete to injure', async () => {
      await sidebarLink(page, 'Roster').click();
      await expect(page).toHaveURL(/\/athletes$/);
      await page.getByRole('button', { name: 'Add Athlete' }).click();

      const dialog = page.getByRole('dialog', { name: 'Add Athlete' });
      await dialog.getByLabel('First name').fill('Rosa');
      await dialog.getByLabel('Last name').fill('Hamstring');
      await dialog.getByLabel('Jersey number').fill('7');
      await dialog.getByRole('button', { name: 'Add Athlete' }).click();
      await expect(dialog).toBeHidden(NETWORK);
    });

    await test.step('the injuries page starts empty', async () => {
      await sidebarLink(page, 'Injuries').click();
      await expect(page).toHaveURL(/\/injuries$/);
      await expect(
        page.getByRole('heading', { name: 'Injury & Recovery' }),
      ).toBeVisible();
      await expect(page.getByText('No injuries on record')).toBeVisible(
        NETWORK,
      );
    });

    await test.step('specifying an injury previews a return estimate', async () => {
      await page
        .getByRole('button', { name: 'Log injury' })
        .first()
        .click();

      const dialog = page.getByRole('dialog', { name: 'Log an injury' });
      await expect(dialog).toBeVisible();

      // Nothing is claimed before a diagnosis exists.
      await expect(
        dialog.getByText(/Choose a region, kind and severity/),
      ).toBeVisible();

      await dialog
        .getByLabel('Player')
        .selectOption({ label: '#7 Rosa Hamstring' });
      await dialog
        .getByRole('button', { name: 'Right hamstring', exact: true })
        .click();
      await dialog.getByRole('button', { name: 'Strain', exact: true }).click();
      await dialog
        .getByRole('button', { name: /^Moderate/ })
        .click();

      // The window comes from the backend's guidance table: a moderate
      // hamstring strain is 21-42 days, which reads as 3-6 weeks.
      await expect(dialog.getByText('3–6 weeks')).toBeVisible(NETWORK);
      await expect(
        dialog.getByText(/not medical advice/i),
      ).toBeVisible();
    });

    await test.step('saving creates the record and focuses it', async () => {
      const dialog = page.getByRole('dialog', { name: 'Log an injury' });
      await dialog.getByLabel('Diagnosed by (optional)').fill('Club Physio');
      await dialog.getByRole('button', { name: 'Log injury' }).click();
      await expect(dialog).toBeHidden(NETWORK);

      // The page deep-links to the new record.
      await expect(page).toHaveURL(/\/injuries\?injury=/, NETWORK);
      await expect(
        page.getByRole('heading', { name: 'Right hamstring strain' }),
      ).toBeVisible(NETWORK);
      await expect(page.getByText('Club Physio')).toBeVisible();
      await expect(page.getByText('3–6 weeks')).toBeVisible();

      // The status is deliberately shown twice — on the model's callout and
      // in the detail card — so this scopes to the card's own field.
      const detailCard = page
        .locator('section')
        .filter({ hasText: 'Rehab status' })
        .first();
      await expect(
        detailCard.getByText('Reported', { exact: true }),
      ).toBeVisible();
    });

    await test.step('the summary counts the open injury', async () => {
      const injured = page
        .locator('section', { hasText: 'Currently injured' })
        .first();
      await expect(injured).toContainText('1');
    });

    await test.step('the timeline is seeded', async () => {
      const timeline = page.locator('section', {
        hasText: 'Injury timeline',
      });
      await expect(
        timeline.getByText('Injury sustained', { exact: true }),
      ).toBeVisible();
      await expect(
        timeline.getByText('Estimated return', { exact: true }),
      ).toBeVisible();
    });

    await test.step('the 3D model renders and marks the region', async () => {
      // A real WebGL canvas, sized by the layout rather than collapsed.
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();
      const box = await canvas.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(200);
      expect(box?.height ?? 0).toBeGreaterThan(200);

      // The camera presets are present and the front view starts selected.
      const angles = page.getByRole('group', { name: 'Camera angle' });
      await expect(
        angles.getByRole('button', { name: 'Front' }),
      ).toHaveAttribute('aria-pressed', 'true');
      await angles.getByRole('button', { name: 'Back' }).click();
      await expect(
        angles.getByRole('button', { name: 'Back' }),
      ).toHaveAttribute('aria-pressed', 'true');

      // The injured region is reachable without the canvas, which is what a
      // keyboard or screen-reader user relies on.
      await page
        .getByRole('group', { name: 'Camera angle' })
        .scrollIntoViewIfNeeded();
      await page
        .getByText('Select a region from a list instead')
        .click();
      await expect(
        page.getByRole('button', {
          name: 'Right hamstring',
          exact: true,
        }),
      ).toBeVisible();
    });

    await test.step('the muscle recovery panel is labelled as derived', async () => {
      const panel = page.locator('section', { hasText: 'Muscle recovery' });
      await expect(panel).toBeVisible();
      await expect(panel.getByText('Legs')).toBeVisible();
      await panel
        .getByRole('button', {
          name: 'How these percentages are calculated',
        })
        .click();
      await expect(
        panel.getByText(/not from training-load or physiological measurements/i),
      ).toBeVisible();
    });

    await test.step('the injury appears in the history record', async () => {
      await page.getByRole('tab', { name: 'Injury history' }).click();

      const table = page.getByRole('table');
      await expect(table).toBeVisible(NETWORK);
      const row = table.getByRole('row', { name: /Rosa Hamstring/ });
      await expect(row).toContainText('Right hamstring strain');
      await expect(row).toContainText('Moderate');
      await expect(row).toContainText('3–6 weeks');
      await expect(row).toContainText('Still out');
    });

    await test.step('the player is now injured on the roster', async () => {
      await sidebarLink(page, 'Roster').click();
      await expect(page).toHaveURL(/\/athletes$/);
      await expect(page.getByText('Rosa Hamstring').first()).toBeVisible(
        NETWORK,
      );
      await expect(page.getByText('Injured').first()).toBeVisible();
    });

    await test.step('the record survives a reload', async () => {
      await sidebarLink(page, 'Injuries').click();
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Right hamstring strain' }),
      ).toBeVisible(NETWORK);
    });

    await test.step('capture the rendered page', async () => {
      // Gives the 3D scene a moment to draw before the screenshot.
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();
      await page.waitForTimeout(1500);
      // The app shell scrolls its own main element, so a fullPage capture
      // only ever sees the viewport; a taller viewport is what shows the
      // whole layout in one shot.
      await page.setViewportSize({ width: 1440, height: 1800 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: 'test-results/injury-recovery-page.png' });
      await page
        .locator('section')
        .filter({ has: page.locator('canvas') })
        .first()
        .screenshot({ path: 'test-results/injury-recovery-model.png' });
    });
  } finally {
    await cleanupUser({ email, teamName });
  }
});

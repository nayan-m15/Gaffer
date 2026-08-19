import { expect, test } from '@playwright/test';
import { cleanupUser, uniqueTestIdentity } from '../backend/test/utils/test-db';

const PASSWORD = 'password123';

/**
 * Full main flow: Register → Dashboard → Roster (create an athlete) →
 * Events. Backend CRUD depth for athletes/events is covered by the
 * Supertest suites in `backend/test/`; this proves the same operations
 * work through the real browser and real UI.
 *
 * Event creation itself isn't driven here — `EventFormDialog` uses a custom
 * calendar/time-column picker (no plain date/time inputs), which would make
 * this test slow and flaky to automate for little extra signal over the
 * backend's `events.e2e-spec.ts`. This still visits `/events` and checks it
 * renders correctly for a signed-in coach.
 */
test('coach can register, add an athlete, and see it on the roster', async ({
  page,
}) => {
  const { email, teamName } = uniqueTestIdentity('s1-07-e2e');
  const name = 'Playwright Coach';
  const athlete = { firstName: 'Alex', lastName: 'Morgan', jerseyNumber: '10' };

  try {
    await test.step('register a new coach', async () => {
      await page.goto('/signup');

      await page.getByLabel('Full name').fill(name);
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page
        .getByLabel('Confirm password', { exact: true })
        .fill(PASSWORD);
      await page.getByLabel('Team / Squad name').fill(teamName);
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: /join the dugout/i }).click();

      await expect(page).toHaveURL(/\/dashboard$/);
    });

    await test.step('dashboard shows the account and team, and degrades gracefully with no backend data yet', async () => {
      await expect(
        page.getByRole('heading', { name: 'Dashboard' }),
      ).toBeVisible();
      await expect(
        page.getByText(`Welcome back, ${name} · ${teamName}`),
      ).toBeVisible();
      // `/dashboard` has no backend implementation yet (see README); the
      // page should fall back to empty states rather than error out.
      await expect(page.getByText('No Active Match')).toBeVisible();
      await expect(page.getByText('No season data available')).toBeVisible();
    });

    await test.step('add an athlete from the roster page', async () => {
      await page.getByRole('link', { name: 'Roster' }).click();
      await expect(page).toHaveURL(/\/athletes$/);

      await page.getByRole('button', { name: 'Add Athlete' }).click();

      const dialog = page.getByRole('dialog', { name: 'Add Athlete' });
      await dialog.getByLabel('First name').fill(athlete.firstName);
      await dialog.getByLabel('Last name').fill(athlete.lastName);
      await dialog.getByLabel('Jersey number').fill(athlete.jerseyNumber);
      await dialog.getByRole('button', { name: 'Add Athlete' }).click();

      await expect(dialog).toBeHidden();
      await expect(
        page
          .getByRole('table')
          .getByText(`${athlete.firstName} ${athlete.lastName}`),
      ).toBeVisible();
    });

    await test.step('events page loads for a signed-in coach with no events yet', async () => {
      await page.getByRole('link', { name: 'Events' }).click();
      await expect(page).toHaveURL(/\/events$/);
      await expect(page.getByText('No events yet')).toBeVisible();
    });
  } finally {
    await cleanupUser({ email, teamName });
  }
});

import { expect, test } from '@playwright/test';
import { cleanupUser, uniqueTestIdentity } from '../backend/test/utils/test-db';

// The card's original flow is Register → Create Athlete → See Athlete/Data
// on Dashboard. There's no athletes module on this branch yet (see the
// S1-07 plan notes), so this covers what's actually available today:
// Register → land on Dashboard → see your account and team rendered. Extend
// this once `feat/roster-crud` merges.
test('coach can register and see their account and team on the dashboard', async ({
  page,
}) => {
  const { email, teamName } = uniqueTestIdentity('s1-07-e2e');
  const name = 'Playwright Coach';

  try {
    await page.goto('/signup');

    await page.getByLabel('Full name').fill(name);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm password', { exact: true }).fill('password123');
    await page.getByLabel('Team / Squad name').fill(teamName);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /join the dugout/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: `Welcome back, ${name}` }),
    ).toBeVisible();
    await expect(page.getByText(`Coaching ${teamName}`)).toBeVisible();
  } finally {
    await cleanupUser({ email, teamName });
  }
});

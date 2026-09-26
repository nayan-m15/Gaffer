import { expect, test } from '@playwright/test';
import { cleanupUser, uniqueTestIdentity } from '../backend/test/utils/test-db';
import { emailVerificationUrl, FRONTEND_URL } from './utils/auth';

const PASSWORD = 'password123';
const NETWORK = { timeout: process.env.CI ? 60_000 : 30_000 };
const MAIN_FLOW_TIMEOUT = process.env.CI ? 360_000 : 180_000;

/**
 * Full main flow: Register → verify email → sign in → Dashboard (team-less)
 * → create the team via Add Team → Roster (create an athlete) → Events →
 * back to Dashboard (now reflecting the new athlete). Backend CRUD depth for
 * athletes/events/dashboard is covered by the Supertest suites in
 * `backend/test/`; this proves the same operations work through the real
 * browser and real UI, end to end.
 *
 * Email/password sign-up never issues a session until the address is
 * verified, so the flow parks on /verify-email first — the verification link
 * is redeemed here by minting the same token Better Auth embeds in it, since
 * e2e has no inbox to click the real one from.
 *
 * Event creation itself isn't driven here — `EventFormDialog` uses a custom
 * calendar/time-column picker (no plain date/time inputs), which would make
 * this test slow and flaky to automate for little extra signal over the
 * backend's `events.e2e-spec.ts`. This still visits `/events` and checks it
 * renders correctly for a signed-in coach.
 */
test('coach can register, verify, create a team, and see an athlete reflected on the roster and dashboard', async ({
  page,
}) => {
  test.setTimeout(MAIN_FLOW_TIMEOUT);
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
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: /join the dugout/i }).click();

      await expect(page).toHaveURL(/\/verify-email$/, NETWORK);
      await expect(
        page.getByText(`We sent a verification link to ${email}`),
      ).toBeVisible(NETWORK);
    });

    await test.step('verify the email address and sign in', async () => {
      // The emailed link points at the backend's Better Auth handler, which
      // marks the address verified, sets the session cookie, and 302s back
      // to the app.
      await page.goto(
        await emailVerificationUrl(email, `${FRONTEND_URL}/login?verified=1`),
      );

      await expect(page).toHaveURL(/\/login\?verified=1$/, NETWORK);
      await expect(
        page.getByText('Email verified — you can sign in now.'),
      ).toBeVisible(NETWORK);

      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: /sign in to dugout/i }).click();

      await expect(page).toHaveURL(/\/dashboard$/, NETWORK);
    });

    await test.step('dashboard renders for a team-less coach with an Add Team action', async () => {
      await expect(
        page.getByRole('heading', { name: 'Dashboard' }),
      ).toBeVisible(NETWORK);
      await expect(page.getByRole('button', { name: 'Add Team' })).toBeVisible(NETWORK);
      // Live match / season summary / recent form / stats are Sprint 2
      // fields the backend doesn't send yet — the page should render their
      // empty states rather than error out.
      await expect(page.getByText('No Active Match')).toBeVisible(NETWORK);
      await expect(page.getByText('No season data available')).toBeVisible(
        NETWORK,
      );
    });

    await test.step('create the team from the dashboard', async () => {
      await page.getByRole('button', { name: 'Add Team' }).click();

      const dialog = page.getByRole('dialog', { name: 'Add your team' });
      await dialog.getByLabel('Team name').fill(teamName);
      await dialog.getByRole('button', { name: 'Create Team' }).click();

      await expect(dialog).toBeHidden(NETWORK);
      await expect(
        page.getByText(`Welcome back, ${name} · ${teamName}`),
      ).toBeVisible(NETWORK);
      // With a team in place there is nothing left for Add Team to do.
      await expect(page.getByRole('button', { name: 'Add Team' })).toBeHidden(
        NETWORK,
      );
      await expect(
        page.getByRole('link', { name: /0 Active Athletes/ }),
      ).toBeVisible(NETWORK);
    });

    await test.step('add an athlete from the roster page', async () => {
      // Scoped to the sidebar navigation — the footer repeats the same links.
      const nav = page.getByLabel('Main navigation');
      await nav.getByRole('link', { name: 'Roster' }).click();
      await expect(page).toHaveURL(/\/athletes$/, NETWORK);

      await page.getByRole('button', { name: 'Add Athlete' }).click();

      const dialog = page.getByRole('dialog', { name: 'Add Athlete' });
      await dialog.getByLabel('First name').fill(athlete.firstName);
      await dialog.getByLabel('Last name').fill(athlete.lastName);
      await dialog.getByLabel('Jersey number').fill(athlete.jerseyNumber);
      await dialog.getByRole('button', { name: 'Add Athlete' }).click();

      await expect(dialog).toBeHidden(NETWORK);
      await expect(
        page
          .getByRole('table')
          .getByText(`${athlete.firstName} ${athlete.lastName}`),
      ).toBeVisible(NETWORK);
    });

    await test.step('events page loads for a signed-in coach with no events yet', async () => {
      await page.getByLabel('Main navigation').getByRole('link', { name: 'Events' }).click();
      await expect(page).toHaveURL(/\/events$/, NETWORK);
      // The agenda panel carries the visible empty state; the month grid's
      // own "No events this month — click a day to add one." is aria-hidden,
      // so the exact match resolves to exactly one element.
      await expect(
        page.getByText('No events this month', { exact: true }),
      ).toBeVisible(NETWORK);
    });

    await test.step('dashboard reflects the athlete just added', async () => {
      await page.getByLabel('Main navigation').getByRole('link', { name: 'Dashboard' }).click();
      await expect(page).toHaveURL(/\/dashboard$/, NETWORK);
      // The dashboard query has a 30s staleTime, so a client-side nav back
      // within that window would just replay the cached pre-athlete data —
      // reload to force the same fresh fetch a real page load would do.
      await page.reload();
      await expect(
        page.getByRole('link', { name: /1 Active Athletes/ }),
      ).toBeVisible(NETWORK);
    });
  } finally {
    await cleanupUser({ email, teamName });
  }
});

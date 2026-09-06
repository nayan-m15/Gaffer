import { expect, test } from '@playwright/test';
import { cleanupUser, uniqueTestIdentity } from '../backend/test/utils/test-db';

const PASSWORD = 'password123';

/**
 * Athlete-status integration with Team Management, through the real UI.
 *
 * Sign-up requires email verification, so the verification token is minted
 * the same way Better Auth does — an HS256 JWT over { email } signed with
 * the auth secret — and redeemed through the real /auth/verify-email
 * endpoint before signing in.
 *
 * Covers: bench cards show each athlete's persisted status (Available /
 * Injured / Suspended, reusing the roster's StatusBadge), the status-bar
 * availability chips, auto-fill keeping unavailable players on the bench,
 * and a Roster status edit being reflected in Team Management through the
 * shared athletes query cache (plus persistence across a full reload).
 */
test('team management reflects athlete status badges and roster edits', async ({
  page,
}) => {
  const { email, teamName } = uniqueTestIdentity('tm-status-e2e');
  const coach = 'TM Status Coach';

  try {
    await test.step('register a new coach', async () => {
      await page.goto('/signup');
      await page.getByLabel('Full name').fill(coach);
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page
        .getByLabel('Confirm password', { exact: true })
        .fill(PASSWORD);
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: /join the dugout/i }).click();

      // Email verification is required: the UI parks on /verify-email.
      await expect(page).toHaveURL(/\/verify-email$/);
    });

    await test.step('verify email with a Better Auth-compatible token', async () => {
      const { signJWT } = await import('better-auth/crypto');
      const token = await signJWT(
        { email: email.toLowerCase() },
        process.env.BETTER_AUTH_SECRET!,
        60 * 60,
      );
      // Real browser navigation through the Vite /auth proxy: Better Auth
      // marks the address verified, auto-signs-in (session cookie), and 302s
      // to the login page with the verified notice.
      const callbackURL = encodeURIComponent(
        'http://localhost:5173/login?verified=1',
      );
      await page.goto(
        `/auth/verify-email?token=${token}&callbackURL=${callbackURL}`,
      );
      await expect(page).toHaveURL(/\/login\?verified=1$/);
    });

    await test.step('sign in and create the team', async () => {
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: /sign in to dugout/i }).click();

      await expect(page).toHaveURL(/\/dashboard$/);

      // No team yet — the dashboard header offers team creation.
      await page.getByRole('button', { name: 'Add Team' }).click();
      const teamDialog = page.getByRole('dialog', { name: 'Add your team' });
      await teamDialog.getByLabel('Team name').fill(teamName);
      await teamDialog.getByRole('button', { name: 'Create Team' }).click();
      await expect(teamDialog).toBeHidden();
    });

    await test.step('create one athlete per status from the roster', async () => {
      const athletes = [
        { first: 'Domi', last: 'Available', status: 'available' },
        { first: 'Ines', last: 'Injured', status: 'injured' },
        { first: 'Suri', last: 'Suspended', status: 'suspended' },
      ];

      for (const athlete of athletes) {
        await page.getByRole('link', { name: 'Roster' }).click();
        await expect(page).toHaveURL(/\/athletes$/);
        await page.getByRole('button', { name: 'Add Athlete' }).click();

        const dialog = page.getByRole('dialog', { name: 'Add Athlete' });
        await dialog.getByLabel('First name').fill(athlete.first);
        await dialog.getByLabel('Last name').fill(athlete.last);
        await dialog.getByLabel('Jersey number').fill('9');
        if (athlete.status !== 'available') {
          await dialog.getByLabel('Status').selectOption(athlete.status);
        }
        await dialog.getByRole('button', { name: 'Add Athlete' }).click();
        await expect(dialog).toBeHidden();
      }
    });

    await test.step('team management bench shows each status badge', async () => {
      await page.getByRole('link', { name: 'Team' }).click();
      await expect(page).toHaveURL(/\/team$/);
      await expect(
        page.getByRole('heading', { name: 'Team Management' }),
      ).toBeVisible();

      const bench = page.getByRole('region', { name: 'Substitute players' });

      // All three start on the bench with their real status badges (the
      // badge text is the roster's display label inside the card).
      const domiCard = bench.getByRole('button', { name: /Domi Available —/ });
      const inesCard = bench.getByRole('button', { name: /Ines Injured —/ });
      const suriCard = bench.getByRole('button', { name: /Suri Suspended —/ });
      await expect(domiCard).toBeVisible();
      await expect(inesCard).toBeVisible();
      await expect(suriCard).toBeVisible();
      await expect(inesCard.getByText('Injured', { exact: true })).toBeVisible();
      await expect(suriCard.getByText('Suspended', { exact: true })).toBeVisible();

      // Status bar chips surface the unavailable counts.
      await expect(page.getByText('Injured: 1')).toBeVisible();
      await expect(page.getByText('Suspended: 1')).toBeVisible();
    });

    await test.step('auto-fill keeps unavailable players off the pitch', async () => {
      await page.getByRole('button', { name: /auto-fill/i }).click();

      const pitch = page.getByRole('group', { name: 'Pitch positions' });
      await expect(
        pitch.getByRole('button', { name: /Ines.*Injured/ }),
      ).toHaveCount(0);
      await expect(
        pitch.getByRole('button', { name: /Suri.*Suspended/ }),
      ).toHaveCount(0);
      // The available player is placed somewhere on the pitch (GK).
      await expect(
        pitch.getByRole('button', { name: /Domi Available/ }),
      ).toBeVisible();

      // Unavailable players stay badged on the bench.
      const bench = page.getByRole('region', { name: 'Substitute players' });
      const inesCard = bench.getByRole('button', { name: /Ines Injured —/ });
      await expect(inesCard).toBeVisible();
      await expect(inesCard.getByText('Injured', { exact: true })).toBeVisible();
      await expect(
        bench.getByRole('button', { name: /Suri Suspended —/ }),
      ).toBeVisible();
    });

    await test.step('roster status edit is reflected in team management', async () => {
      // Change Ines Injured → Available in the Roster.
      await page.getByRole('link', { name: 'Roster' }).click();
      await page
        .getByRole('button', { name: `Edit Ines Injured` })
        .click();
      const dialog = page.getByRole('dialog', { name: 'Edit Athlete' });
      await dialog.getByLabel('Status').selectOption('available');
      await dialog.getByRole('button', { name: 'Save Changes' }).click();
      await expect(dialog).toBeHidden();

      // Navigate to Team Management — the same shared athletes cache was
      // invalidated, so the bench badge updates without a hard reload.
      await page.getByRole('link', { name: 'Team' }).click();
      const bench = page.getByRole('region', { name: 'Substitute players' });
      const inesCard = bench.getByRole('button', { name: /Ines Injured —/ });
      await expect(inesCard).toBeVisible();
      await expect(inesCard.getByText('Available', { exact: true })).toBeVisible();
      await expect(inesCard.getByText('Injured', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Injured: 1')).toHaveCount(0);
    });

    await test.step('a full reload still shows the persisted statuses', async () => {
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Team Management' }),
      ).toBeVisible();
      const bench = page.getByRole('region', { name: 'Substitute players' });
      const inesCard = bench.getByRole('button', { name: /Ines Injured —/ });
      await expect(inesCard).toBeVisible();
      await expect(inesCard.getByText('Available', { exact: true })).toBeVisible();
      await expect(
        bench.getByRole('button', { name: /Suri Suspended —/ }),
      ).toBeVisible();
      await expect(page.getByText('Suspended: 1')).toBeVisible();
    });
  } finally {
    await cleanupUser({ email, teamName });
  }
});

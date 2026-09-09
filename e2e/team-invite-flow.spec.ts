import { expect, test, type Page } from '@playwright/test';
import { cleanupUser, uniqueTestIdentity } from '../backend/test/utils/test-db';
import {
  E2E_PASSWORD,
  emailVerificationUrl,
  FRONTEND_URL,
  pendingTeamInviteToken,
  registerVerifiedUser,
  seedCoachWithInvite,
} from './utils/auth';

/**
 * Assistant team-invite flow, end to end through the real browser:
 *
 * 1. Happy path across two "devices" — the assistant signs up from the
 *    invite in one browser, and clicks the verification link in a second
 *    browser with no shared localStorage. Only the callback URL the backend
 *    embeds in the emailed link (via the sign-up's `inviteToken`) carries
 *    the invitation across, which is exactly what it's designed to do.
 * 2. A transient accept failure — the accept POST is aborted at the network
 *    level after verification, and the resumer must surface a retry banner
 *    while keeping the invitation (and its token) fully recoverable.
 * 3. A mismatched-email 403 — a signed-in user whose email doesn't match the
 *    invited address gets sign-out guidance instead of losing the invite,
 *    and can recover by signing in with the invited account right on the
 *    same invite URL.
 */
test.describe('team invite flow', () => {
  test.setTimeout(120_000);

  /** Signs an assistant-to-be up from the invite page, parking on /verify-email. */
  async function signUpFromInvite(
    page: Page,
    inviteToken: string,
    name: string,
    email: string,
  ): Promise<void> {
    await page.goto(`/join-team/${inviteToken}`);
    await page.getByLabel('Full name').fill(name);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Create Account & Join' }).click();

    await expect(page).toHaveURL(/\/verify-email$/);
  }

  test('invited assistant signs up from the invite, verifies in a second browser, and joins the team', async ({
    page,
    browser,
    request,
  }) => {
    const coach = uniqueTestIdentity('invite-e2e');
    const assistant = uniqueTestIdentity('invite-e2e');
    const assistantName = 'Assistant Annie';

    try {
      const invite = await seedCoachWithInvite(request, coach, assistant.email);

      await test.step('assistant opens the invite and creates an account', async () => {
        await signUpFromInvite(page, invite.token, assistantName, assistant.email);

        // No session exists until the address is verified — the invitation
        // is parked with the pending token instead.
        await expect(
          page.getByText(
            "After verifying, you'll return to your team invitation to finish joining.",
          ),
        ).toBeVisible();
        expect(await pendingTeamInviteToken(page)).toBe(invite.token);
      });

      await test.step('verification link opens in a second browser and returns to the invite signed in', async () => {
        // A brand-new context shares no localStorage with the first browser
        // — only the embedded callback URL carries the invitation over.
        const otherContext = await browser.newContext();
        const otherPage = await otherContext.newPage();
        try {
          await otherPage.goto(
            await emailVerificationUrl(
              assistant.email,
              `${FRONTEND_URL}/join-team/${invite.token}`,
            ),
          );

          await expect(otherPage).toHaveURL(
            new RegExp(`/join-team/${invite.token}$`),
          );
          await expect(
            otherPage.getByText(
              "You're signed in — confirm below to join as an assistant.",
            ),
          ).toBeVisible();

          await otherPage
            .getByRole('button', { name: `Join ${coach.teamName}` })
            .click();

          await expect(otherPage).toHaveURL(/\/dashboard$/);
          await expect(
            otherPage.getByText(
              `Welcome back, ${assistantName} · ${coach.teamName}`,
            ),
          ).toBeVisible();
        } finally {
          await otherContext.close();
        }
      });
    } finally {
      // Deleting the coach's team cascades team_members and team_invites.
      await cleanupUser(coach);
      await cleanupUser(assistant);
    }
  });

  test('a transient accept failure keeps the invitation recoverable with a retry banner', async ({
    page,
    request,
  }) => {
    const coach = uniqueTestIdentity('invite-e2e');
    const assistant = uniqueTestIdentity('invite-e2e');
    const assistantName = 'Assistant Annie';

    try {
      const invite = await seedCoachWithInvite(request, coach, assistant.email);
      const acceptRoute = `**/api/team-invites/${invite.token}/accept`;

      await test.step('assistant signs up from the invite', async () => {
        await signUpFromInvite(page, invite.token, assistantName, assistant.email);
      });

      await test.step('acceptance fails at the network level after verifying', async () => {
        // Simulate a connection drop for the accept call only.
        await page.route(acceptRoute, (route) => route.abort());

        // Verifying through the plain callback (e.g. an older email sent
        // before the invite) signs the assistant in away from the invite
        // page — the resumer then owns finishing the join.
        await page.goto(
          await emailVerificationUrl(
            assistant.email,
            `${FRONTEND_URL}/login?verified=1`,
          ),
        );
        await page.goto('/dashboard');

        const banner = page
          .getByRole('alert')
          .filter({ hasText: 'temporary problem' });
        await expect(banner).toBeVisible();
        await expect(
          banner.getByRole('button', { name: 'Try again' }),
        ).toBeVisible();
        await expect(
          banner.getByRole('link', { name: 'Open your invite' }),
        ).toBeVisible();

        // The invitation itself is untouched: the token survives, and the
        // dashboard keeps Add Team suppressed while it's pending.
        expect(await pendingTeamInviteToken(page)).toBe(invite.token);
        await expect(
          page.getByRole('button', { name: 'Add Team' }),
        ).toBeHidden();
        await expect(
          page.getByRole('region', { name: 'Pending team invitation' }),
        ).toBeVisible();
      });

      await test.step('retrying from the banner completes the join', async () => {
        await page.unroute(acceptRoute);
        await page
          .getByRole('alert')
          .filter({ hasText: 'temporary problem' })
          .getByRole('button', { name: 'Try again' })
          .click();

        await expect(
          page.getByRole('alert').filter({ hasText: 'temporary problem' }),
        ).toBeHidden();
        await expect(
          page.getByText(
            `Welcome back, ${assistantName} · ${coach.teamName}`,
          ),
        ).toBeVisible();
        expect(await pendingTeamInviteToken(page)).toBeNull();
      });
    } finally {
      await cleanupUser(coach);
      await cleanupUser(assistant);
    }
  });

  test('an invite issued to a different email is rejected with recoverable sign-out guidance', async ({
    page,
    request,
  }) => {
    const coach = uniqueTestIdentity('invite-e2e');
    const invited = uniqueTestIdentity('invite-e2e');
    const wrongAccount = uniqueTestIdentity('invite-e2e');
    const invitedName = 'Invited Ivy';

    try {
      const invite = await seedCoachWithInvite(request, coach, invited.email);
      // The invited address already has a verified, team-less account, and a
      // second verified account is already signed into the browser.
      await registerVerifiedUser(request, invited.email, invitedName);
      await registerVerifiedUser(request, wrongAccount.email, 'Wrong Walter');

      await page.goto('/login');
      await page.getByLabel('Email address').fill(wrongAccount.email);
      await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
      await page.getByRole('button', { name: /sign in to dugout/i }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      await test.step('opening the invite signed in as the wrong account is rejected, not consumed', async () => {
        await page.goto(`/join-team/${invite.token}`);
        await expect(
          page.getByText(
            "You're signed in — confirm below to join as an assistant.",
          ),
        ).toBeVisible();

        await page
          .getByRole('button', { name: `Join ${coach.teamName}` })
          .click();

        const mismatch = page
          .getByRole('alert')
          .filter({ hasText: 'different email address' });
        await expect(mismatch).toBeVisible();
        await expect(
          mismatch.getByText(`You're signed in as ${wrongAccount.email}`),
        ).toBeVisible();

        // The backend keeps enforcing the 403; the frontend keeps the
        // invitation recoverable instead of dropping it.
        expect(await pendingTeamInviteToken(page)).toBe(invite.token);
      });

      await test.step('signing out from the guidance and back in as the invited email completes the join', async () => {
        await page
          .getByRole('button', { name: 'Sign out and use the invited email' })
          .click();

        // Same invite URL, now showing the auth forms with the mismatch
        // guidance above them.
        await expect(page).toHaveURL(
          new RegExp(`/join-team/${invite.token}$`),
        );
        await expect(
          page.getByText(
            /with the email address your coach invited to join/i,
          ),
        ).toBeVisible();

        await page.getByLabel('Email address').fill(invited.email);
        await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
        await page.getByRole('button', { name: 'Sign In & Join' }).click();

        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(
          page.getByText(`Welcome back, ${invitedName} · ${coach.teamName}`),
        ).toBeVisible();
        expect(await pendingTeamInviteToken(page)).toBeNull();
      });
    } finally {
      await cleanupUser(coach);
      await cleanupUser(invited);
      await cleanupUser(wrongAccount);
    }
  });
});

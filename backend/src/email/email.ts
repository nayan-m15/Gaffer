import { Logger } from '@nestjs/common';
import { BrevoClient } from '@getbrevo/brevo';

const logger = new Logger('Email');

/**
 * Lazily-created Brevo client, mirroring how `database/drizzle.ts` builds its
 * client from an env var rather than through Nest DI — `auth.ts` is a plain
 * module-level singleton, not a Nest provider, so it can't receive an
 * injected service.
 */
let client: BrevoClient | null | undefined;

function getClient(): BrevoClient | null {
  if (client === undefined) {
    const apiKey = process.env.BREVO_API_KEY;
    client = apiKey ? new BrevoClient({ apiKey }) : null;
  }
  return client;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface SendVerificationEmailInput {
  to: string;
  name: string;
  url: string;
}

/**
 * Sends the "verify your email" message via Brevo's transactional email API.
 *
 * When `BREVO_API_KEY` isn't set (local dev/test), this logs the link
 * instead of sending, so nobody needs real Brevo credentials to run the app.
 */
export async function sendVerificationEmail({
  to,
  name,
  url,
}: SendVerificationEmailInput): Promise<void> {
  const brevo = getClient();

  if (!brevo) {
    logger.warn(
      `BREVO_API_KEY not set — logging the verification link instead of emailing it.\nTo: ${to}\nLink: ${url}`,
    );
    return;
  }

  const fromEmail = process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@example.com';
  const fromName = process.env.EMAIL_FROM_NAME ?? 'SportCoachingTool';

  await brevo.transactionalEmails.sendTransacEmail({
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to, name }],
    subject: 'Verify your email address',
    htmlContent: `
      <p>Hi ${escapeHtml(name || 'Coach')},</p>
      <p>Confirm your email address to finish setting up your Gaffer account.</p>
      <p><a href="${url}">Verify email address</a></p>
      <p>If you didn't create this account, you can safely ignore this email.</p>
    `,
  });
}

export interface SendPlayerClaimInviteEmailInput {
  to: string;
  playerName: string;
  url: string;
}

/**
 * Sends a player-profile claim invitation via Brevo.
 *
 * When `BREVO_API_KEY` isn't set (local dev/test), the claim link is logged
 * instead, matching the verification-email development behaviour above.
 */
export async function sendPlayerClaimInviteEmail({
  to,
  playerName,
  url,
}: SendPlayerClaimInviteEmailInput): Promise<void> {
  const brevo = getClient();

  if (!brevo) {
    logger.warn(
      `BREVO_API_KEY not set — logging the player invite link instead of emailing it.\nTo: ${to}\nLink: ${url}`,
    );
    return;
  }

  const fromEmail = process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@example.com';
  const fromName = process.env.EMAIL_FROM_NAME ?? 'SportCoachingTool';
  const safePlayerName = escapeHtml(playerName || 'Player');
  const safeUrl = escapeHtml(url);

  await brevo.transactionalEmails.sendTransacEmail({
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to, name: playerName }],
    subject: 'You have been invited to claim your player profile',
    htmlContent: `
      <p>Hi ${safePlayerName},</p>
      <p>Your coach has invited you to claim your player profile in Gaffer.</p>
      <p><a href="${safeUrl}">Claim player profile</a></p>
      <p>This invite expires in 72 hours and can only be used once.</p>
      <p>If you were not expecting this invitation, you can safely ignore this email.</p>
    `,
  });
}

export interface SendAssistantInviteEmailInput {
  to: string;
  url: string;
}

/**
 * Sends an assistant team invitation via Brevo.
 *
 * When `BREVO_API_KEY` isn't set (local dev/test), the invite link is logged
 * instead, matching the other transactional-email development behaviour.
 */
export async function sendAssistantInviteEmail({
  to,
  url,
}: SendAssistantInviteEmailInput): Promise<void> {
  const brevo = getClient();

  if (!brevo) {
    logger.warn(
      `BREVO_API_KEY not set — logging the assistant invite link instead of emailing it.\nTo: ${to}\nLink: ${url}`,
    );
    return;
  }

  const fromEmail = process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@example.com';
  const fromName = process.env.EMAIL_FROM_NAME ?? 'SportCoachingTool';
  const safeUrl = escapeHtml(url);

  await brevo.transactionalEmails.sendTransacEmail({
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to }],
    subject: 'You have been invited to join a team as an assistant',
    htmlContent: `
      <p>Hi,</p>
      <p>You have been invited to join a team in Gaffer as an assistant.</p>
      <p><a href="${safeUrl}">Join the team</a></p>
      <p>This invite expires in 72 hours, can only be used once, and must be accepted using this email address.</p>
      <p>If you were not expecting this invitation, you can safely ignore this email.</p>
    `,
  });
}

/** Test-only hook to reset the memoized client between specs. */
export function __resetEmailClientForTests(): void {
  client = undefined;
}

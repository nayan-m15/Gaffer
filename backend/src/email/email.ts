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

/**
 * What every sender does when Brevo is not configured (SEC-007).
 *
 * `development` keeps the intentional fallback of logging the delivery link
 * to the backend console so verification/invite flows can be completed
 * without real credentials. `test` runs the same non-fatal fallback but
 * suppresses the link itself — test helpers verify accounts directly and
 * bearer-style tokens must not be normalised test output. Every other
 * environment — `production` included — fails closed, mirroring the
 * HARD-002 swagger gate: the request errors instead of reporting success,
 * and the link never reaches the logs.
 *
 * @param devMessage The development fallback log line, including the link.
 * @param url The bearer/reusable URL embedded in `devMessage`, if any —
 * present only so `test` output can suppress it; never logged outside
 * `development`.
 */
function handleUnconfiguredDelivery(devMessage: string, url?: string): void {
  const env = process.env.NODE_ENV;
  if (env === 'development') {
    logger.warn(devMessage);
    return;
  }
  if (env === 'test') {
    // Token-less fallbacks (admin notifications) are safe to log as-is.
    logger.warn(
      url
        ? 'BREVO_API_KEY not set — email not sent; the delivery link is suppressed in test output.'
        : devMessage,
    );
    return;
  }
  throw new Error(
    `Email delivery is not configured (BREVO_API_KEY not set) and NODE_ENV=${env ?? 'unset'} does not permit the development fallback.`,
  );
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
 * When `BREVO_API_KEY` isn't set, delivery falls back per environment (see
 * `handleUnconfiguredDelivery`): the link is logged in development, while
 * production fails closed instead of logging the bearer verification URL.
 */
export async function sendVerificationEmail({
  to,
  name,
  url,
}: SendVerificationEmailInput): Promise<void> {
  const brevo = getClient();

  if (!brevo) {
    handleUnconfiguredDelivery(
      `BREVO_API_KEY not set — logging the verification link instead of emailing it.\nTo: ${to}\nLink: ${url}`,
      url,
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
      <p>Confirm this email address for your Gaffer account.</p>
      <p><a href="${url}">Verify email address</a></p>
      <p>If you weren't expecting this message, you can safely ignore it.</p>
    `,
  });
}

export interface SendEmailChangeConfirmationInput {
  to: string;
  name: string;
  newEmail: string;
  url: string;
}

/**
 * Confirms an email-address change with the account's current address before
 * Better Auth sends its normal verification message to the new address.
 */
export async function sendEmailChangeConfirmationEmail({
  to,
  name,
  newEmail,
  url,
}: SendEmailChangeConfirmationInput): Promise<void> {
  const brevo = getClient();

  if (!brevo) {
    logger.warn(
      `BREVO_API_KEY not set — logging the email-change confirmation link instead of emailing it.\nTo: ${to}\nNew email: ${newEmail}\nLink: ${url}`,
    );
    return;
  }

  const fromEmail = process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@example.com';
  const fromName = process.env.EMAIL_FROM_NAME ?? 'SportCoachingTool';
  const safeName = escapeHtml(name || 'User');
  const safeNewEmail = escapeHtml(newEmail);
  const safeUrl = escapeHtml(url);

  await brevo.transactionalEmails.sendTransacEmail({
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to, name }],
    subject: 'Confirm your Gaffer email change',
    htmlContent: `
      <p>Hi ${safeName},</p>
      <p>We received a request to change the email address on your Gaffer account to <strong>${safeNewEmail}</strong>.</p>
      <p><a href="${safeUrl}">Approve email change</a></p>
      <p>After you approve this request, we will send a verification link to the new email address.</p>
      <p>If you did not request this change, you can safely ignore this email and your current email will remain unchanged.</p>
    `,
  });
}

export interface SendPasswordResetEmailInput {
  to: string;
  name: string;
  url: string;
}

/**
 * Sends the password-reset link through the same Brevo transactional channel
 * as account verification. In local development the link is logged instead,
 * which keeps the reset flow testable without Brevo credentials.
 */
export async function sendPasswordResetEmail({
  to,
  name,
  url,
}: SendPasswordResetEmailInput): Promise<void> {
  const brevo = getClient();

  if (!brevo) {
    logger.warn(
      `BREVO_API_KEY not set — logging the password reset link instead of emailing it.\nTo: ${to}\nLink: ${url}`,
    );
    return;
  }

  const fromEmail = process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@example.com';
  const fromName = process.env.EMAIL_FROM_NAME ?? 'SportCoachingTool';
  const safeName = escapeHtml(name || 'Coach');
  const safeUrl = escapeHtml(url);

  await brevo.transactionalEmails.sendTransacEmail({
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to, name }],
    subject: 'Reset your Gaffer password',
    htmlContent: `
      <p>Hi ${safeName},</p>
      <p>We received a request to reset the password for your Gaffer account.</p>
      <p><a href="${safeUrl}">Reset password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
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
 * When `BREVO_API_KEY` isn't set, delivery falls back per environment (see
 * `handleUnconfiguredDelivery`), matching the verification-email behaviour.
 */
export async function sendPlayerClaimInviteEmail({
  to,
  playerName,
  url,
}: SendPlayerClaimInviteEmailInput): Promise<void> {
  const brevo = getClient();

  if (!brevo) {
    handleUnconfiguredDelivery(
      `BREVO_API_KEY not set — logging the player invite link instead of emailing it.\nTo: ${to}\nLink: ${url}`,
      url,
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
 * When `BREVO_API_KEY` isn't set, delivery falls back per environment (see
 * `handleUnconfiguredDelivery`), matching the other transactional emails.
 */
export async function sendAssistantInviteEmail({
  to,
  url,
}: SendAssistantInviteEmailInput): Promise<void> {
  const brevo = getClient();

  if (!brevo) {
    handleUnconfiguredDelivery(
      `BREVO_API_KEY not set — logging the assistant invite link instead of emailing it.\nTo: ${to}\nLink: ${url}`,
      url,
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

export interface SendCompetitionInviteEmailInput {
  to: string;
  competitionName: string;
  teamName: string;
  url: string;
}

export async function sendCompetitionInviteEmail({
  to,
  competitionName,
  teamName,
  url,
}: SendCompetitionInviteEmailInput): Promise<void> {
  const brevo = getClient();
  if (!brevo) {
    handleUnconfiguredDelivery(
      `BREVO_API_KEY not set — logging the competition invite link instead of emailing it.\nTo: ${to}\nCompetition: ${competitionName}\nTeam: ${teamName}\nLink: ${url}`,
      url,
    );
    return;
  }
  await brevo.transactionalEmails.sendTransacEmail({
    sender: {
      name: process.env.EMAIL_FROM_NAME ?? 'SportCoachingTool',
      email: process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@example.com',
    },
    to: [{ email: to }],
    subject: 'You have been invited to represent a competition team',
    htmlContent: `
      <p>Hi,</p>
      <p>You have been invited to represent ${escapeHtml(teamName)} in ${escapeHtml(competitionName)} on Gaffer.</p>
      <p><a href="${escapeHtml(url)}">Join the competition</a></p>
      <p>This invite expires in 72 hours, can only be used once, and must be accepted using this email address.</p>
      <p>If you were not expecting this invitation, you can safely ignore this email.</p>
    `,
  });
}

/** Test-only hook to reset the memoized client between specs. */
export function __resetEmailClientForTests(): void {
  client = undefined;
}

/** Name discrepancies are reviewed by the competition administrator. */
export async function sendCompetitionTeamReviewEmail(input: {
  to: string;
  competitionName: string;
  invitedName: string;
  proposedName: string;
  url: string;
}): Promise<void> {
  const brevo = getClient();
  if (!brevo) {
    handleUnconfiguredDelivery(
      `Competition team review requested: ${input.to} / ${input.competitionName} / ${input.invitedName} -> ${input.proposedName} / ${input.url}`,
      input.url,
    );
    return;
  }
  await brevo.transactionalEmails.sendTransacEmail({
    sender: {
      name: process.env.EMAIL_FROM_NAME ?? 'SportCoachingTool',
      email: process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@example.com',
    },
    to: [{ email: input.to }],
    subject: 'Team verification required for your competition',
    htmlContent: `<p>A team representative has requested to represent ${escapeHtml(input.proposedName)} in ${escapeHtml(input.competitionName)}.</p>
      <p>You originally entered ${escapeHtml(input.invitedName)}. Confirm whether these are the same team.</p>
      <p><a href="${escapeHtml(input.url)}">Review the request in Gaffer</a></p>`,
  });
}

export async function sendCompetitionTeamReviewOutcomeEmail(input: {
  to: string;
  competitionName: string;
  teamName: string;
  approved: boolean;
  url: string;
}): Promise<void> {
  const brevo = getClient();
  if (!brevo) {
    // Outcome notices carry no bearer token, but production still fails
    // closed — reporting success for an email that never went out is the
    // bug SEC-007 fixes, with or without a link in the message.
    handleUnconfiguredDelivery(
      `Competition team verification ${input.approved ? 'approved' : 'rejected'}: ${input.to} / ${input.competitionName}`,
    );
    return;
  }
  await brevo.transactionalEmails.sendTransacEmail({
    sender: {
      name: process.env.EMAIL_FROM_NAME ?? 'SportCoachingTool',
      email: process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@example.com',
    },
    to: [{ email: input.to }],
    subject: input.approved
      ? 'Your competition team has been approved'
      : 'Your competition team verification was declined',
    htmlContent: `<p>Your verification request for ${escapeHtml(input.teamName)} in ${escapeHtml(input.competitionName)}
      has been ${input.approved ? 'approved' : 'declined'} by the competition administrator.</p>
      <p><a href="${escapeHtml(input.url)}">Open Gaffer</a></p>`,
  });
}

/** A player cannot link their team; ask the competition administrator to reissue
 * the invitation to a coach or authorized assistant without exposing the
 * administrator's address on a public or player-visible response. */
export async function sendCompetitionRepresentativeCorrectionEmail(input: {
  to: string;
  competitionName: string;
  teamName: string;
  recipientEmail: string;
  url: string;
}): Promise<void> {
  const brevo = getClient();
  if (!brevo) {
    handleUnconfiguredDelivery(
      `Representative re-invitation requested: ${input.to} / ${input.competitionName} / ${input.teamName} / ${input.recipientEmail}`,
    );
    return;
  }
  await brevo.transactionalEmails.sendTransacEmail({
    sender: {
      name: process.env.EMAIL_FROM_NAME ?? 'SportCoachingTool',
      email: process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@example.com',
    },
    to: [{ email: input.to }],
    subject: 'Action needed: re-invite an authorized team representative',
    htmlContent: `<p>The recipient ${escapeHtml(input.recipientEmail)} is a player and cannot connect
      the team ${escapeHtml(input.teamName)} to ${escapeHtml(input.competitionName)}.</p>
      <p>The original invitation was withdrawn. Please send a new invitation to a coach or authorized assistant.</p>
      <p><a href="${escapeHtml(input.url)}">Open your competition in Gaffer</a></p>`,
  });
}

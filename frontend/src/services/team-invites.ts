import { apiFetch, ApiError } from "@/lib/api";

/** Response from `POST /team-invites` — the one-time invite details. */
export interface TeamInviteResult {
  token: string;
  inviteUrl: string;
  email: string;
  expiresAt: string;
}

/** Response from `GET /team-invites` — the coach's pending invites. */
export interface TeamInviteSummary {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

/** Response from `GET /team-invites/assistants` — accepted assistants. */
export interface TeamAssistantSummary {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
}

/** Response from `GET /team-invites/:token` — the public preview. */
export interface TeamInvitePreview {
  valid: boolean;
  teamName?: string;
}

/** Response from `POST /team-invites/:token/accept`. */
export interface TeamInviteAcceptResult {
  joined: boolean;
  teamId: string;
}

/** POST /team-invites — coach-only; creates a one-time assistant invite. */
export async function createTeamInvite(
  email: string,
): Promise<TeamInviteResult> {
  return apiFetch<TeamInviteResult>("/team-invites", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** GET /team-invites — coach-only; lists the team's pending invites. */
export async function getTeamInvites(): Promise<TeamInviteSummary[]> {
  return apiFetch<TeamInviteSummary[]>("/team-invites");
}

/** GET /team-invites/assistants — coach-only; lists accepted assistants. */
export async function getTeamAssistants(): Promise<TeamAssistantSummary[]> {
  return apiFetch<TeamAssistantSummary[]>("/team-invites/assistants");
}

/** DELETE /team-invites/:id — coach-only; revokes a pending invite. */
export async function revokeTeamInvite(
  id: string,
): Promise<{ revoked: boolean }> {
  return apiFetch<{ revoked: boolean }>(`/team-invites/${id}`, {
    method: "DELETE",
  });
}

/** GET /team-invites/:token — public preview, no auth required. */
export async function previewTeamInvite(
  token: string,
): Promise<TeamInvitePreview> {
  return apiFetch<TeamInvitePreview>(
    `/team-invites/${encodeURIComponent(token)}`,
  );
}

/** POST /team-invites/:token/accept — auth required; joins the team as an assistant. */
export async function acceptTeamInvite(
  token: string,
): Promise<TeamInviteAcceptResult> {
  return apiFetch<TeamInviteAcceptResult>(
    `/team-invites/${encodeURIComponent(token)}/accept`,
    {
      method: "POST",
    },
  );
}

/* ── Pending-invite token persistence (mirrors services/claims.ts) ──────── */

/**
 * How a failed invite acceptance should be treated — decides whether the
 * pending token survives the failure.
 *
 * - "definitive": the invitation itself is unusable (expired, used, revoked,
 *   malformed) or the account already belongs to a team. Safe to drop.
 * - "email-mismatch": the invite was issued to a different email address
 *   than the signed-in account. The invitation is still perfectly good —
 *   keep the token and guide the user to sign out and sign in with the
 *   invited email instead of losing the invitation.
 * - "transient": network/server hiccup (backend down, timeout, 5xx). Keep
 *   the token and offer a retry.
 */
export type InviteAcceptFailureKind =
  | "definitive"
  | "email-mismatch"
  | "transient";

/**
 * Classifies an error thrown by `acceptTeamInvite`. The backend is the
 * authority: 400/404/409 mean the invitation (or the account's eligibility)
 * is permanently gone, 403 on accept is always the email-mismatch guard in
 * `TeamInvitesService.accept`, and anything else — plus non-ApiError
 * failures, which is how `fetch` reports an unreachable backend — is worth
 * retrying later.
 */
export function classifyInviteAcceptError(
  error: unknown,
): InviteAcceptFailureKind {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
      case 404:
      case 409:
        return "definitive";
      case 403:
        return "email-mismatch";
      default:
        return "transient";
    }
  }

  return "transient";
}

/**
 * Persists a team-invite token across the email-verification round trip.
 *
 * Email/password sign-up doesn't issue a session until the address is
 * verified, so JoinTeamPage can't call acceptTeamInvite right after sign-up
 * in that case — there's no auth yet. We stash the token here instead, and
 * TeamInviteResumer finishes the job once a session actually exists, however
 * the user gets there (verify link, manual sign-in, etc).
 */
const PENDING_TEAM_INVITE_TOKEN_KEY = "gaffer:pendingTeamInviteToken";

export function storePendingTeamInviteToken(token: string): void {
  localStorage.setItem(PENDING_TEAM_INVITE_TOKEN_KEY, token);
}

export function getPendingTeamInviteToken(): string | null {
  return localStorage.getItem(PENDING_TEAM_INVITE_TOKEN_KEY);
}

export function clearPendingTeamInviteToken(): void {
  localStorage.removeItem(PENDING_TEAM_INVITE_TOKEN_KEY);
}

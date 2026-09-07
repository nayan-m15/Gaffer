import { apiFetch } from "@/lib/api";

/** Response from `GET /claims/:token` — the athlete/team preview. */
export interface ClaimPreview {
  valid: boolean;
  athlete?: {
    firstName: string;
    lastName: string;
    teamName: string;
  };
}

/** Response from `POST /claims/:token/accept` — the claimed athlete record. */
export interface ClaimAcceptResult {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  squadNumber: number | null;
}

/** GET /claims/:token — public preview, no auth required. */
export async function previewClaim(token: string): Promise<ClaimPreview> {
  return apiFetch<ClaimPreview>(`/claims/${encodeURIComponent(token)}`);
}

/** POST /claims/:token/accept — auth required, claims the athlete profile. */
export async function acceptClaim(token: string): Promise<ClaimAcceptResult> {
  return apiFetch<ClaimAcceptResult>(`/claims/${encodeURIComponent(token)}/accept`, {
    method: "POST",
  });
}


/**
 * Persists a claim token across the email-verification round trip.
 *
 * Email/password sign-up doesn't issue a session until the address is
 * verified, so ClaimPage can't call acceptClaim right after sign-up in
 * that case — there's no auth yet. We stash the token here instead, and
 * ClaimResumer finishes the job once a session actually exists, however
 * the user gets there (verify link, manual sign-in, etc).
 */
const PENDING_CLAIM_TOKEN_KEY = "gaffer:pendingClaimToken";

export function storePendingClaimToken(token: string): void {
  localStorage.setItem(PENDING_CLAIM_TOKEN_KEY, token);
}

export function getPendingClaimToken(): string | null {
  return localStorage.getItem(PENDING_CLAIM_TOKEN_KEY);
}

export function clearPendingClaimToken(): void {
  localStorage.removeItem(PENDING_CLAIM_TOKEN_KEY);
}
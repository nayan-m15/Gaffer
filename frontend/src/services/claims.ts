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

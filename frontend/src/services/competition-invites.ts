import { apiFetch, ApiError } from "@/lib/api";

export interface CompetitionInvitePreview {
  valid: boolean;
  competitionName?: string;
  teamName?: string;
}

export const previewCompetitionInvite = (token: string) =>
  apiFetch<CompetitionInvitePreview>(`/competition-invites/${encodeURIComponent(token)}`);

export const acceptCompetitionInvite = (token: string) =>
  apiFetch<{ joined: boolean; teamId: string; competitionId: string }>(
    `/competition-invites/${encodeURIComponent(token)}/accept`, { method: "POST" },
  );

// A 403 can also mean an assistant is ineligible; a 409 can mean the
// current team already participates. Neither invalidates the invitation.
export function classifyCompetitionInviteAcceptError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404) return "definitive";
    if (error.status === 403 && error.message === "This invite was issued to a different email address.") return "email-mismatch";
  }
  return "recoverable";
}

const KEY = "gaffer:pendingCompetitionInviteToken";
export const storePendingCompetitionInviteToken = (token: string) => localStorage.setItem(KEY, token);
export const getPendingCompetitionInviteToken = () => localStorage.getItem(KEY);
export function clearPendingCompetitionInviteToken(token: string) {
  if (getPendingCompetitionInviteToken() === token) localStorage.removeItem(KEY);
}

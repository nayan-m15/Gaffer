import { apiFetch, ApiError } from "@/lib/api";

export interface CompetitionInvitePreview {
  valid: boolean;
  competitionName?: string;
  teamName?: string;
  awaitingApproval?: boolean;
}

export const previewCompetitionInvite = (token: string) =>
  apiFetch<CompetitionInvitePreview>(`/competition-invites/${encodeURIComponent(token)}`);

export interface EligibleCompetitionTeams {
  teams: Array<{ id: string; name: string; role: "coach" | "assistant" }>;
  playerTeams: Array<{ teamId: string; teamName: string }>;
  canCreateTeam: boolean;
  awaitingApproval: boolean;
}

export const eligibleCompetitionTeams = (token: string) =>
  apiFetch<EligibleCompetitionTeams>(`/competition-invites/${encodeURIComponent(token)}/eligible-teams`);

export const requestCompetitionRepresentativeInvite = (token: string) =>
  apiFetch<{ requested: boolean; emailSent: boolean }>(
    `/competition-invites/${encodeURIComponent(token)}/request-representative`, { method: "POST" });

export const declineCompetitionInvite = (token: string) =>
  apiFetch<{ declined: boolean }>(`/competition-invites/${encodeURIComponent(token)}/decline`, { method: "POST" });

export const acceptCompetitionInvite = (token: string, teamName?: string) =>
  apiFetch<{ joined?: boolean; awaitingApproval?: boolean; teamId?: string; competitionId?: string }>(
    `/competition-invites/${encodeURIComponent(token)}/accept`,
    { method: "POST", body: JSON.stringify({ confirmed: true, ...(teamName ? { teamName } : {}) }) },
  );

// A 403 can also mean a player is ineligible; a 409 can mean the
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

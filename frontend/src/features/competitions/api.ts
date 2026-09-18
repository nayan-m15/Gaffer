import { apiFetch } from "@/lib/api";
import type { Competition, CompetitionDetail, CompetitionInput, CompetitionInvite, CompetitionSummary, Participant } from "./types";

const sharedOnly = (rows: CompetitionSummary[]) =>
  rows.filter((row) => row.type === "league" || row.type === "cup");

export const fetchCompetition = (id: string) =>
  apiFetch<CompetitionDetail>(`/competitions/${encodeURIComponent(id)}`);

export async function fetchMyCompetitions() {
  return sharedOnly(
    await apiFetch<CompetitionSummary[]>("/competitions/mine"),
  );
}

export async function searchCompetitions(term: string) {
  return sharedOnly(await apiFetch<CompetitionSummary[]>(`/competitions/search?q=${encodeURIComponent(term)}`));
}

export const createCompetition = (input: CompetitionInput) =>
  apiFetch<CompetitionDetail>("/competitions", { method: "POST", body: JSON.stringify(input) });

export const updateCompetition = (id: string, input: CompetitionInput) =>
  apiFetch<Competition>(`/competitions/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const deleteCompetition = (id: string) =>
  apiFetch<{ success: boolean }>(`/competitions/${id}`, { method: "DELETE" });

export const addParticipant = (id: string, displayName: string) =>
  apiFetch<Participant>(`/competitions/${id}/teams`, { method: "POST", body: JSON.stringify({ displayName }) });

export const removeParticipant = (id: string, participantId: string) =>
  apiFetch<{ success: boolean }>(`/competitions/${id}/teams/${participantId}`, { method: "DELETE" });

export const fetchInvites = (id: string) =>
  apiFetch<CompetitionInvite[]>(`/competition-invites?competitionId=${encodeURIComponent(id)}`);

export const inviteCoach = (competitionTeamId: string, email: string) =>
  apiFetch<{ email: string; expiresAt: string }>("/competition-invites", {
    method: "POST", body: JSON.stringify({ competitionTeamId, email }),
  });

export const revokeInvite = (id: string) =>
  apiFetch<{ revoked: boolean }>(`/competition-invites/${id}`, { method: "DELETE" });

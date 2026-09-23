import { apiFetch } from "@/lib/api";
import type {
  Competition,
  CompetitionDetail,
  CompetitionFixture,
  CompetitionInput,
  CompetitionInvite,
  CompetitionResult,
  CompetitionResultInput,
  CompetitionSummary,
  Participant,
} from "./types";

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
  apiFetch<Competition>("/competitions", { method: "POST", body: JSON.stringify(input) });

export const updateCompetition = (id: string, input: Partial<CompetitionInput>) =>
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

export const createCompetitionResult = (id: string, input: CompetitionResultInput) =>
  apiFetch<CompetitionResult>(`/competitions/${id}/results`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateCompetitionResult = (id: string, resultId: string, input: CompetitionResultInput) =>
  apiFetch<CompetitionResult>(`/competitions/${id}/results/${resultId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const deleteCompetitionResult = (id: string, resultId: string) =>
  apiFetch<{ success: boolean }>(`/competitions/${id}/results/${resultId}`, {
    method: "DELETE",
  });

export const fetchCompetitionFixtures = (id: string) =>
  apiFetch<CompetitionFixture[]>(`/competitions/${encodeURIComponent(id)}/fixtures`);

export const generateCompetitionFixtures = (id: string, regenerate = false) =>
  apiFetch<CompetitionFixture[]>(`/competitions/${encodeURIComponent(id)}/fixtures/generate`, {
    method: "POST",
    body: JSON.stringify({ regenerate }),
  });
export const acceptCompetitionFixtureSchedule = (
  competitionId: string,
  fixtureId: string,
  expectedRevision: number,
  competitionTeamId?: string,
) =>
  apiFetch<CompetitionFixture>(
    `/competitions/${encodeURIComponent(competitionId)}/fixtures/${encodeURIComponent(fixtureId)}/schedule/accept`,
    {
      method: "POST",
      body: JSON.stringify({ expectedRevision, ...(competitionTeamId ? { competitionTeamId } : {}) }),
    },
  );

export const proposeCompetitionFixtureSchedule = (
  competitionId: string,
  fixtureId: string,
  input: { scheduledAt: string; note?: string; competitionTeamId?: string; expectedRevision: number },
) =>
  apiFetch<CompetitionFixture>(
    `/competitions/${encodeURIComponent(competitionId)}/fixtures/${encodeURIComponent(fixtureId)}/schedule/propose`,
    { method: "POST", body: JSON.stringify(input) },
  );


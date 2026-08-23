import { apiFetch } from "@/lib/api";
import type {
  AthleteStatistics,
  CompetitionFormValues,
  CompetitionWithStandings,
  CreateCompetitionInput,
  CreateStandingInput,
  StandingFormValues,
  TeamOverview,
  UpdateCompetitionInput,
  UpdateStandingInput,
} from "@/features/statistics/types";

/**
 * Raw backend response shapes for the statistics endpoints.
 *
 * These mirror the JSON returned by the NestJS statistics controller.
 * `toUi*` helpers convert them into the UI types used by components.
 */
export interface BackendTeamOverview extends TeamOverview {}
export interface BackendAthleteStatistics extends AthleteStatistics {}
export interface BackendCompetitionWithStandings
  extends CompetitionWithStandings {}

const STATISTICS_PATH = "/statistics";

/* ── Read calls ──────────────────────────────────────────────────────────── */

export async function getStatistics(
  competitionId?: string,
): Promise<BackendTeamOverview> {
  const query = competitionId ? `?competitionId=${competitionId}` : "";
  return apiFetch<BackendTeamOverview>(`${STATISTICS_PATH}${query}`);
}

export async function getAthleteStatistics(
  athleteId: string,
): Promise<BackendAthleteStatistics> {
  return apiFetch<BackendAthleteStatistics>(
    `${STATISTICS_PATH}/athletes/${athleteId}`,
  );
}

export async function getCompetitions(): Promise<
  BackendCompetitionWithStandings[]
> {
  return apiFetch<BackendCompetitionWithStandings[]>(
    `${STATISTICS_PATH}/competitions`,
  );
}

/* ── Competition CRUD ─────────────────────────────────────────────────────── */

export async function createCompetition(
  input: CreateCompetitionInput,
): Promise<BackendCompetitionWithStandings> {
  return apiFetch<BackendCompetitionWithStandings>(
    `${STATISTICS_PATH}/competitions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function updateCompetition(
  id: string,
  input: UpdateCompetitionInput,
): Promise<BackendCompetitionWithStandings> {
  return apiFetch<BackendCompetitionWithStandings>(
    `${STATISTICS_PATH}/competitions/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function deleteCompetition(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `${STATISTICS_PATH}/competitions/${id}`,
    { method: "DELETE" },
  );
}

/* ── Standings CRUD ───────────────────────────────────────────────────────── */

export async function createStanding(
  competitionId: string,
  input: CreateStandingInput,
): Promise<BackendCompetitionWithStandings> {
  return apiFetch<BackendCompetitionWithStandings>(
    `${STATISTICS_PATH}/competitions/${competitionId}/standings`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function updateStanding(
  id: string,
  input: UpdateStandingInput,
): Promise<BackendCompetitionWithStandings> {
  return apiFetch<BackendCompetitionWithStandings>(
    `${STATISTICS_PATH}/standings/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function deleteStanding(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`${STATISTICS_PATH}/standings/${id}`, {
    method: "DELETE",
  });
}

/* ── Mapping helpers ────────────────────────────────────────────────────── */

/**
 * Converts a backend team overview into the UI shape.
 *
 * The backend already computes all derived fields, so this is currently an
 * identity mapping. Kept for consistency with `services/athletes.ts` and as
 * a future formatting hook.
 */
export function toUiOverview(backend: BackendTeamOverview): TeamOverview {
  return backend;
}

export function toUiAthleteStatistics(
  backend: BackendAthleteStatistics,
): AthleteStatistics {
  return backend;
}

export function toUiCompetitions(
  backend: BackendCompetitionWithStandings[],
): CompetitionWithStandings[] {
  return backend;
}

/** Converts a competition record into the form values for the add/edit dialog. */
export function toCompetitionFormValues(
  backend: BackendCompetitionWithStandings,
): CompetitionFormValues {
  return {
    name: backend.name,
    type: backend.type,
    season: backend.season ?? "",
  };
}

/** Converts a standing row into the form values for the add/edit dialog. */
export function toStandingFormValues(
  backend: BackendCompetitionWithStandings,
  standingId?: string,
): StandingFormValues {
  if (!standingId) {
    return {
      teamName: "",
      position: 1,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      isOwnTeam: false,
    };
  }

  const standing = backend.standings.find((s) => s.id === standingId);
  if (!standing) {
    return {
      teamName: "",
      position: 1,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      isOwnTeam: false,
    };
  }

  return {
    teamName: standing.teamName,
    position: standing.position,
    played: standing.played,
    won: standing.won,
    drawn: standing.drawn,
    lost: standing.lost,
    goalsFor: standing.goalsFor,
    goalsAgainst: standing.goalsAgainst,
    points: standing.points,
    isOwnTeam: standing.isOwnTeam,
  };
}

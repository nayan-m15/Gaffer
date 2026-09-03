import { apiFetch } from "@/lib/api";

/**
 * Raw lineup record returned by the backend.
 *
 * A team may save multiple named lineups; names are unique per team.
 */
export interface BackendLineup {
  id: string;
  teamId: string;
  name: string;
  formationId: string;
  /** Maps formation position IDs to athlete IDs (or null for an empty slot). */
  assignments: Record<string, string | null>;
  /** Athlete IDs currently on the substitutes bench. */
  substituteIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted by POST /lineups. */
export interface CreateLineupInput {
  name: string;
  formationId: string;
  assignments: Record<string, string | null>;
  substituteIds: string[];
}

/** Fields accepted by PATCH /lineups/:id. */
export type UpdateLineupInput = Partial<CreateLineupInput>;

const LINEUPS_PATH = "/lineups";

/** Lists all lineups saved for the team, most recently updated first. */
export async function getLineups(): Promise<BackendLineup[]> {
  return apiFetch<BackendLineup[]>(LINEUPS_PATH);
}

export async function getLineup(id: string): Promise<BackendLineup> {
  return apiFetch<BackendLineup>(`${LINEUPS_PATH}/${id}`);
}

export async function createLineup(
  input: CreateLineupInput,
): Promise<BackendLineup> {
  return apiFetch<BackendLineup>(LINEUPS_PATH, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateLineup(
  id: string,
  input: UpdateLineupInput,
): Promise<BackendLineup> {
  return apiFetch<BackendLineup>(`${LINEUPS_PATH}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteLineup(id: string): Promise<BackendLineup> {
  return apiFetch<BackendLineup>(`${LINEUPS_PATH}/${id}`, {
    method: "DELETE",
  });
}

import { apiFetch } from "@/lib/api";
import type {
  CreateSeasonInput,
  Season,
  SeasonFormValues,
  UpdateSeasonInput,
} from "@/features/statistics/types";

/**
 * Season endpoints. Reads are open to any team member; the mutations are
 * coach-only server-side, so the UI hides them for assistants rather than
 * relying on the 403.
 */
const SEASONS_PATH = "/seasons";

export async function getSeasons(): Promise<Season[]> {
  return apiFetch<Season[]>(SEASONS_PATH);
}

export async function createSeason(input: CreateSeasonInput): Promise<Season> {
  return apiFetch<Season>(SEASONS_PATH, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSeason(
  id: string,
  input: UpdateSeasonInput,
): Promise<Season> {
  return apiFetch<Season>(`${SEASONS_PATH}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteSeason(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`${SEASONS_PATH}/${id}`, {
    method: "DELETE",
  });
}

/* ── Mapping helpers ─────────────────────────────────────────────────────── */

/** Kept for consistency with the other services and as a formatting hook. */
export function toUiSeasons(backend: Season[]): Season[] {
  return backend;
}

/** Blank values for the "add season" dialog, defaulting to a typical season. */
export function emptySeasonFormValues(): SeasonFormValues {
  const now = new Date();
  const year = now.getUTCFullYear();
  return {
    name: `${year}/${String((year + 1) % 100).padStart(2, "0")}`,
    startDate: "",
    endDate: "",
    isCurrent: true,
  };
}

/** Converts a season record into the form values for the edit dialog. */
export function toSeasonFormValues(season: Season): SeasonFormValues {
  return {
    name: season.name,
    startDate: season.startDate,
    endDate: season.endDate,
    isCurrent: season.isCurrent,
  };
}

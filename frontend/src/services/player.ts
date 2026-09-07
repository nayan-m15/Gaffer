import { apiFetch } from "@/lib/api";
import type { BackendAthlete } from "./athletes";
import type { CompetitionWithStandings } from "@/features/statistics/types";
import type { AthleteStatistics } from "@/features/statistics/types";

/**
 * A team event annotated with the current player's RSVP status, as returned
 * by `GET /player/events`.
 */
export interface PlayerEvent {
  id: string;
  teamId: string;
  title: string;
  type: "training" | "match" | "meeting";
  status: "scheduled" | "cancelled" | "completed";
  scheduledAt: string;
  location: string;
  notes: string | null;
  matchId: string | null;
  createdAt: string;
  updatedAt: string;
  /** The player's RSVP status for this event, or null if not yet responded. */
  rsvpStatus: "going" | "not_going" | "maybe" | null;
  /** The player's optional RSVP note. */
  rsvpNote: string | null;
}

const PLAYER_PATH = "/player";

/** GET /player/me — claimed athlete's own record plus aggregated season stats. */
export async function fetchPlayerMe(athleteId?: string): Promise<AthleteStatistics> {
  const query = athleteId ? `?athleteId=${athleteId}` : "";
  return apiFetch<AthleteStatistics>(`${PLAYER_PATH}/me${query}`);
}

/** GET /player/team — the claimed athlete's team roster (read-only). */
export async function fetchPlayerTeam(athleteId?: string): Promise<BackendAthlete[]> {
  const query = athleteId ? `?athleteId=${athleteId}` : "";
  return apiFetch<BackendAthlete[]>(`${PLAYER_PATH}/team${query}`);
}

/** GET /player/events — team events with the player's RSVP annotations. */
export async function fetchPlayerEvents(athleteId?: string): Promise<PlayerEvent[]> {
  const query = athleteId ? `?athleteId=${athleteId}` : "";
  return apiFetch<PlayerEvent[]>(`${PLAYER_PATH}/events${query}`);
}

/** GET /player/standings — league/cup standings for the claimed athlete's team. */
export async function fetchPlayerStandings(athleteId?: string): Promise<CompetitionWithStandings[]> {
  const query = athleteId ? `?athleteId=${athleteId}` : "";
  return apiFetch<CompetitionWithStandings[]>(`${PLAYER_PATH}/standings${query}`);
}

import { apiFetch } from "@/lib/api";

export type PublicMatchStatus = "scheduled" | "cancelled" | "completed";

export interface PublicTeam {
  id: string;
  name: string;
}

export interface PublicSeason {
  id: string;
  name: string;
  teamId: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface PublicCompetition {
  id: string;
  name: string;
  type: "league" | "cup" | "friendly";
  teamId: string;
  seasonId: string | null;
}

export interface PublicDashboardFilters {
  teams: PublicTeam[];
  seasons: PublicSeason[];
  competitions: PublicCompetition[];
}

export interface PublicMatch {
  id: string;
  eventId: string;
  title: string;
  status: PublicMatchStatus;
  scheduledAt: string;
  location: string;
  opponentName: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  team: PublicTeam;
  competition: Pick<PublicCompetition, "id" | "name" | "type"> | null;
  season: Pick<PublicSeason, "id" | "name"> | null;
}

export interface PublicPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  squadNumber: number | null;
  team: PublicTeam;
  statistics: {
    appearances: number;
    minutesPlayed: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
  };
}

export interface PublicStanding {
  id: string;
  teamName: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  isOwnTeam: boolean;
  ownerTeam: PublicTeam;
  competition: Pick<PublicCompetition, "id" | "name" | "type">;
  season: Pick<PublicSeason, "id" | "name"> | null;
}

export interface PublicDashboardQuery {
  teamId?: string;
  competitionId?: string;
  seasonId?: string;
}

interface DataResponse<T> {
  success: true;
  data: T;
}

function queryString(
  filters: PublicDashboardQuery & {
    status?: PublicMatchStatus;
    limit?: number;
    offset?: number;
  },
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

const BASE = "/v1/public-dashboard";

export async function getPublicDashboardFilters() {
  const response = await apiFetch<DataResponse<PublicDashboardFilters>>(
    `${BASE}/filters`,
  );
  return response.data;
}

export async function getPublicMatches(
  filters: PublicDashboardQuery & { status?: PublicMatchStatus },
) {
  const response = await apiFetch<DataResponse<PublicMatch[]>>(
    `${BASE}/matches${queryString(filters)}`,
  );
  return response.data;
}

export async function getPublicPlayers(filters: PublicDashboardQuery) {
  const players: PublicPlayer[] = [];
  const limit = 500;
  let offset = 0;

  // Keep each backend request bounded while still fulfilling the page's
  // all-players contract when the public dataset grows beyond one page.
  while (true) {
    const response = await apiFetch<DataResponse<PublicPlayer[]>>(
      `${BASE}/players${queryString({ ...filters, limit, offset })}`,
    );
    players.push(...response.data);
    if (response.data.length < limit) return players;
    offset += limit;
  }
}

export async function getPublicTeamStatistics(filters: PublicDashboardQuery) {
  const response = await apiFetch<DataResponse<PublicStanding[]>>(
    `${BASE}/team-statistics${queryString(filters)}`,
  );
  return response.data;
}

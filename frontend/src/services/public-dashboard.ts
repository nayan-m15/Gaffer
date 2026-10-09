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
  /** All linked participant teams; `teamId` remains the legacy creator team. */
  teamIds?: string[];
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
  return getAllPages<PublicMatch>("matches", filters, 100, 1);
}

/**
 * Pages must stay within the server's cap (200, see
 * `backend/src/public-api/public-api.schemas.ts`) — asking for more is a 400,
 * not a clamped response. Three pages in flight keeps a large roster loading
 * in roughly the same wall time as the old single 500-row page.
 */
export async function getPublicPlayers(filters: PublicDashboardQuery) {
  return getAllPages<PublicPlayer>("players", filters, PLAYER_PAGE_SIZE, 3);
}

/** Kept in step with `publicPlayersQuerySchema.limit`'s maximum. */
const PLAYER_PAGE_SIZE = 200;

async function getAllPages<T>(
  resource: "matches" | "players",
  filters: PublicDashboardQuery & { status?: PublicMatchStatus },
  limit: number,
  concurrency: number,
): Promise<T[]> {
  const fetchPage = async (offset: number) => {
    const response = await apiFetch<DataResponse<T[]>>(
      `${BASE}/${resource}${queryString({ ...filters, limit, offset })}`,
    );
    return response.data;
  };

  const first = await fetchPage(0);
  const all = [...first];
  if (first.length < limit) return all;

  for (let offset = limit; ; offset += limit * concurrency) {
    const pages = await Promise.all(
      Array.from({ length: concurrency }, (_, index) =>
        fetchPage(offset + index * limit),
      ),
    );
    for (const page of pages) {
      all.push(...page);
      if (page.length < limit) return all;
    }
  }
}

export async function getPublicTeamStatistics(filters: PublicDashboardQuery) {
  const response = await apiFetch<DataResponse<PublicStanding[]>>(
    `${BASE}/team-statistics${queryString(filters)}`,
  );
  return response.data;
}

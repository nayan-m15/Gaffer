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
    starts: number;
    minutesPlayed: number;
    goals: number;
    assists: number;
    saves: number;
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

export interface PublicCompetitionFixture {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionType: "league" | "cup" | "friendly";
  stage: "league" | "knockout";
  round: number;
  position: number;
  scheduledAt: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  winnerTeamName: string | null;
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

export interface PublicPage<T> extends DataResponse<T[]> {
  count: number;
  limit: number;
  offset: number;
}

export interface PublicMatchPage extends PublicPage<PublicMatch> {
  summary: { total: number; cleanSheets: number };
}

export type PublicPlayerQuery = PublicDashboardQuery & {
  search?: string;
  position?: "ALL" | "FWD" | "MID" | "DEF" | "GK";
};

export async function getPublicMatches(
  filters: PublicDashboardQuery & { status?: PublicMatchStatus },
  offset = 0,
  signal?: AbortSignal,
) {
  return apiFetch<PublicMatchPage>(
    `${BASE}/matches${queryString({ ...filters, limit: 100, offset })}`,
    { signal },
  );
}

export async function getPublicPlayers(
  filters: PublicPlayerQuery,
  offset = 0,
  signal?: AbortSignal,
) {
  return apiFetch<PublicPage<PublicPlayer>>(
    `${BASE}/players${queryString({ ...filters, limit: 40, offset })}`,
    { signal },
  );
}

export async function getPublicTeamStatistics(filters: PublicDashboardQuery) {
  const response = await apiFetch<DataResponse<PublicStanding[]>>(
    `${BASE}/team-statistics${queryString(filters)}`,
  );
  return response.data;
}

export async function getPublicCompetitionFixtures(filters: PublicDashboardQuery) {
  const response = await apiFetch<DataResponse<PublicCompetitionFixture[]>>(
    `${BASE}/competition-fixtures${queryString(filters)}`,
  );
  return response.data;
}

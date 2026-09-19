export type CompetitionType = "league" | "cup";

export interface CompetitionInput {
  name: string;
  type: CompetitionType;
  season: string;
}

export interface Competition {
  id: string;
  name: string;
  type: CompetitionType | "friendly";
  season: string | null;
  seasonId: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export interface Participant {
  id: string;
  displayName: string;
  teamId: string | null;
  createdAt: string;
}

export interface CompetitionSummary extends Competition {
  participantCount: number;
}

export interface CompetitionStanding {
  id: string;
  competitionId: string;
  teamName: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  isOwnTeam: boolean;
}

export interface CompetitionResult {
  id: string;
  competitionId: string;
  homeCompetitionTeamId: string;
  awayCompetitionTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  playedAt: string;
  source: "live_logged" | "manual";
  linkedMatchId: string | null;
  createdAt: string;
}

export interface CompetitionResultInput {
  homeCompetitionTeamId: string;
  awayCompetitionTeamId: string;
  homeScore: number;
  awayScore: number;
  playedAt: string;
}

export interface CompetitionDetail extends Competition {
  participants: Participant[];
  standings: CompetitionStanding[];
  results: CompetitionResult[];
}

// The admin list endpoint returns pending records, including expired ones.
export interface CompetitionInvite {
  id: string;
  competitionTeamId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

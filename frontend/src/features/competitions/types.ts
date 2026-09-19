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

export interface CompetitionDetail extends Competition {
  participants: Participant[];
  standings: CompetitionStanding[];
}

// The admin list endpoint returns pending records, including expired ones.
export interface CompetitionInvite {
  id: string;
  competitionTeamId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

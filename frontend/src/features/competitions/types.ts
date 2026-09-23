export type CompetitionType = "league" | "cup";
export type CompetitionFormat = "league" | "knockout" | "league_knockout";

export interface CompetitionInput {
  name: string;
  type: CompetitionType;
  season?: string;
  format: CompetitionFormat;
  configuredTeamCount: number;
  maxSubstitutes: number;
  redCardSuspensionMatches: number;
  accumulatedYellowThreshold: number;
  yellowSuspensionMatches: number;
  startDate: string;
  allowedPlayingDays: number[];
  defaultKickoffTime: string;
  fixturesPerOpponent: 1 | 2;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  qualifierCount: 4 | 8 | 16 | 32 | null;
}

export interface Competition {
  id: string;
  name: string;
  type: CompetitionType | "friendly";
  season: string | null;
  seasonId: string | null;
  isAdmin: boolean;
  createdAt: string;
  format: CompetitionFormat | null;
  configuredTeamCount: number | null;
  maxSubstitutes: number;
  redCardSuspensionMatches: number;
  accumulatedYellowThreshold: number;
  yellowSuspensionMatches: number;
  startDate: string | null;
  allowedPlayingDays: number[];
  defaultKickoffTime: string;
  fixturesPerOpponent: 1 | 2;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  qualifierCount: number | null;
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

export type CompetitionFixtureStage = "league" | "knockout";
export type CompetitionFixtureStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type CompetitionFixtureScheduleResponse =
  | "pending"
  | "accepted"
  | "external_confirmed";

export interface CompetitionFixture {
  id: string;
  competitionId: string;
  stage: CompetitionFixtureStage;
  round: number;
  position: number;
  homeCompetitionTeamId: string | null;
  awayCompetitionTeamId: string | null;
  scheduledAt: string;
  status: CompetitionFixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  winnerCompetitionTeamId: string | null;
  nextFixtureId: string | null;
  nextFixtureSlot: "home" | "away" | null;
  linkedMatchId: string | null;
  legacyResultId: string | null;
  scheduleRevision: number;
  homeScheduleResponse: CompetitionFixtureScheduleResponse;
  awayScheduleResponse: CompetitionFixtureScheduleResponse;
  homeScheduleRespondedAt: string | null;
  awayScheduleRespondedAt: string | null;
  homeScheduleRespondedByUserId: string | null;
  awayScheduleRespondedByUserId: string | null;
  scheduleProposedByCompetitionTeamId: string | null;
  scheduleProposalNote: string | null;
  scheduleConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export type CompetitionType = "league" | "cup" | "friendly";
export type MatchResult = "W" | "D" | "L";

/** One entry in the chronological season-trend array. */
export interface TrendEntry {
  eventId: string;
  date: string;
  result: MatchResult;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/** Aggregated season totals for a single player. */
export interface PlayerStatLine {
  athleteId: string;
  name: string;
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

/** Team-wide season overview returned by GET /statistics. */
export interface TeamOverview {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  cleanSheets: number;
  points: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  trends: TrendEntry[];
  players: PlayerStatLine[];
}

/** A single match's stats for the athlete detail view. */
export interface AthleteMatchBreakdown {
  matchId: string;
  eventId: string;
  date: string;
  opponent: string;
  result: MatchResult;
  teamScore: number;
  opponentScore: number;
  started: boolean;
  minutesPlayed: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

/** Season totals + match-by-match breakdown for one athlete. */
export interface AthleteStatistics {
  athleteId: string;
  name: string;
  position: string | null;
  squadNumber: number | null;
  appearances: number;
  starts: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  matches: AthleteMatchBreakdown[];
}

/** A manually-entered standings row. */
export interface StandingRow {
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
  createdAt: string;
  updatedAt: string;
}

/** A competition with its standings rows attached. */
export interface CompetitionWithStandings {
  id: string;
  teamId: string;
  name: string;
  type: CompetitionType;
  season: string | null;
  createdAt: string;
  updatedAt: string;
  standings: StandingRow[];
}

/* ── Mutation input types ────────────────────────────────────────────────── */

export interface CreateCompetitionInput {
  name: string;
  type: CompetitionType;
  season?: string;
}

export type UpdateCompetitionInput = Partial<CreateCompetitionInput>;

export interface CreateStandingInput {
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

export type UpdateStandingInput = Partial<CreateStandingInput>;

/* ── Form value types (used by the dialog components) ─────────────────────── */

export interface CompetitionFormValues {
  name: string;
  type: CompetitionType;
  season: string;
}

export interface StandingFormValues {
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

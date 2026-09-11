export type CompetitionType = "league" | "cup" | "friendly";
export type MatchResult = "W" | "D" | "L";

/** One entry in the chronological season-trend array. */
export interface TrendEntry {
  matchId: string;
  eventId: string;
  date: string;
  opponent: string;
  isHome: boolean;
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
  /** The season the figures are scoped to, or null when covering all matches. */
  season: SeasonSummary | null;
  /** How many matches each rolling average covers once the season is long enough. */
  rollingWindow: number;
  form: SeasonForm;
  periods: SeasonPeriods;
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

/* ── Seasons ──────────────────────────────────────────────────────────────── */

/** A coach-defined date range grouping matches for season statistics. */
export interface Season {
  id: string;
  teamId: string;
  name: string;
  /** ISO calendar date, e.g. "2025-08-01". */
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  /** Completed matches falling inside the range. */
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}

/** The season echoed back on a scoped statistics response. */
export interface SeasonSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface CreateSeasonInput {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export type UpdateSeasonInput = Partial<CreateSeasonInput>;

export interface SeasonFormValues {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

/* ── Trends ───────────────────────────────────────────────────────────────── */

/** One point on the trailing moving-average series. */
export interface RollingPoint {
  matchId: string;
  date: string;
  /** 1-based match number within the season. */
  index: number;
  /** Matches actually covered — smaller than `rollingWindow` early in a season. */
  windowSize: number;
  goalsForAvg: number;
  goalsAgainstAvg: number;
  pointsPerGame: number;
}

/** One point on the running points/goal-difference series. */
export interface CumulativePoint {
  matchId: string;
  date: string;
  index: number;
  points: number;
  cumulativePoints: number;
  cumulativeGoalDifference: number;
}

export interface SeasonForm {
  rolling: RollingPoint[];
  cumulative: CumulativePoint[];
}

/** How the season was divided for the period comparison. */
export type PeriodMode = "halves" | "monthly";

/** Aggregates for one segment of the season. */
export interface PeriodSplit {
  key: string;
  label: string;
  from: string;
  to: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  pointsPerGame: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  winRate: number;
}

export type TrendDirection = "improving" | "declining" | "steady";

export type DeltaMetric =
  | "pointsPerGame"
  | "avgGoalsFor"
  | "avgGoalsAgainst"
  | "winRate";

/** First-period vs last-period movement for one metric. */
export interface MetricDelta {
  metric: DeltaMetric;
  label: string;
  first: number;
  last: number;
  /** `last - first`. Read the sign together with `higherIsBetter`. */
  delta: number;
  direction: TrendDirection;
  /** False for goals conceded, where a fall is an improvement. */
  higherIsBetter: boolean;
}

export interface SeasonPeriods {
  mode: PeriodMode;
  splits: PeriodSplit[];
  deltas: MetricDelta[];
}

/* ── Athlete comparison ───────────────────────────────────────────────────── */

/** Rates normalised per appearance or per 90 minutes. */
export interface ComparisonRates {
  goals: number;
  assists: number;
  goalContributions: number;
}

/** One athlete's season line in a side-by-side comparison. */
export interface AthleteComparisonLine {
  athleteId: string;
  name: string;
  position: string | null;
  squadNumber: number | null;
  appearances: number;
  starts: number;
  minutesPlayed: number;
  /** Matches with recorded minutes — the basis for `per90`. */
  matchesWithMinutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  goalContributions: number;
  perAppearance: ComparisonRates;
  /** Null until the live logger records minutes played. */
  per90: ComparisonRates | null;
}

export interface AthleteComparison {
  season: SeasonSummary | null;
  athletes: AthleteComparisonLine[];
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
  /** Linked season, or null when the competition predates seasons. */
  seasonId: string | null;
  /** @deprecated Free-text label superseded by `seasonId`. */
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

import type {
  AthleteComparisonLine,
  CumulativePoint,
  MetricDelta,
  PeriodSplit,
  RollingPoint,
  TrendDirection,
} from "./types";

/**
 * Pure chart-data builders for the season trends section.
 *
 * Kept separate from the recharts components (mirroring
 * `match-report-model.ts` / `match-report-charts.tsx`) so the shaping logic can
 * be tested with `node --test` without rendering anything.
 */

export interface RollingChartRow {
  index: number;
  label: string;
  goalsFor: number;
  goalsAgainst: number;
  pointsPerGame: number;
  /** True until the trailing window is full — the early points are partial. */
  partial: boolean;
}

export interface CumulativeChartRow {
  index: number;
  label: string;
  points: number;
  goalDifference: number;
}

export interface PeriodChartRow {
  key: string;
  label: string;
  value: number;
  matchesPlayed: number;
}

export interface ComparisonChartRow {
  metric: string;
  /** One entry per athlete, keyed by name — recharts reads these as series. */
  [athleteName: string]: string | number;
}

/** Which per-period metric the split chart is showing. */
export type PeriodMetric = Extract<
  keyof PeriodSplit,
  "pointsPerGame" | "avgGoalsFor" | "avgGoalsAgainst" | "winRate"
>;

export const PERIOD_METRIC_LABELS: Record<PeriodMetric, string> = {
  pointsPerGame: "Points per match",
  avgGoalsFor: "Goals scored per match",
  avgGoalsAgainst: "Goals conceded per match",
  winRate: "Win rate",
};

export function rollingChartRows(
  rolling: RollingPoint[],
  rollingWindow: number,
): RollingChartRow[] {
  return rolling.map((point) => ({
    index: point.index,
    label: `M${point.index}`,
    goalsFor: point.goalsForAvg,
    goalsAgainst: point.goalsAgainstAvg,
    pointsPerGame: point.pointsPerGame,
    partial: point.windowSize < rollingWindow,
  }));
}

export function cumulativeChartRows(
  cumulative: CumulativePoint[],
): CumulativeChartRow[] {
  return cumulative.map((point) => ({
    index: point.index,
    label: `M${point.index}`,
    points: point.cumulativePoints,
    goalDifference: point.cumulativeGoalDifference,
  }));
}

export function periodChartRows(
  splits: PeriodSplit[],
  metric: PeriodMetric,
): PeriodChartRow[] {
  return splits.map((split) => ({
    key: split.key,
    label: split.label,
    value: split[metric],
    matchesPlayed: split.matchesPlayed,
  }));
}

/** Metrics shown in the athlete comparison chart, in display order. */
const COMPARISON_METRICS = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "goalContributions", label: "G+A" },
  { key: "appearances", label: "Apps" },
] as const;

/**
 * Pivots athlete lines into one row per metric with a column per athlete,
 * which is the shape a grouped recharts BarChart expects.
 */
export function comparisonChartRows(
  athletes: AthleteComparisonLine[],
): ComparisonChartRow[] {
  return COMPARISON_METRICS.map(({ key, label }) => {
    const row: ComparisonChartRow = { metric: label };
    for (const athlete of athletes) {
      row[athlete.name] = athlete[key];
    }
    return row;
  });
}

/** `+1.67`, `-0.25`, `0` — always signed so direction is readable at a glance. */
export function formatDelta(delta: number): string {
  if (delta === 0) return "0";
  const rounded = Math.round(delta * 100) / 100;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * Maps a delta onto a visual tone. Uses `direction`, which the backend has
 * already reconciled with `higherIsBetter` — so conceding fewer goals is
 * "positive" even though its delta is negative.
 */
export function deltaTone(delta: MetricDelta): "positive" | "negative" | "neutral" {
  const byDirection: Record<TrendDirection, "positive" | "negative" | "neutral"> = {
    improving: "positive",
    declining: "negative",
    steady: "neutral",
  };
  return byDirection[delta.direction];
}

/** Arrow glyph for a delta chip — follows the raw movement, not the judgement. */
export function deltaArrow(delta: MetricDelta): "up" | "down" | "flat" {
  if (delta.direction === "steady") return "flat";
  return delta.delta > 0 ? "up" : "down";
}

/** "1 Aug 2025 – 31 May 2026" for a season subtitle. */
const RANGE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatSeasonRange(startDate: string, endDate: string): string {
  return `${RANGE_FMT.format(new Date(`${startDate}T00:00:00Z`))} – ${RANGE_FMT.format(
    new Date(`${endDate}T00:00:00Z`),
  )}`;
}

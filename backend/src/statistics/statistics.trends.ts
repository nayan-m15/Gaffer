/**
 * Pure season-trend calculations. No database, no Nest — everything here is a
 * function of an already-fetched, chronologically ordered match list, so it can
 * be unit-tested without stubbing Drizzle query builders.
 *
 * `StatisticsService` fetches the rows and delegates every derived number to
 * this module.
 */

/** Points awarded per match result. Centralised so the scoring system is easy to change. */
export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;
export const LOSS_POINTS = 0;

/** Default trailing window for rolling form, in matches. */
export const ROLLING_WINDOW = 5;

/**
 * A delta smaller than this (after rounding to 2dp) reads as "steady" rather
 * than as an improvement or decline — it stops noise being reported as a trend.
 */
const STEADY_EPSILON = 0.05;

/** Minimum recorded minutes before a per-90 rate is meaningful. */
const MIN_MINUTES_FOR_PER_90 = 90;

export type MatchResult = 'W' | 'D' | 'L';
export type PeriodMode = 'halves' | 'monthly';
export type TrendDirection = 'improving' | 'declining' | 'steady';

/** A completed match as read from the database. */
export interface MatchRow {
  matchId: string;
  eventId: string;
  date: Date;
  opponent: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
}

/** One entry in the chronological season-trend array. */
export interface MatchTrendEntry {
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

export interface SeasonTotals {
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
}

export interface RollingPoint {
  matchId: string;
  date: string;
  /** 1-based match number within the season. */
  index: number;
  /** How many matches this average actually covers — smaller than the window early on. */
  windowSize: number;
  goalsForAvg: number;
  goalsAgainstAvg: number;
  pointsPerGame: number;
}

export interface CumulativePoint {
  matchId: string;
  date: string;
  index: number;
  points: number;
  cumulativePoints: number;
  cumulativeGoalDifference: number;
}

export interface PeriodSplit {
  key: string;
  label: string;
  /** ISO timestamp of the first match in the period. */
  from: string;
  /** ISO timestamp of the last match in the period. */
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

export interface MetricDelta {
  metric: 'pointsPerGame' | 'avgGoalsFor' | 'avgGoalsAgainst' | 'winRate';
  label: string;
  first: number;
  last: number;
  /** `last - first`, rounded to 2dp. Sign is raw — read it with `higherIsBetter`. */
  delta: number;
  direction: TrendDirection;
  /** False for goals conceded, where a negative delta is an improvement. */
  higherIsBetter: boolean;
}

export interface TrendsPayload {
  rollingWindow: number;
  form: {
    rolling: RollingPoint[];
    cumulative: CumulativePoint[];
  };
  periods: {
    mode: PeriodMode;
    splits: PeriodSplit[];
    deltas: MetricDelta[];
  };
}

/* ── Primitives ───────────────────────────────────────────────────────────── */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function divide(total: number, count: number): number {
  return count > 0 ? round2(total / count) : 0;
}

export function matchResult(
  goalsFor: number,
  goalsAgainst: number,
): MatchResult {
  if (goalsFor > goalsAgainst) return 'W';
  if (goalsFor === goalsAgainst) return 'D';
  return 'L';
}

export function matchPoints(result: MatchResult): number {
  if (result === 'W') return WIN_POINTS;
  if (result === 'D') return DRAW_POINTS;
  return LOSS_POINTS;
}

/**
 * Rate per 90 minutes, or null when too little playing time has been recorded
 * to make the rate meaningful. `minutesPlayed` is currently never written by the
 * live match logger, so this returns null for most athletes.
 */
export function per90(stat: number, minutes: number): number | null {
  if (minutes < MIN_MINUTES_FOR_PER_90) return null;
  return round2((stat * 90) / minutes);
}

export function perAppearance(stat: number, appearances: number): number {
  return divide(stat, appearances);
}

/* ── Aggregation ──────────────────────────────────────────────────────────── */

/**
 * Folds chronologically ordered matches into season totals plus the per-match
 * trend entries every other calculation in this module builds on.
 */
export function summariseMatches(rows: MatchRow[]): {
  totals: SeasonTotals;
  entries: MatchTrendEntry[];
} {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;
  let points = 0;

  const entries = rows.map((row) => {
    const gf = row.teamScore;
    const ga = row.opponentScore;
    const result = matchResult(gf, ga);
    const earned = matchPoints(result);

    if (result === 'W') wins += 1;
    else if (result === 'D') draws += 1;
    else losses += 1;

    goalsFor += gf;
    goalsAgainst += ga;
    if (ga === 0) cleanSheets += 1;
    points += earned;

    return {
      matchId: row.matchId,
      eventId: row.eventId,
      date: row.date.toISOString(),
      opponent: row.opponent,
      isHome: row.isHome,
      result,
      goalsFor: gf,
      goalsAgainst: ga,
      points: earned,
    };
  });

  const matchesPlayed = rows.length;

  return {
    totals: {
      matchesPlayed,
      wins,
      draws,
      losses,
      // Deliberately unrounded — the existing API contract returns the raw
      // fraction and the frontend formats it.
      winRate: matchesPlayed > 0 ? wins / matchesPlayed : 0,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      cleanSheets,
      points,
      avgGoalsFor: matchesPlayed > 0 ? goalsFor / matchesPlayed : 0,
      avgGoalsAgainst: matchesPlayed > 0 ? goalsAgainst / matchesPlayed : 0,
    },
    entries,
  };
}

/**
 * Trailing moving averages over the last `window` matches. The window is
 * partial for the opening matches (`windowSize` says how many it covers) so the
 * series starts at match 1 rather than leaving a gap the chart has to explain.
 */
export function rollingForm(
  entries: MatchTrendEntry[],
  window: number = ROLLING_WINDOW,
): RollingPoint[] {
  return entries.map((entry, i) => {
    const index = i + 1;
    const windowSize = Math.min(window, index);
    const slice = entries.slice(index - windowSize, index);

    let goalsForTotal = 0;
    let goalsAgainstTotal = 0;
    let pointsTotal = 0;
    for (const m of slice) {
      goalsForTotal += m.goalsFor;
      goalsAgainstTotal += m.goalsAgainst;
      pointsTotal += m.points;
    }

    return {
      matchId: entry.matchId,
      date: entry.date,
      index,
      windowSize,
      goalsForAvg: divide(goalsForTotal, windowSize),
      goalsAgainstAvg: divide(goalsAgainstTotal, windowSize),
      pointsPerGame: divide(pointsTotal, windowSize),
    };
  });
}

/** Running points and goal difference — the classic season progression line. */
export function cumulativePoints(
  entries: MatchTrendEntry[],
): CumulativePoint[] {
  let runningPoints = 0;
  let runningGoalDifference = 0;

  return entries.map((entry, i) => {
    runningPoints += entry.points;
    runningGoalDifference += entry.goalsFor - entry.goalsAgainst;

    return {
      matchId: entry.matchId,
      date: entry.date,
      index: i + 1,
      points: entry.points,
      cumulativePoints: runningPoints,
      cumulativeGoalDifference: runningGoalDifference,
    };
  });
}

/**
 * Monthly splits once the season is long enough to have a shape; otherwise the
 * simpler first-half/second-half comparison, which stays readable at 2 matches.
 */
export function choosePeriodMode(entries: MatchTrendEntry[]): PeriodMode {
  const months = new Set(entries.map((e) => e.date.slice(0, 7)));
  return months.size >= 3 && entries.length >= 6 ? 'monthly' : 'halves';
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "2025-08" -> "Aug 2025". */
function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

function summarisePeriod(
  key: string,
  label: string,
  slice: MatchTrendEntry[],
): PeriodSplit {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;
  let points = 0;

  for (const m of slice) {
    if (m.result === 'W') wins += 1;
    else if (m.result === 'D') draws += 1;
    else losses += 1;
    goalsFor += m.goalsFor;
    goalsAgainst += m.goalsAgainst;
    if (m.goalsAgainst === 0) cleanSheets += 1;
    points += m.points;
  }

  const matchesPlayed = slice.length;

  return {
    key,
    label,
    from: slice[0].date,
    to: slice[slice.length - 1].date,
    matchesPlayed,
    wins,
    draws,
    losses,
    points,
    goalsFor,
    goalsAgainst,
    cleanSheets,
    pointsPerGame: divide(points, matchesPlayed),
    avgGoalsFor: divide(goalsFor, matchesPlayed),
    avgGoalsAgainst: divide(goalsAgainst, matchesPlayed),
    winRate: divide(wins, matchesPlayed),
  };
}

/**
 * Splits the season into comparable segments. Halves put the odd match in the
 * first half. Returns an empty array below 2 matches, where no comparison is
 * possible.
 */
export function periodSplits(
  entries: MatchTrendEntry[],
  mode: PeriodMode,
): PeriodSplit[] {
  if (entries.length < 2) return [];

  if (mode === 'halves') {
    const mid = Math.ceil(entries.length / 2);
    return [
      summarisePeriod('first', 'First half', entries.slice(0, mid)),
      summarisePeriod('second', 'Second half', entries.slice(mid)),
    ];
  }

  const byMonth = new Map<string, MatchTrendEntry[]>();
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(entry);
    else byMonth.set(key, [entry]);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, slice]) => summarisePeriod(key, monthLabel(key), slice));
}

const DELTA_METRICS: ReadonlyArray<{
  metric: MetricDelta['metric'];
  label: string;
  higherIsBetter: boolean;
}> = [
  { metric: 'pointsPerGame', label: 'Points per match', higherIsBetter: true },
  {
    metric: 'avgGoalsFor',
    label: 'Goals scored per match',
    higherIsBetter: true,
  },
  {
    metric: 'avgGoalsAgainst',
    label: 'Goals conceded per match',
    higherIsBetter: false,
  },
  { metric: 'winRate', label: 'Win rate', higherIsBetter: true },
];

/**
 * Compares the first and last period to say which way each metric is moving.
 * `direction` already accounts for `higherIsBetter`, so fewer goals conceded
 * reads as "improving".
 */
export function splitDeltas(splits: PeriodSplit[]): MetricDelta[] {
  if (splits.length < 2) return [];

  const first = splits[0];
  const last = splits[splits.length - 1];
  if (first.matchesPlayed === 0 || last.matchesPlayed === 0) return [];

  return DELTA_METRICS.map(({ metric, label, higherIsBetter }) => {
    const delta = round2(last[metric] - first[metric]);

    let direction: TrendDirection;
    if (Math.abs(delta) < STEADY_EPSILON) direction = 'steady';
    else if (delta > 0) direction = higherIsBetter ? 'improving' : 'declining';
    else direction = higherIsBetter ? 'declining' : 'improving';

    return {
      metric,
      label,
      first: first[metric],
      last: last[metric],
      delta,
      direction,
      higherIsBetter,
    };
  });
}

/** Everything the season-trends section of the API needs, from one match list. */
export function buildTrends(
  entries: MatchTrendEntry[],
  options: { window?: number } = {},
): TrendsPayload {
  const window = options.window ?? ROLLING_WINDOW;
  const mode = choosePeriodMode(entries);
  const splits = periodSplits(entries, mode);

  return {
    rollingWindow: window,
    form: {
      rolling: rollingForm(entries, window),
      cumulative: cumulativePoints(entries),
    },
    periods: {
      mode,
      splits,
      deltas: splitDeltas(splits),
    },
  };
}

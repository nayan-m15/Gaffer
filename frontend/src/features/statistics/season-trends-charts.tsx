import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  comparisonChartRows,
  cumulativeChartRows,
  periodChartRows,
  rollingChartRows,
  type PeriodMetric,
} from "./season-trends-model";
import type {
  AthleteComparisonLine,
  CumulativePoint,
  PeriodSplit,
  RollingPoint,
} from "./types";

/**
 * Recharts views over the season-trend model.
 *
 * Unlike `match-report-charts.tsx` — which lives inside a permanently dark
 * match report — these render on the themed statistics page, so every colour
 * comes from a CSS variable and follows light/dark automatically.
 */

const AXIS = { fill: "var(--color-muted-foreground)", fontSize: 10 };
const GRID = "var(--color-border)";

/** Named roles for the single-team charts, so each line keeps its meaning. */
const GOALS_FOR = "var(--color-chart-1)";
const GOALS_AGAINST = "var(--color-chart-5)";
const POINTS = "var(--color-chart-2)";

/**
 * Per-athlete series. chart-1 and chart-2 are neighbouring greens, so the
 * comparison skips chart-2 — three athletes side by side have to be told apart
 * at a glance.
 */
const SERIES = [
  "var(--color-chart-1)",
  "var(--color-chart-5)",
  "var(--color-chart-4)",
] as const;

const tooltipStyle = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: "0.5rem",
    fontSize: "0.75rem",
    color: "var(--color-popover-foreground)",
  },
  labelStyle: { color: "var(--color-muted-foreground)" },
} as const;

const legendStyle = { fontSize: "0.7rem" } as const;

/** Goals for/against and points per match, as trailing moving averages. */
export function RollingFormChart({
  rolling,
  rollingWindow,
}: {
  rolling: RollingPoint[];
  rollingWindow: number;
}) {
  const rows = rollingChartRows(rolling, rollingWindow);

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS} />
          <YAxis axisLine={false} tickLine={false} tick={AXIS} />
          <YAxis
            yAxisId="ppg"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={AXIS}
            domain={[0, 3]}
            width={24}
          />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          <Line
            type="monotone"
            dataKey="goalsFor"
            name="Goals scored"
            stroke={GOALS_FOR}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="goalsAgainst"
            name="Goals conceded"
            stroke={GOALS_AGAINST}
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="ppg"
            type="monotone"
            dataKey="pointsPerGame"
            name="Points per match"
            stroke={POINTS}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Running points total across the season. */
export function CumulativePointsChart({
  cumulative,
}: {
  cumulative: CumulativePoint[];
}) {
  const rows = cumulativeChartRows(cumulative);

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="cumulativePointsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={POINTS} stopOpacity={0.35} />
              <stop offset="100%" stopColor={POINTS} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={AXIS} />
          <Tooltip {...tooltipStyle} />
          <Area
            type="monotone"
            dataKey="points"
            name="Points"
            stroke={POINTS}
            strokeWidth={2}
            fill="url(#cumulativePointsFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One bar per season segment for the selected metric. */
export function PeriodSplitChart({
  splits,
  metric,
  label,
}: {
  splits: PeriodSplit[];
  metric: PeriodMetric;
  label: string;
}) {
  const rows = periodChartRows(splits, metric);

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS} />
          <YAxis axisLine={false} tickLine={false} tick={AXIS} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="value" name={label} fill={GOALS_FOR} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Grouped bars: one group per metric, one bar per athlete. */
export function AthleteComparisonChart({
  athletes,
}: {
  athletes: AthleteComparisonLine[];
}) {
  const rows = comparisonChartRows(athletes);

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="metric" axisLine={false} tickLine={false} tick={AXIS} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={AXIS} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          {athletes.map((athlete, index) => (
            <Bar
              key={athlete.athleteId}
              dataKey={athlete.name}
              fill={SERIES[index % SERIES.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

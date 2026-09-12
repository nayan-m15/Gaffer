import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CumulativePointsChart,
  PeriodSplitChart,
  RollingFormChart,
} from "./season-trends-charts";
import {
  PERIOD_METRIC_LABELS,
  deltaArrow,
  deltaTone,
  formatDelta,
  type PeriodMetric,
} from "./season-trends-model";
import type { MetricDelta, SeasonForm, SeasonPeriods } from "./types";

/**
 * Season trends: how the team's form is moving, rather than what it has
 * totalled. Three views — trailing averages, cumulative points, and a
 * period-over-period comparison with an improving/declining verdict.
 */
export function SeasonTrendsSection({
  form,
  periods,
  rollingWindow,
}: {
  form: SeasonForm;
  periods: SeasonPeriods;
  rollingWindow: number;
}) {
  const [metric, setMetric] = useState<PeriodMetric>("pointsPerGame");

  // Below two matches there is no trend to show, only a single result.
  if (form.rolling.length < 2) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <SectionHeading>Season Trends</SectionHeading>
        <p className="mt-2 text-sm text-muted-foreground">
          Trends appear once at least two matches have been played this season.
        </p>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <SectionHeading>Form Trend</SectionHeading>
        <p className="mb-3 text-xs text-muted-foreground">
          Rolling average over the last {rollingWindow} matches. Early matches
          average fewer.
        </p>
        <RollingFormChart rolling={form.rolling} rollingWindow={rollingWindow} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <SectionHeading>Points Progression</SectionHeading>
        <p className="mb-3 text-xs text-muted-foreground">
          Points accumulated across the season.
        </p>
        <CumulativePointsChart cumulative={form.cumulative} />
      </section>

      {periods.splits.length >= 2 && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionHeading>
                {periods.mode === "monthly"
                  ? "Month by Month"
                  : "First Half vs Second Half"}
              </SectionHeading>
              <p className="mt-1 text-xs text-muted-foreground">
                Comparing {periods.splits[0].label} with{" "}
                {periods.splits[periods.splits.length - 1].label}.
              </p>
            </div>
            <MetricToggle value={metric} onChange={setMetric} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <PeriodSplitChart
              splits={periods.splits}
              metric={metric}
              label={PERIOD_METRIC_LABELS[metric]}
            />
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {periods.deltas.map((delta) => (
                <DeltaChip key={delta.metric} delta={delta} />
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
      {children}
    </h2>
  );
}

function MetricToggle({
  value,
  onChange,
}: {
  value: PeriodMetric;
  onChange: (metric: PeriodMetric) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1">
      {(Object.keys(PERIOD_METRIC_LABELS) as PeriodMetric[]).map((metric) => (
        <button
          key={metric}
          type="button"
          onClick={() => onChange(metric)}
          aria-pressed={value === metric}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === metric
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {PERIOD_METRIC_LABELS[metric]}
        </button>
      ))}
    </div>
  );
}

/**
 * One metric's movement between the first and last period. The tone follows
 * the backend's `direction`, so conceding fewer goals reads as an improvement
 * even though its delta is negative.
 */
function DeltaChip({ delta }: { delta: MetricDelta }) {
  const tone = deltaTone(delta);
  const arrow = deltaArrow(delta);
  const Icon =
    arrow === "up" ? ArrowUpRight : arrow === "down" ? ArrowDownRight : Minus;

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">
          {delta.label}
        </p>
        <p className="text-xs text-muted-foreground">
          {delta.first} → {delta.last}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
          tone === "positive" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          tone === "negative" && "bg-destructive/10 text-destructive",
          tone === "neutral" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3" aria-hidden />
        {formatDelta(delta.delta)}
      </span>
    </li>
  );
}

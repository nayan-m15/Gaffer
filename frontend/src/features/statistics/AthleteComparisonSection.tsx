import { Loader2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAthleteComparison } from "./hooks";
import { AthleteComparisonChart } from "./season-trends-charts";
import { MAX_COMPARE_ATHLETES } from "./useStatisticsFilters";
import type { AthleteComparisonLine } from "./types";

/**
 * Side-by-side comparison of two or three athletes.
 *
 * Per-appearance rates lead: `minutesPlayed` is not recorded by the live match
 * logger yet, so per-90 is null for every athlete and is only rendered on the
 * rare rows that do have minutes.
 */
export function AthleteComparisonSection({
  athleteIds,
  seasonId,
  onClear,
}: {
  athleteIds: string[];
  seasonId?: string;
  onClear: () => void;
}) {
  const query = useAthleteComparison(athleteIds, seasonId);

  if (athleteIds.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.75)] backdrop-blur-xl md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
            Player Comparison
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {athleteIds.length < 2
              ? `Select at least one more player to compare (up to ${MAX_COMPARE_ATHLETES}).`
              : "Season totals and per-appearance rates, side by side."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onClear}>
          <X className="size-4" />
          Clear
        </Button>
      </div>

      {athleteIds.length < 2 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Users className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Tick a second player in the table above.
          </p>
        </div>
      )}

      {athleteIds.length >= 2 && query.isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading comparison…
        </div>
      )}

      {query.isError && (
        <p className="py-6 text-sm text-destructive">
          {query.error instanceof ApiError
            ? query.error.message
            : "Could not load the comparison."}
        </p>
      )}

      {query.data && query.data.athletes.length >= 2 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ComparisonTable athletes={query.data.athletes} />
          <AthleteComparisonChart athletes={query.data.athletes} />
        </div>
      )}
    </section>
  );
}

/** Rows rendered for every comparison, in display order. */
const COMPARE_ROWS = [
  { label: "Appearances", get: (a: AthleteComparisonLine) => a.appearances },
  { label: "Starts", get: (a: AthleteComparisonLine) => a.starts },
  { label: "Goals", get: (a: AthleteComparisonLine) => a.goals },
  { label: "Assists", get: (a: AthleteComparisonLine) => a.assists },
  { label: "Goals + Assists", get: (a: AthleteComparisonLine) => a.goalContributions },
  {
    label: "Goals per app",
    get: (a: AthleteComparisonLine) => a.perAppearance.goals,
  },
  {
    label: "Assists per app",
    get: (a: AthleteComparisonLine) => a.perAppearance.assists,
  },
  {
    label: "G+A per app",
    get: (a: AthleteComparisonLine) => a.perAppearance.goalContributions,
  },
  { label: "Yellow cards", get: (a: AthleteComparisonLine) => a.yellowCards },
  { label: "Red cards", get: (a: AthleteComparisonLine) => a.redCards },
] as const;

function ComparisonTable({ athletes }: { athletes: AthleteComparisonLine[] }) {
  // Only shown when the live logger actually recorded minutes for someone.
  const hasPer90 = athletes.some((a) => a.per90 !== null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Metric
            </th>
            {athletes.map((athlete) => (
              <th
                key={athlete.athleteId}
                className="py-2 px-2 text-right text-xs font-semibold text-foreground"
              >
                {athlete.name}
                {athlete.squadNumber !== null && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    #{athlete.squadNumber}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row) => {
            const values = athletes.map(row.get);
            const best = Math.max(...values);

            return (
              <tr key={row.label} className="border-b border-border/60">
                <td className="py-2 pr-3 text-left text-muted-foreground">
                  {row.label}
                </td>
                {athletes.map((athlete, i) => (
                  <td
                    key={athlete.athleteId}
                    className={cn(
                      "py-2 px-2 text-right tabular-nums",
                      // Highlight the leader, but not when everyone is level.
                      values[i] === best && best > 0 && values.some((v) => v !== best)
                        ? "font-semibold text-foreground"
                        : "text-foreground/80",
                    )}
                  >
                    {values[i]}
                  </td>
                ))}
              </tr>
            );
          })}

          {hasPer90 && (
            <tr className="border-b border-border/60">
              <td className="py-2 pr-3 text-left text-muted-foreground">
                Goals per 90
              </td>
              {athletes.map((athlete) => (
                <td
                  key={athlete.athleteId}
                  className="py-2 px-2 text-right tabular-nums text-foreground/80"
                >
                  {athlete.per90 ? athlete.per90.goals : "—"}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>

      {!hasPer90 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Per-90 rates need minutes played, which aren't recorded during live
          match logging yet.
        </p>
      )}
    </div>
  );
}

import { useState } from "react";
import { ChevronDown, ChevronRight, Trophy } from "lucide-react";
import type { CompetitionType } from "@/features/statistics/types";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
 *  STANDINGS DISPLAY — shared read-only standings view.
 *
 *  Used by both the coach's StatisticsPage and the player's
 *  PlayerStandingsPage. Displays competitions as expandable cards with a
 *  standings table — no edit / add / delete affordances.
 * ═══════════════════════════════════════════════════════════════════════════ */

interface StandingsDisplayProps {
  competitions: ReadOnlyCompetition[];
  isLoading?: boolean;
  /** Shown when there are no competitions. */
  emptyMessage?: string;
}

export interface ReadOnlyStanding {
  id: string;
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

export interface ReadOnlyCompetition {
  id: string;
  name: string;
  type: CompetitionType;
  season?: string | null;
  standings: ReadOnlyStanding[];
}

export function StandingsDisplay({
  competitions,
  isLoading = false,
  emptyMessage = "No competitions yet.",
}: StandingsDisplayProps) {
  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading standings…
        </div>
      </section>
    );
  }

  if (competitions.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-12 text-center">
          <Trophy className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {emptyMessage}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Trophy className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
          Competitions &amp; Standings
        </h2>
      </div>
      <div className="flex flex-col gap-3">
        {competitions.map((c) => (
          <ReadOnlyCompetitionCard key={c.id} competition={c} />
        ))}
      </div>
    </section>
  );
}

/* ── Read-only competition card ──────────────────────────────────────────── */

function ReadOnlyCompetitionCard({
  competition,
}: {
  competition: ReadOnlyCompetition;
}) {
  const [expanded, setExpanded] = useState(true);

  const typeLabel =
    competition.type.charAt(0).toUpperCase() + competition.type.slice(1);

  return (
    <div className="rounded-xl border border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <h3 className="truncate text-sm font-bold text-foreground">
            {competition.name}
          </h3>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {typeLabel}
          </span>
          {competition.season && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {competition.season}
            </span>
          )}
        </button>
      </div>

      {/* Standings table */}
      {expanded && (
        <div className="border-t border-border">
          <ReadOnlyStandingsTable standings={competition.standings} />
        </div>
      )}
    </div>
  );
}

/* ── Read-only standings table ────────────────────────────────────────────── */

const STANDINGS_COLUMNS = [
  { key: "pos", label: "POS", className: "w-12 text-center" },
  { key: "team", label: "TEAM", className: "min-w-[100px]" },
  { key: "p", label: "P", className: "w-10 text-center" },
  { key: "w", label: "W", className: "w-10 text-center" },
  { key: "d", label: "D", className: "w-10 text-center" },
  { key: "l", label: "L", className: "w-10 text-center" },
  { key: "gf", label: "GF", className: "w-10 text-center" },
  { key: "ga", label: "GA", className: "w-10 text-center" },
  { key: "pts", label: "PTS", className: "w-10 text-center" },
] as const;

function ReadOnlyStandingsTable({
  standings,
}: {
  standings: ReadOnlyStanding[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {STANDINGS_COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn("py-2.5 px-3", col.className)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.length === 0 ? (
            <tr>
              <td
                colSpan={STANDINGS_COLUMNS.length}
                className="py-6 text-center"
              >
                <p className="text-sm text-muted-foreground">
                  No standings rows yet.
                </p>
              </td>
            </tr>
          ) : (
            standings.map((s) => (
              <tr
                key={s.id}
                className={cn(
                  "border-b border-border last:border-b-0",
                  s.isOwnTeam ? "bg-primary/10" : "hover:bg-muted/30",
                )}
              >
                <td className="px-3 py-2.5 text-center font-bold tabular-nums text-foreground">
                  {s.position}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "font-semibold",
                      s.isOwnTeam ? "text-primary" : "text-foreground",
                    )}
                  >
                    {s.teamName}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                  {s.played}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground">
                  {s.won}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                  {s.drawn}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                  {s.lost}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground">
                  {s.goalsFor}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                  {s.goalsAgainst}
                </td>
                <td className="px-3 py-2.5 text-center font-bold tabular-nums text-foreground">
                  {s.points}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

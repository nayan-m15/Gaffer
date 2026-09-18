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
  /** Use a four-column table with inline secondary stats below `sm`. */
  compactOnMobile?: boolean;
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
  compactOnMobile = false,
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
    <section
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm",
        compactOnMobile ? "p-2.5 sm:p-4 md:p-6" : "p-4 md:p-6",
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <Trophy className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
          Competitions &amp; Standings
        </h2>
      </div>
      <div className="flex flex-col gap-3">
        {competitions.map((c) => (
          <ReadOnlyCompetitionCard
            key={c.id}
            competition={c}
            compactOnMobile={compactOnMobile}
          />
        ))}
      </div>
    </section>
  );
}

/* ── Read-only competition card ──────────────────────────────────────────── */

function ReadOnlyCompetitionCard({
  competition,
  compactOnMobile,
}: {
  competition: ReadOnlyCompetition;
  compactOnMobile: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const typeLabel =
    competition.type.charAt(0).toUpperCase() + competition.type.slice(1);

  return (
    <div className="rounded-xl border border-border bg-background">
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2",
          compactOnMobile ? "p-3 sm:p-4" : "p-4",
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
            compactOnMobile &&
              "min-h-11 flex-1 flex-wrap gap-x-2 gap-y-1 sm:min-h-0 sm:flex-nowrap",
          )}
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <h3
            className={cn(
              "truncate text-sm font-bold text-foreground",
              compactOnMobile && "min-w-0 flex-1 basis-32 sm:basis-auto",
            )}
          >
            {competition.name}
          </h3>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {typeLabel}
          </span>
          {competition.season && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {competition.season}
            </span>
          )}
        </button>
      </div>

      {/* Standings table */}
      {expanded && (
        <div className="border-t border-border">
          <ReadOnlyStandingsTable
            standings={competition.standings}
            compactOnMobile={compactOnMobile}
          />
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

const MOBILE_SECONDARY_COLUMNS = new Set(["w", "d", "l", "gf", "ga"]);

function ReadOnlyStandingsTable({
  standings,
  compactOnMobile,
}: {
  standings: ReadOnlyStanding[];
  compactOnMobile: boolean;
}) {
  return (
    <div
      className={
        compactOnMobile
          ? "overflow-x-hidden sm:overflow-x-auto"
          : "overflow-x-auto"
      }
    >
      <table
        className={cn(
          "w-full caption-bottom text-sm",
          compactOnMobile && "table-fixed sm:table-auto",
        )}
      >
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {STANDINGS_COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-3 py-2.5",
                  col.className,
                  compactOnMobile && "px-1.5 py-2 sm:px-3 sm:py-2.5",
                  compactOnMobile && MOBILE_SECONDARY_COLUMNS.has(col.key) &&
                    "hidden sm:table-cell",
                  compactOnMobile && col.key === "pos" && "w-10 sm:w-12",
                  compactOnMobile && col.key === "p" && "w-9 sm:w-10",
                  compactOnMobile && col.key === "pts" && "w-11 sm:w-10",
                )}
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
                <td
                  className={cn(
                    "px-3 py-2.5 text-center font-bold tabular-nums text-foreground",
                    compactOnMobile && "px-1.5 py-2 sm:px-3 sm:py-2.5",
                  )}
                >
                  {s.position}
                </td>
                <td
                  className={cn(
                    "min-w-0 px-3 py-2.5",
                    compactOnMobile && "px-1.5 py-2 sm:px-3 sm:py-2.5",
                  )}
                >
                  <span
                    title={s.teamName}
                    className={cn(
                      "block truncate font-semibold",
                      s.isOwnTeam ? "text-primary" : "text-foreground",
                    )}
                  >
                    {s.teamName}
                    {s.isOwnTeam && <span className="sr-only"> (Your team)</span>}
                  </span>
                  {compactOnMobile && (
                    <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-4 text-muted-foreground sm:hidden">
                      <span>
                        <strong>W</strong> {s.won}
                      </span>
                      <span>
                        <strong>D</strong> {s.drawn}
                      </span>
                      <span>
                        <strong>L</strong> {s.lost}
                      </span>
                      <span>
                        <strong>GF</strong> {s.goalsFor}
                      </span>
                      <span>
                        <strong>GA</strong> {s.goalsAgainst}
                      </span>
                    </span>
                  )}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-center tabular-nums text-muted-foreground",
                    compactOnMobile && "px-1.5 py-2 sm:px-3 sm:py-2.5",
                  )}
                >
                  {s.played}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-center tabular-nums text-foreground",
                    compactOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {s.won}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-center tabular-nums text-muted-foreground",
                    compactOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {s.drawn}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-center tabular-nums text-muted-foreground",
                    compactOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {s.lost}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-center tabular-nums text-foreground",
                    compactOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {s.goalsFor}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-center tabular-nums text-muted-foreground",
                    compactOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {s.goalsAgainst}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-center font-bold tabular-nums text-foreground",
                    compactOnMobile && "px-1.5 py-2 sm:px-3 sm:py-2.5",
                  )}
                >
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

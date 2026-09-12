import type { UseQueryResult } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "./formatting";
import { ResultBadge } from "./ResultBadge";
import type { AthleteMatchBreakdown, AthleteStatistics } from "./types";

export function AthleteStatsPanel({
  athleteId,
  query,
}: {
  athleteId: string | null;
  query: UseQueryResult<AthleteStatistics>;
}) {
  if (!athleteId) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Select a player to view statistics.
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-destructive">
        Could not load athlete statistics.
      </div>
    );
  }

  const stats = query.data;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto rounded-2xl border border-border bg-card p-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">{stats.name}</h2>
        <p className="text-sm text-cyan-400">
          {stats.position ?? "—"}
          {stats.squadNumber ? ` · #${stats.squadNumber}` : ""}
        </p>
      </div>

      {/* Season totals */}
      <div className="grid grid-cols-3 gap-3">
        <DetailStat label="APPS" value={stats.appearances} />
        <DetailStat label="STARTS" value={stats.starts} />
        <DetailStat label="GOALS" value={stats.goals} valueClassName="text-primary" />
        <DetailStat label="ASSISTS" value={stats.assists} valueClassName="text-primary" />
        <DetailStat
          label="YELLOW"
          value={stats.yellowCards}
          valueClassName="text-amber-400"
        />
        <DetailStat
          label="RED"
          value={stats.redCards}
          valueClassName="text-red-400"
        />
      </div>

      {/* Match-by-match */}
      <section className="flex-1">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Match-by-Match
        </h3>
        {stats.matches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
            No recorded matches yet for this player.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {stats.matches.map((m: AthleteMatchBreakdown) => (
              <div
                key={m.matchId}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    vs. {m.opponent}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{formatDate(m.date)}</span>
                    <StartedTag started={m.started} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ResultBadge result={m.result} />
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {m.teamScore}–{m.opponentScore}
                    </p>
                    <MatchPerformance m={m} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          valueClassName ?? "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** "Started"/"Sub" pill shown beside a match date in the athlete panel. */
function StartedTag({ started }: { started: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        started
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {started ? "Started" : "Sub"}
    </span>
  );
}

/** Small coloured card glyph with its count, e.g. for bookings. */
function CardGlyph({
  count,
  className,
  label,
}: {
  count: number;
  className: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`${count} ${label}${count === 1 ? "" : "s"}`}
    >
      <span className={cn("inline-block size-2 rounded-sm", className)} />
      {count > 1 && <span className="tabular-nums">{count}</span>}
    </span>
  );
}

/**
 * Compact per-match contribution line under the score: minutes played,
 * goals, assists and cards. Zero or unrecorded values are omitted so a
 * quiet match stays visually quiet.
 */
function MatchPerformance({ m }: { m: AthleteMatchBreakdown }) {
  const hasContributions =
    m.minutesPlayed !== null ||
    m.goals > 0 ||
    m.assists > 0 ||
    m.yellowCards > 0 ||
    m.redCards > 0;

  if (!hasContributions) {
    return <p className="text-[11px] text-muted-foreground">—</p>;
  }

  return (
    <p className="flex flex-wrap items-center justify-end gap-x-1.5 text-[11px] text-muted-foreground">
      {m.minutesPlayed !== null && (
        <span className="tabular-nums">{m.minutesPlayed}'</span>
      )}
      {m.goals > 0 && <span className="tabular-nums">{m.goals}G</span>}
      {m.assists > 0 && <span className="tabular-nums">{m.assists}A</span>}
      {m.yellowCards > 0 && (
        <CardGlyph
          count={m.yellowCards}
          className="bg-amber-400"
          label="yellow card"
        />
      )}
      {m.redCards > 0 && (
        <CardGlyph
          count={m.redCards}
          className="bg-red-400"
          label="red card"
        />
      )}
    </p>
  );
}

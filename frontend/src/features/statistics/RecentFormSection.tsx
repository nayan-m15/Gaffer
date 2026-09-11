import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatMatchDateTime } from "./formatting";
import { ResultBadge } from "./ResultBadge";
import type { TrendEntry } from "./types";

/**
 * Recent results as clickable W/D/L pills.
 *
 * The goals- and points-per-match bars that used to sit beside these were
 * hand-rolled divs; `SeasonTrendsSection` now covers the same ground with
 * proper axes, tooltips and rolling averages, so only the form strip remains.
 */
export function RecentFormSection({
  trends,
  teamName,
}: {
  trends: TrendEntry[];
  teamName: string;
}) {
  const recentMatches = trends.slice(-10).reverse();
  const [selectedId, setSelectedId] = useState(recentMatches[0]?.matchId);
  if (trends.length === 0) return null;

  const selected =
    recentMatches.find((match) => match.matchId === selectedId) ??
    recentMatches[0]!;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="size-4 text-muted-foreground" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Recent Form
        </h2>
        <span className="text-[11px] text-muted-foreground">
          (most recent first)
        </span>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Recent results">
        {recentMatches.map((match) => (
          <ResultBadge
            key={match.matchId}
            result={match.result}
            selected={match.matchId === selected.matchId}
            onSelect={() => setSelectedId(match.matchId)}
          />
        ))}
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-sm font-medium text-foreground">
          {selected.isHome
            ? `${teamName} vs ${selected.opponent}`
            : `${selected.opponent} vs ${teamName}`}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {selected.isHome
              ? `${selected.goalsFor}-${selected.goalsAgainst}`
              : `${selected.goalsAgainst}-${selected.goalsFor}`}
          </span>
          <span>{formatMatchDateTime(selected.date)}</span>
        </p>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { formatAvg, formatDiff, formatRate } from "./formatting";
import type { TeamOverview } from "./types";

export function StatCardsGrid({ overview }: { overview: TeamOverview }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      <StatCard label="Matches Played" value={overview.matchesPlayed} />
      <StatCard label="Wins" value={overview.wins} variant="positive" />
      <StatCard label="Draws" value={overview.draws} />
      <StatCard label="Losses" value={overview.losses} variant="negative" />
      <StatCard label="Win Rate" value={formatRate(overview.winRate)} />
      <StatCard label="Points" value={overview.points} variant="positive" />
      <StatCard label="Goals For" value={overview.goalsFor} />
      <StatCard
        label="Goals Against"
        value={overview.goalsAgainst}
        variant="negative"
      />
      <StatCard
        label="Goal Diff"
        value={formatDiff(overview.goalDifference)}
        variant={overview.goalDifference >= 0 ? "positive" : "negative"}
      />
      <StatCard label="Clean Sheets" value={overview.cleanSheets} />
      <StatCard label="Avg GF" value={formatAvg(overview.avgGoalsFor)} />
      <StatCard
        label="Avg GA"
        value={formatAvg(overview.avgGoalsAgainst)}
        variant="negative"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  variant = "neutral",
}: {
  label: string;
  value: string | number;
  variant?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          variant === "positive" && "text-primary",
          variant === "negative" && "text-destructive",
          variant === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

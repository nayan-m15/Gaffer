import { useMemo, useState } from "react";
import { RefreshCcw, Trophy } from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import { Button } from "@/components/ui/button";
import { useCompetitionPlayerStats } from "./hooks";
import type { CompetitionPlayerStat, Participant } from "./types";

const categories = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "goalContributions", label: "Goal contributions" },
  { key: "saves", label: "Goalkeeper saves" },
  { key: "appearances", label: "Appearances" },
  { key: "yellowCards", label: "Yellow cards" },
  { key: "redCards", label: "Red cards" },
] as const satisfies ReadonlyArray<{ key: keyof CompetitionPlayerStat; label: string }>;
type StatKey = (typeof categories)[number]["key"];

export function CompetitionPlayerStats({ competitionId, participants }: { competitionId: string; participants: Participant[] }) {
  const query = useCompetitionPlayerStats(competitionId);
  const [category, setCategory] = useState<StatKey>("goals");
  const [team, setTeam] = useState("all");
  const players = useMemo(() => (query.data ?? [])
    .filter((player) => team === "all" || player.teamId === team)
    .filter((player) => player[category] > 0)
    .sort((a, b) => b[category] - a[category] || b.goals - a.goals || a.name.localeCompare(b.name)),
    [query.data, category, team]);

  return <AppCard className="space-y-4" id="player-stats">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="size-5 text-primary" />Competition player stats</h2>
        <p className="mt-1 text-sm text-muted-foreground">Leaderboards across all participating teams, based on completed, logged fixtures.</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
        <RefreshCcw className="size-4" />Refresh
      </Button>
    </div>
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Statistic category">
      {categories.map(({ key, label }) => <Button key={key} size="sm" variant={category === key ? "default" : "outline"}
        aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</Button>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="competition-stats-team" className="text-sm font-medium">Team</label>
      <select id="competition-stats-team" value={team} onChange={(event) => setTeam(event.target.value)}
        className="max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="all">All teams</option>
        {participants.filter((participant) => participant.teamId).map((participant) =>
          <option key={participant.id} value={participant.teamId!}>{participant.displayName}</option>)}
      </select>
    </div>
    {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading player statistics...</p> :
      query.isError ? <div role="alert" className="text-sm text-destructive">Unable to load competition player statistics. Try refreshing.</div> :
      players.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        No recorded {categories.find((item) => item.key === category)?.label.toLowerCase()} yet. Player rankings appear after a completed fixture has an attributed match report.
      </p> :
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[400px] text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr>
            <th className="px-4 py-3">Rank</th><th className="px-4 py-3">Player</th><th className="px-4 py-3">Team</th>
            <th className="px-4 py-3 text-right">{categories.find((item) => item.key === category)?.label}</th>
          </tr></thead>
          <tbody>{players.map((player, index) => <tr key={player.athleteId} className="border-t border-border/70">
            <td className="px-4 py-3 font-semibold">
              {index === 0 ? (
                <span aria-label="1st place" title="1st place" className="inline-flex size-8 items-center justify-center rounded-lg border border-primary/35 bg-primary/10 font-bold tabular-nums text-primary">1</span>
              ) : (
                <span className="inline-flex size-8 items-center justify-center tabular-nums">{index + 1}</span>
              )}
            </td>
            <td className="px-4 py-3"><span className="font-medium">{player.name}</span>{player.position && <span className="ml-2 text-xs text-muted-foreground">{player.position}</span>}</td>
            <td className="px-4 py-3 text-muted-foreground">{player.teamName}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums">{player[category]}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    <p className="text-xs text-muted-foreground">Manual score-only results cannot attribute stats to players. Goalkeeper clean sheets will be added when reliable keeper participation data is available.</p>
  </AppCard>;
}

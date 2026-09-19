import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompetitionWithStandings } from "./types";

export function StandingsSection({
  competitions,
  isLoading,
}: {
  competitions: CompetitionWithStandings[];
  isLoading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.75)] backdrop-blur-xl md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
            Competitions & Standings
          </h2>
        </div>
        <Link
          to="/competitions"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Manage competitions
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading competitions…
        </div>
      ) : competitions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-12 text-center">
          <Trophy className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No competitions yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Join or create a league or cup from Leagues & Competitions.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {competitions.map((competition) => (
            <CompetitionCard key={competition.id} competition={competition} />
          ))}
        </div>
      )}
    </section>
  );
}

function CompetitionCard({
  competition,
}: {
  competition: CompetitionWithStandings;
}) {
  const [expanded, setExpanded] = useState(true);
  const typeLabel =
    competition.type.charAt(0).toUpperCase() + competition.type.slice(1);

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
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
          {competition.isAdmin && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Admin
            </span>
          )}
        </button>
        {competition.isAdmin && competition.type !== "friendly" && (
          <Link
            to={`/competitions/${competition.id}#results`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Manage results
          </Link>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border">
          <StandingsTable standings={competition.standings} />
        </div>
      )}
    </div>
  );
}

function StandingsTable({
  standings,
}: {
  standings: CompetitionWithStandings["standings"];
}) {
  const columns = [
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn("px-3 py-2.5", column.className)}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.map((standing) => (
            <tr
              key={standing.id}
              className={cn(
                "border-b border-border last:border-b-0",
                standing.isOwnTeam ? "bg-primary/10" : "hover:bg-muted/30",
              )}
            >
              <td className="px-3 py-2.5 text-center font-bold tabular-nums text-foreground">
                {standing.position}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={cn(
                    "font-semibold",
                    standing.isOwnTeam ? "text-primary" : "text-foreground",
                  )}
                >
                  {standing.teamName}
                </span>
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{standing.played}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{standing.won}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{standing.drawn}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{standing.lost}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{standing.goalsFor}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{standing.goalsAgainst}</td>
              <td className="px-3 py-2.5 text-center font-bold tabular-nums text-foreground">{standing.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

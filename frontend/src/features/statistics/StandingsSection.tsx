import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompetitionWithStandings } from "./types";

export function StandingsSection({
  competitions,
  isLoading,
  onAddStanding,
  onEditStanding,
  onDeleteStanding,
}: {
  competitions: CompetitionWithStandings[];
  isLoading: boolean;
  onAddStanding: (c: CompetitionWithStandings) => void;
  onEditStanding: (
    c: CompetitionWithStandings,
    standingId: string,
  ) => void;
  onDeleteStanding: (
    c: CompetitionWithStandings,
    standing: { id: string; teamName: string },
  ) => void;
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
          {competitions.map((c) => (
            <CompetitionCard
              key={c.id}
              competition={c}
              onAddStanding={() => onAddStanding(c)}
              onEditStanding={(id) => onEditStanding(c, id)}
              onDeleteStanding={(s) => onDeleteStanding(c, s)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CompetitionCard({
  competition,
  onAddStanding,
  onEditStanding,
  onDeleteStanding,
}: {
  competition: CompetitionWithStandings;
  onAddStanding: () => void;
  onEditStanding: (standingId: string) => void;
  onDeleteStanding: (standing: {
    id: string;
    teamName: string;
  }) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const typeLabel =
    competition.type.charAt(0).toUpperCase() + competition.type.slice(1);

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between gap-2 p-4">
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
          {competition.isAdmin && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Admin
            </span>
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border">
          <StandingsTable
            standings={competition.standings}
            canManage={competition.isAdmin}
            onAdd={onAddStanding}
            onEdit={onEditStanding}
            onDelete={onDeleteStanding}
          />
        </div>
      )}
    </div>
  );
}

function StandingsTable({
  standings,
  canManage,
  onAdd,
  onEdit,
  onDelete,
}: {
  standings: CompetitionWithStandings["standings"];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (standingId: string) => void;
  onDelete: (standing: {
    id: string;
    teamName: string;
  }) => void;
}) {
  const COLUMNS = [
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

  const colSpan = COLUMNS.length + (canManage ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn("px-3 py-2.5", col.className)}
              >
                {col.label}
              </th>
            ))}
            {canManage && (
              <th scope="col" className="w-16 px-3 py-2.5 text-right">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {standings.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No standings rows yet.
                </p>
                {canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={onAdd}
                  >
                    <Plus className="size-3.5" />
                    Add Standing
                  </Button>
                )}
              </td>
            </tr>
          ) : (
            <>
              {standings.map((s) => (
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
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{s.played}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{s.won}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{s.drawn}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{s.lost}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-foreground">{s.goalsFor}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{s.goalsAgainst}</td>
                  <td className="px-3 py-2.5 text-center font-bold tabular-nums text-foreground">{s.points}</td>
                  {canManage && (
                    <td className="px-3 py-2.5 text-right">
                      {!s.id.startsWith("participant:") && (
                        <div className="flex items-center justify-end gap-1" role="group">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onEdit(s.id)}
                            aria-label="Edit standing"
                            title="Edit"
                          >
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onDelete({ id: s.id, teamName: s.teamName })}
                            aria-label="Delete standing"
                            title="Delete"
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {canManage && (
                <tr>
                  <td colSpan={colSpan} className="py-2 text-right">
                    <Button variant="ghost" size="sm" className="gap-1.5" onClick={onAdd}>
                      <Plus className="size-3.5" />
                      Add Standing
                    </Button>
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

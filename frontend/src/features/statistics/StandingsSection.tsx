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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompetitionWithStandings } from "./types";

export function StandingsSection({
  competitions,
  isLoading,
  onAddCompetition,
  onEditCompetition,
  onDeleteCompetition,
  onAddStanding,
  onEditStanding,
  onDeleteStanding,
}: {
  competitions: CompetitionWithStandings[];
  isLoading: boolean;
  onAddCompetition: () => void;
  onEditCompetition: (c: CompetitionWithStandings) => void;
  onDeleteCompetition: (c: CompetitionWithStandings) => void;
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
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
            Competitions & Standings
          </h2>
        </div>
        <Button size="sm" className="gap-1.5" onClick={onAddCompetition}>
          <Plus className="size-4" />
          Add Competition
        </Button>
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
            Add a competition to start tracking standings.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {competitions.map((c) => (
            <CompetitionCard
              key={c.id}
              competition={c}
              onEdit={() => onEditCompetition(c)}
              onDelete={() => onDeleteCompetition(c)}
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
  onEdit,
  onDelete,
  onAddStanding,
  onEditStanding,
  onDeleteStanding,
}: {
  competition: CompetitionWithStandings;
  onEdit: () => void;
  onDelete: () => void;
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
      {/* Header */}
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
        </button>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onEdit}
            aria-label="Edit competition"
            title="Edit"
          >
            <Pencil className="size-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDelete}
            aria-label="Delete competition"
            title="Delete"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Standings table */}
      {expanded && (
        <div className="border-t border-border">
          <StandingsTable
            standings={competition.standings}
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
  onAdd,
  onEdit,
  onDelete,
}: {
  standings: CompetitionWithStandings["standings"];
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn("py-2.5 px-3", col.className)}
              >
                {col.label}
              </th>
            ))}
            <th scope="col" className="w-16 px-3 py-2.5 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No standings rows yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={onAdd}
                >
                  <Plus className="size-3.5" />
                  Add Standing
                </Button>
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
                  <td className="px-3 py-2.5 text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                      role="group"
                    >
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
                        onClick={() =>
                          onDelete({ id: s.id, teamName: s.teamName })
                        }
                        aria-label="Delete standing"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={COLUMNS.length + 1} className="py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={onAdd}
                  >
                    <Plus className="size-3.5" />
                    Add Standing
                  </Button>
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

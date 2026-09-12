import { CalendarRange, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatSeasonRange } from "./season-trends-model";
import type { Season } from "./types";

/**
 * Season management. Rendered only for coaches — assistants can filter by
 * season but cannot create or edit them, matching the server-side gate on
 * `POST/PATCH/DELETE /seasons`.
 */
export function SeasonsSection({
  seasons,
  isLoading,
  activeSeasonId,
  onAdd,
  onEdit,
  onDelete,
  onSelect,
}: {
  seasons: Season[];
  isLoading: boolean;
  activeSeasonId?: string;
  onAdd: () => void;
  onEdit: (season: Season) => void;
  onDelete: (season: Season) => void;
  onSelect: (seasonId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
            Seasons
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Date ranges that group matches for season statistics. Ranges cannot
            overlap.
          </p>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="size-4" />
          Add Season
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading seasons…
        </div>
      )}

      {!isLoading && seasons.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <CalendarRange className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No seasons yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a season to compare performance over a defined period.
          </p>
        </div>
      )}

      {!isLoading && seasons.length > 0 && (
        <ul className="flex flex-col gap-2">
          {seasons.map((season) => (
            <li
              key={season.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3",
                season.id === activeSeasonId
                  ? "border-primary/60 ring-1 ring-primary/30"
                  : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(season.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  {season.name}
                  {season.isCurrent && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      Current
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatSeasonRange(season.startDate, season.endDate)} ·{" "}
                  {season.matchCount}{" "}
                  {season.matchCount === 1 ? "match" : "matches"}
                </p>
              </button>

              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onEdit(season)}
                  aria-label={`Edit ${season.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(season)}
                  aria-label={`Delete ${season.name}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

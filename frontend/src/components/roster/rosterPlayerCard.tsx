import { Archive, Eye, Pencil, RotateCcw } from "lucide-react";
import type { Athlete } from "@/components/roster/data";
import { StatusBadge } from "@/components/roster/StatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RosterPlayerCardProps {
  athlete: Athlete;
  selected?: boolean;
  showArchived?: boolean;
  readOnly?: boolean;
  showClaimStatus?: boolean;
  onSelect: (athlete: Athlete) => void;
  onEdit?: (athlete: Athlete) => void;
  onArchive?: (athlete: Athlete) => void;
  onRestore?: (athlete: Athlete) => void;
}

const PLAYER_STATS = [
  { key: "appearances", label: "Apps", valueClassName: undefined },
  { key: "goals", label: "Goals", valueClassName: "text-brand" },
  { key: "assists", label: "Ast", valueClassName: "text-brand" },
  { key: "yellowCards", label: "YC", valueClassName: "text-warning" },
  { key: "redCards", label: "RC", valueClassName: "text-danger" },
] as const;

/**
 * rosterPlayerCard is the shared roster presentation at every breakpoint.
 * Its content wraps and compacts responsively without changing the data model.
 */
export function RosterPlayerCard({
  athlete,
  selected = false,
  showArchived = false,
  readOnly = false,
  showClaimStatus = false,
  onSelect,
  onEdit,
  onArchive,
  onRestore,
}: RosterPlayerCardProps) {
  return (
    <article
      className={cn(
        "group min-w-0 overflow-hidden rounded-xl border bg-surface-nested p-3 shadow-[0_12px_28px_-24px_rgba(0,0,0,0.9)] transition-[border-color,background-color,box-shadow]",
        selected
          ? "border-brand bg-brand/5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_25%,transparent),0_12px_30px_-24px_var(--brand)]"
          : "border-border-subtle hover:border-border-strong",
        athlete.isArchived && "opacity-80",
      )}
      aria-label={`${athlete.name}${selected ? ", selected" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSelect(athlete)}
        className="block w-full min-w-0 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-pressed={selected}
        aria-label={`View ${athlete.name}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full border bg-gradient-to-br from-muted to-background text-sm font-bold text-foreground",
              selected ? "border-brand/60" : "border-border-strong",
            )}
            aria-hidden="true"
          >
            {athlete.initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-bold text-foreground">
                  <span className="shrink-0 text-xs text-muted-foreground">
                    #{athlete.jerseyNumber}
                  </span>
                  <span className="break-words leading-tight">{athlete.name}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={athlete.status} className="px-2 py-0 text-[10px]" />
                  {showClaimStatus && (
                    <StatusBadge status={athlete.claimStatus} className="px-2 py-0 text-[10px]" />
                  )}
                </div>
              </div>

              <span className="shrink-0 rounded-md border border-info/20 bg-info/10 px-2 py-1 text-[10px] font-bold text-info">
                {athlete.position}
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-5 gap-1 border-y border-border-subtle py-2.5 text-center">
          {PLAYER_STATS.map(({ key, label, valueClassName }) => (
            <div key={key} className="min-w-0">
              <dt className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </dt>
              <dd
                className={cn(
                  "mt-0.5 text-xs font-bold tabular-nums text-foreground",
                  valueClassName,
                )}
              >
                {athlete[key]}
              </dd>
            </div>
          ))}
        </dl>
      </button>

      <div className="mt-2.5 flex min-w-0 items-center gap-2" role="group" aria-label={`Actions for ${athlete.name}`}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelect(athlete)}
          className="h-8 min-w-0 flex-1 gap-1.5 px-2 text-xs"
        >
          <Eye className="size-3.5 shrink-0" />
          <span className="truncate">View Player</span>
        </Button>

        {!readOnly &&
          (showArchived ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRestore?.(athlete)}
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
            >
              <RotateCcw className="size-3.5 text-brand" />
              Restore
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEdit?.(athlete)}
                className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onArchive?.(athlete)}
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Archive ${athlete.name}`}
                title="Archive player"
              >
                <Archive className="size-3.5" />
              </Button>
            </>
          ))}
      </div>
    </article>
  );
}

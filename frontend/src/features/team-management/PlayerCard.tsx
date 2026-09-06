/**
 * Player card component for the Team Management tactical board.
 *
 * Renders in two variants:
 * - **pitch**: Compact card for placement on the football pitch.
 * - **sub**: Horizontal card for the substitutes bench.
 *
 * Both variants are draggable and display only data that actually exists
 * in the database (name via initials, position, squad number, availability
 * status).
 */

import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/roster/StatusBadge";
import { STATUS_LABELS, type AthleteStatusValue } from "@/services/athletes";

/**
 * Availability dot colours for the compact pitch variant, matching the
 * roster StatusBadge palette (Available → blue, Injured → red, Suspended →
 * yellow). Kept readable against the grass with a light border.
 */
const STATUS_DOT_STYLES: Record<AthleteStatusValue, string> = {
  available: "bg-blue-500 dark:bg-blue-400",
  injured: "bg-red-500 dark:bg-red-400",
  suspended: "bg-yellow-500 dark:bg-yellow-400",
};

interface PlayerCardProps {
  /** Player initials for the avatar circle. */
  initials: string;
  /** Full display name. */
  name: string;
  /** Short position label (e.g. "GK", "CB", "ST"). */
  position: string;
  /** Squad number, or null if not set. */
  squadNumber: number | null;
  /** Persisted availability status, or null/undefined when unknown. */
  status?: AthleteStatusValue | null;
  /** Card variant. */
  variant: "pitch" | "sub";
  /** Whether this card is currently being dragged. */
  isDragging?: boolean;
  /** Whether this is a valid drop target highlight. */
  isDropTarget?: boolean;
  /** Whether this drop target is invalid. */
  isInvalid?: boolean;
  /** Called when the card drag starts. */
  onDragStart?: (e: React.DragEvent) => void;
  /** Called when the card drag ends. */
  onDragEnd?: (e: React.DragEvent) => void;
  /** Additional class name. */
  className?: string;
}

export function PlayerCard({
  initials,
  name,
  position,
  squadNumber,
  status,
  variant,
  isDragging = false,
  isDropTarget = false,
  isInvalid = false,
  onDragStart,
  onDragEnd,
  className,
}: PlayerCardProps) {
  const statusSuffix = status ? ` · ${STATUS_LABELS[status]}` : "";

  if (variant === "pitch") {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={cn(
          "flex flex-col items-center gap-0.5 cursor-grab select-none",
          "w-[clamp(52px,8vw,68px)]",
          isDragging && "opacity-40 cursor-grabbing",
          className,
        )}
        role="button"
        aria-label={`${name} — ${position}${squadNumber ? ` #${squadNumber}` : ""}${statusSuffix}`}
        tabIndex={0}
      >
        {/* Avatar */}
        <div
          className={cn(
            "relative flex items-center justify-center rounded-full",
            "size-[clamp(32px,5vw,42px)]",
            "text-[10px] font-bold uppercase",
            "border-2 shadow-sm transition-colors duration-150",
            position.toUpperCase() === "GK"
              ? "bg-amber-400 text-amber-950 border-amber-500"
              : "bg-white text-slate-900 border-slate-900/25",
            isDropTarget && !isInvalid && "ring-2 ring-primary scale-110",
            isInvalid && "ring-2 ring-destructive bg-destructive/15",
          )}
        >
          {initials}
          {/* Availability indicator */}
          {status && (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 size-2.5 rounded-full",
                "border border-white/80 shadow-sm",
                STATUS_DOT_STYLES[status],
              )}
              title={STATUS_LABELS[status]}
              aria-hidden="true"
            />
          )}
        </div>

        {/* Name */}
        <span className="text-[clamp(8px,1.3vw,11px)] font-medium text-foreground text-center leading-tight truncate w-full [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
          {name}
        </span>

        {/* Position + number row */}
        <span className="text-[clamp(7px,1.1vw,9px)] font-medium text-foreground/80 leading-none [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
          {position}
          {squadNumber ? ` · #${squadNumber}` : ""}
        </span>
      </div>
    );
  }

  /* ─── Sub variant (horizontal card) ──────────────────────────────────── */
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-2.5 py-2",
        "bg-card text-card-foreground",
        "cursor-grab select-none transition-colors duration-150",
        "hover:border-primary/40 hover:bg-primary/5",
        "min-w-[160px] max-w-[200px] shrink-0",
        isDragging && "opacity-40 cursor-grabbing",
        isDropTarget && !isInvalid && "ring-2 ring-primary border-primary",
        isInvalid && "ring-2 ring-destructive border-destructive",
        className,
      )}
      role="button"
      aria-label={`${name} — ${position}${squadNumber ? ` #${squadNumber}` : ""}${statusSuffix}`}
      tabIndex={0}
    >
      {/* Avatar */}
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full",
          "size-8 text-[10px] font-bold uppercase",
          "border",
          position.toUpperCase() === "GK"
            ? "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400 dark:border-amber-400/30"
            : "bg-primary/10 text-primary border-primary/20 dark:text-primary",
        )}
      >
        {initials}
        {/* Availability indicator */}
        {status && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 size-2 rounded-full",
              "border border-background shadow-sm",
              STATUS_DOT_STYLES[status],
            )}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground leading-tight">
          {name}
        </p>
        <p className="truncate text-[10px] text-muted-foreground leading-tight">
          {position}
          {squadNumber ? ` · #${squadNumber}` : ""}
        </p>
        {status && (
          <StatusBadge status={STATUS_LABELS[status]} className="mt-1 px-2 py-0.5 text-[10px]" />
        )}
      </div>
    </div>
  );
}

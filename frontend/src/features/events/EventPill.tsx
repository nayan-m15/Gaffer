import { cn } from "@/lib/utils";
import { formatEventTime } from "./calendar-utils";
import { displayEventStatus } from "./event-utils";
import { getEventTypeStyle, pillAriaLabel } from "./event-style";
import type { TeamEvent } from "./types";

interface EventPillProps {
  event: TeamEvent;
  now: Date;
  onSelect: (event: TeamEvent) => void;
}

/**
 * Compact calendar pill: leading colour dot, start time, and title.
 * Used inside month day cells.
 */
export function EventPill({ event, now, onSelect }: EventPillProps) {
  const style = getEventTypeStyle(event.type);
  const timeLabel = formatEventTime(event.scheduledAt);
  const cancelled = event.status === "cancelled";
  const completed = displayEventStatus(event, now) === "completed";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(event);
      }}
      aria-label={pillAriaLabel(timeLabel, event.type, event.title)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left",
        "text-[11px] font-medium leading-tight transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        style.pill,
        cancelled && "line-through opacity-60",
        !cancelled && completed && "opacity-70",
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", style.swatch)}
        aria-hidden="true"
      />
      <span className="shrink-0 tabular-nums">{timeLabel}</span>
      <span className="truncate">{event.title}</span>
    </button>
  );
}

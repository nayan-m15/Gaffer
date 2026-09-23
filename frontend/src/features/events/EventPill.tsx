import { useRef, useState } from "react";
import { Clock, FileText, MapPin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatEventTime } from "./calendar-utils";
import { displayEventStatus, eventTypeLabel } from "./event-utils";
import { getEventTypeStyle, pillAriaLabel } from "./event-style";
import type { TeamEvent } from "./types";

interface EventPillProps {
  event: TeamEvent;
  now: Date;
  onSelect: (event: TeamEvent) => void;
}

/**
 * Compact calendar pill showing leading color dot and title.
 * Expands on hover to show time, location, type, and details.
 */
export function EventPill({ event, now, onSelect }: EventPillProps) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const style = getEventTypeStyle(event.type);
  const Icon = style.icon;
  const timeLabel = formatEventTime(event.scheduledAt);
  const cancelled = event.status === "cancelled";
  const completed = displayEventStatus(event, now) === "completed";
  const provisionalFixture = Boolean(
    event.competitionFixtureId &&
      !event.fixtureScheduleConfirmedAt &&
      event.status === "scheduled",
  );
  const statusLabel = provisionalFixture
    ? "provisional"
    : displayEventStatus(event, now);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setOpen(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 100);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
          onSelect(event);
        }}
        aria-label={pillAriaLabel(timeLabel, event.type, event.title)}
        className={cn(
          "group flex w-full items-start rounded-md px-2 py-1 text-left cursor-pointer",
          "text-xs font-semibold leading-snug transition-all duration-150 shadow-2xs",
          "hover:scale-[1.01] hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          style.pill,
          cancelled && "line-through opacity-60",
          !cancelled && completed && "opacity-75",
        )}
      >
        <span className="min-w-0 flex-1 break-words whitespace-normal font-semibold line-clamp-2">
          {event.title}
        </span>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-64 p-3 shadow-lg"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex flex-col gap-2">
          {/* Header with type badge & status */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                style.pill,
              )}
            >
              <Icon className="size-3" />
              {eventTypeLabel(event.type)}
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider",
                statusLabel === "cancelled"
                  ? "text-destructive"
                  : statusLabel === "completed"
                    ? "text-muted-foreground"
                    : statusLabel === "provisional"
                      ? "text-amber-500"
                      : "text-primary",
              )}
            >
              {statusLabel}
            </span>
          </div>

          {/* Title */}
          <h4
            className={cn(
              "text-sm font-bold text-foreground leading-snug",
              cancelled && "line-through opacity-60",
            )}
          >
            {event.title}
          </h4>

          {/* Details */}
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground pt-1.5 border-t border-border/60">
            {/* Time */}
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 shrink-0 text-foreground/70" />
              <span className="tabular-nums font-semibold text-foreground">
                {timeLabel}
              </span>
            </div>

            {/* Location */}
            {event.location && (
              <div className="flex items-center gap-2">
                <MapPin className="size-3.5 shrink-0 text-foreground/70" />
                <span className="truncate">{event.location}</span>
              </div>
            )}

            {/* Notes */}
            {event.notes && (
              <div className="flex items-start gap-2 pt-0.5">
                <FileText className="size-3.5 shrink-0 text-foreground/70 mt-0.5" />
                <span className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">
                  {event.notes}
                </span>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useMemo } from "react";
import { MapPin } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  formatEventTime,
  getDayEvents,
  getWeekDays,
  getWeekdayLabels,
  isSameCalendarDay,
} from "./calendar-utils";
import { displayEventStatus, eventTypeLabel } from "./event-utils";
import { getEventTypeStyle } from "./event-style";
import type { TeamEvent } from "./types";

interface WeekViewProps {
  /** Any date inside the week being displayed. */
  weekOf: Date;
  eventsByDay: Map<string, TeamEvent[]>;
  selectedDate: Date;
  now: Date;
  onCreateEvent: (date: Date) => void;
  onOpenEvent: (event: TeamEvent) => void;
}

const weekdayLabels = getWeekdayLabels();

/**
 * Week view: seven day columns with richer event cards. The data model has a
 * start time only (no duration), so days are chronological lists rather than
 * a proportional hour grid.
 */
export function WeekView({
  weekOf,
  eventsByDay,
  selectedDate,
  now,
  onCreateEvent,
  onOpenEvent,
}: WeekViewProps) {
  const weekDays = useMemo(() => getWeekDays(weekOf), [weekOf]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
      <div className="w-full min-w-[700px]">
        {/* Day headers */}
        <div role="row" className="grid grid-cols-7 border-b border-border bg-muted/30">
          {weekDays.map((day, index) => {
            const isToday = isSameCalendarDay(day, now);
            const isSelected = isSameCalendarDay(day, selectedDate);
            return (
              <div
                key={day.toISOString()}
                role="columnheader"
                className="flex flex-col items-center gap-1 border-r border-border px-1.5 py-2.5 sm:py-3 last:border-r-0"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {weekdayLabels[index]}
                </span>
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs sm:size-8 sm:text-sm font-semibold tabular-nums transition-colors",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : isSelected
                        ? "bg-primary/15 text-primary font-bold ring-1 ring-primary/40"
                        : "text-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        <div className="grid grid-cols-7">
          {weekDays.map((day) => (
            <WeekDayColumn
              key={day.toISOString()}
              day={day}
              events={getDayEvents(eventsByDay, day)}
              isSelected={isSameCalendarDay(day, selectedDate)}
              isToday={isSameCalendarDay(day, now)}
              now={now}
              onCreateEvent={onCreateEvent}
              onOpenEvent={onOpenEvent}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekDayColumn({
  day,
  events,
  isSelected,
  isToday,
  now,
  onCreateEvent,
  onOpenEvent,
}: {
  day: Date;
  events: TeamEvent[];
  isSelected: boolean;
  isToday: boolean;
  now: Date;
  onCreateEvent: (date: Date) => void;
  onOpenEvent: (event: TeamEvent) => void;
}) {
  return (
    <div
      role="gridcell"
      aria-selected={isSelected}
      aria-label={new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "numeric",
      }).format(day)}
      onClick={() => onCreateEvent(day)}
      className={cn(
        "flex min-h-[360px] sm:min-h-[480px] cursor-pointer flex-col gap-2 border-r border-border p-1.5 sm:p-2.5 transition-colors last:border-r-0",
        "hover:bg-muted/25 focus-within:bg-muted/15",
        isToday && "bg-accent/20",
        isSelected && !isToday && "bg-accent/35",
      )}
    >
      {events.map((event) => (
        <WeekEventCard key={event.id} event={event} now={now} onOpenEvent={onOpenEvent} />
      ))}
    </div>
  );
}

function WeekEventCard({
  event,
  now,
  onOpenEvent,
}: {
  event: TeamEvent;
  now: Date;
  onOpenEvent: (event: TeamEvent) => void;
}) {
  const style = getEventTypeStyle(event.type);
  const Icon = style.icon;
  const cancelled = event.status === "cancelled";
  const completed = displayEventStatus(event, now) === "completed";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenEvent(event);
      }}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2 sm:p-2.5 text-left transition-all shadow-xs",
        "hover:border-primary/40 hover:bg-card hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        cancelled && "opacity-60",
        !cancelled && completed && "opacity-75",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={cn("size-2 shrink-0 rounded-full", style.swatch)}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {formatEventTime(event.scheduledAt)}
        </span>
      </span>
      <span
        className={cn(
          "text-xs sm:text-sm font-medium leading-tight text-foreground line-clamp-2",
          cancelled && "line-through",
        )}
      >
        {event.title}
      </span>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{eventTypeLabel(event.type)}</span>
      </span>
      {event.location && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{event.location}</span>
        </span>
      )}
    </button>
  );
}

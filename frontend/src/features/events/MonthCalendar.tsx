import { useMemo, useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatEventTime,
  formatFullDayLabel,
  formatMonthYear,
  getDayEvents,
  getMonthGrid,
  getWeekdayLabels,
  isOutsideMonth,
  isSameCalendarDay,
  splitDayEvents,
} from "./calendar-utils";
import { EventPill } from "./EventPill";
import { displayEventStatus, eventTypeLabel } from "./event-utils";
import { getEventTypeStyle } from "./event-style";
import type { TeamEvent } from "./types";

interface MonthCalendarProps {
  /** Any date inside the month being displayed. */
  month: Date;
  eventsByDay: Map<string, TeamEvent[]>;
  selectedDate: Date;
  now: Date;
  onSelectDate: (date: Date) => void;
  /** Clicking the empty area of a day opens the create dialog for that date. */
  onCreateEvent: (date: Date) => void;
  onOpenEvent: (event: TeamEvent) => void;
}

const weekdayLabels = getWeekdayLabels();

/**
 * Month view: a Monday–Sunday grid of day cells with compact event pills.
 * The grid is generated from the displayed month, so month lengths, leap
 * years, and varying first weekdays are all handled by the date utilities.
 */
export function MonthCalendar({
  month,
  eventsByDay,
  selectedDate,
  now,
  onSelectDate,
  onCreateEvent,
  onOpenEvent,
}: MonthCalendarProps) {
  const grid = useMemo(() => getMonthGrid(month), [month]);
  const weeks = useMemo(
    () =>
      Array.from({ length: 6 }, (_, weekIndex) =>
        grid.slice(weekIndex * 7, weekIndex * 7 + 7),
      ),
    [grid],
  );
  const monthEventCount = useMemo(
    () =>
      grid.reduce(
        (total, day) =>
          isOutsideMonth(day, month) ? total : total + getDayEvents(eventsByDay, day).length,
        0,
      ),
    [grid, month, eventsByDay],
  );

  return (
    <div
      role="grid"
      aria-label={`${formatMonthYear(month)} calendar`}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      {/* Weekday header */}
      <div role="row" className="grid grid-cols-7 border-b border-border bg-muted/30">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.slice(0, 1)}</span>
          </div>
        ))}
      </div>

      {/* Day cells */}
      {weeks.map((week) => (
        <div
          key={week[0]?.toISOString()}
          role="row"
          className="grid grid-cols-7 border-b border-border last:border-b-0"
        >
          {week.map((day) => (
            <DayCell
              key={day.toISOString()}
              day={day}
              month={month}
              events={getDayEvents(eventsByDay, day)}
              isSelected={isSameCalendarDay(day, selectedDate)}
              isToday={isSameCalendarDay(day, now)}
              now={now}
              onSelectDate={onSelectDate}
              onCreateEvent={onCreateEvent}
              onOpenEvent={onOpenEvent}
            />
          ))}
        </div>
      ))}

      {monthEventCount === 0 && (
        <div
          className="pointer-events-none px-6 py-10 text-center text-sm text-muted-foreground"
          aria-hidden="true"
        >
          <CalendarDays className="mx-auto size-6 opacity-60" />
          <p className="mt-2">No events this month — click a day to add one.</p>
        </div>
      )}
    </div>
  );
}

function DayCell({
  day,
  month,
  events,
  isSelected,
  isToday,
  now,
  onSelectDate,
  onCreateEvent,
  onOpenEvent,
}: {
  day: Date;
  month: Date;
  events: TeamEvent[];
  isSelected: boolean;
  isToday: boolean;
  now: Date;
  onSelectDate: (date: Date) => void;
  onCreateEvent: (date: Date) => void;
  onOpenEvent: (event: TeamEvent) => void;
}) {
  const outside = isOutsideMonth(day, month);
  const { visible, hiddenCount } = splitDayEvents(events);
  const dayLabel = formatFullDayLabel(day);

  return (
    <div
      role="gridcell"
      aria-selected={isSelected}
      aria-label={`${dayLabel}${events.length > 0 ? `, ${events.length} event${events.length === 1 ? "" : "s"}` : ""}`}
      onClick={() => onCreateEvent(day)}
      className={cn(
        "flex min-h-[72px] sm:min-h-[86px] lg:min-h-[94px] cursor-pointer flex-col gap-1 border-r border-border p-1 sm:p-1.5 transition-colors last:border-r-0",
        "hover:bg-muted/30 focus-within:bg-muted/20",
        outside && "bg-muted/25",
        isSelected && !outside && "bg-accent/40",
      )}
    >
      {/* Day number — top-right, selects the date */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectDate(day);
          }}
          aria-label={`Select ${dayLabel}`}
          aria-current={isToday ? "date" : undefined}
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            isToday
              ? "bg-primary text-primary-foreground"
              : outside
                ? "text-muted-foreground hover:bg-muted"
                : "text-foreground hover:bg-muted",
            isSelected && !isToday && "ring-1 ring-primary/50",
          )}
        >
          {format(day, "d")}
        </button>
      </div>

      {/* Event pills */}
      {visible.map((event) => (
        <EventPill key={event.id} event={event} now={now} onSelect={onOpenEvent} />
      ))}

      {/* Overflow */}
      {hiddenCount > 0 && (
        <MoreEventsPopover
          day={day}
          events={events}
          hiddenCount={hiddenCount}
          now={now}
          onOpenEvent={onOpenEvent}
        />
      )}
    </div>
  );
}

function MoreEventsPopover({
  day,
  events,
  hiddenCount,
  now,
  onOpenEvent,
}: {
  day: Date;
  events: TeamEvent[];
  hiddenCount: number;
  now: Date;
  onOpenEvent: (event: TeamEvent) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-fit rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground",
          "transition-colors hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
        +{hiddenCount} more
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-2"
        aria-label={`Events on ${formatFullDayLabel(day)}`}
      >
        <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {formatFullDayLabel(day)}
        </p>
        <ul className="flex flex-col">
          {events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenEvent(event);
                }}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                  "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  event.status === "cancelled" && "opacity-60",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      getEventTypeStyle(event.type).swatch,
                    )}
                    aria-hidden="true"
                  />
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatEventTime(event.scheduledAt)}
                  </span>
                  <span
                    className={cn(
                      "truncate",
                      event.status === "cancelled" && "line-through",
                    )}
                  >
                    {event.title}
                  </span>
                </span>
                <span className="flex items-center gap-2 pl-3.5 text-[11px] text-muted-foreground">
                  {eventTypeLabel(event.type)}
                  {event.location && (
                    <>
                      <MapPin className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{event.location}</span>
                    </>
                  )}
                  {displayEventStatus(event, now) === "cancelled" && (
                    <span className="text-destructive">Cancelled</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

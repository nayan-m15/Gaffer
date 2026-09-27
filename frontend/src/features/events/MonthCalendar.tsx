import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
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
}: MonthCalendarProps) {
  const grid = useMemo(() => getMonthGrid(month), [month]);
  const weeks = useMemo(
    () =>
      Array.from({ length: grid.length / 7 }, (_, weekIndex) =>
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
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      {/* Weekday header */}
      <div role="row" className="grid grid-cols-7 border-b border-border bg-muted/30">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="px-1 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
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
          className="grid min-h-0 flex-1 grid-cols-7 border-b border-border last:border-b-0"
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
}: {
  day: Date;
  month: Date;
  events: TeamEvent[];
  isSelected: boolean;
  isToday: boolean;
  now: Date;
  onSelectDate: (date: Date) => void;
  onCreateEvent: (date: Date) => void;
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
        "flex min-h-0 min-w-0 cursor-pointer flex-col gap-0.5 overflow-hidden border-r border-border p-1 transition-colors last:border-r-0",
        "hover:bg-muted/30 focus-within:bg-muted/20",
        outside && "bg-muted/25",
        isSelected && !outside && "bg-accent/40",
      )}
    >
      {/* Day number — top-right, selects the date */}
      <div className="flex min-h-5 items-center justify-between">
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelectDate(day);
            }}
            className="rounded px-1 text-left text-[11px] font-medium leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`${hiddenCount} more event${hiddenCount === 1 ? "" : "s"} on ${dayLabel}`}
          >
            +{hiddenCount}
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectDate(day);
          }}
          aria-label={`Select ${dayLabel}`}
          aria-current={isToday ? "date" : undefined}
          className={cn(
            "flex size-5 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
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
        <EventPill key={event.id} event={event} now={now} onSelect={() => onSelectDate(day)} />
      ))}

    </div>
  );
}

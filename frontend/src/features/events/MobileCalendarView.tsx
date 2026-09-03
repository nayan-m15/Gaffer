import { useMemo } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  MapPin,
  Plus,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatEventTime,
  formatMonthYear,
  formatWeekRangeLabel,
  getDayEvents,
  getMonthGrid,
  getWeekDays,
  getWeekdayLabels,
  isOutsideMonth,
  isSameCalendarDay,
  toDayKey,
  type CalendarView,
} from "./calendar-utils";
import { displayEventStatus, eventTypeLabel } from "./event-utils";
import { getEventTypeStyle } from "./event-style";
import type { TeamEvent } from "./types";

interface MobileCalendarViewProps {
  view: CalendarView;
  cursor: Date;
  selectedDate: Date;
  now: Date;
  eventsByDay: Map<string, TeamEvent[]>;
  visibleEvents: TeamEvent[];
  onViewChange: (view: CalendarView) => void;
  onSelectDate: (date: Date) => void;
  onNavigate: (direction: 1 | -1) => void;
  onToday: () => void;
  onCreateEvent: (date?: Date) => void;
  onOpenEvent: (event: TeamEvent) => void;
  onToggleSidebar: () => void;
}

const weekdayLabels = getWeekdayLabels();

/**
 * Mobile-first smartphone calendar view inspired by Samsung One UI and Apple iOS Calendar.
 * Features a compact header, month/week grid with colored event dots, a sleek selected-day
 * schedule list below the grid, and a bottom-right floating action button (FAB).
 */
export function MobileCalendarView({
  view,
  cursor,
  selectedDate,
  now,
  eventsByDay,
  visibleEvents,
  onViewChange,
  onSelectDate,
  onNavigate,
  onToday,
  onCreateEvent,
  onOpenEvent,
  onToggleSidebar,
}: MobileCalendarViewProps) {
  const grid = useMemo(() => getMonthGrid(cursor), [cursor]);
  const weekDays = useMemo(() => getWeekDays(cursor), [cursor]);

  const selectedDayEvents = useMemo(
    () => getDayEvents(eventsByDay, selectedDate),
    [eventsByDay, selectedDate],
  );

  const headerLabel =
    view === "week" ? formatWeekRangeLabel(weekDays) : formatMonthYear(cursor);

  return (
    <div className="flex flex-col gap-4 pb-20 sm:hidden">
      {/* ── 1. Smartphone Top Bar ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs">
        {/* Navigation & Period Title */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              onClick={onToday}
              className="rounded-full px-2.5 text-xs font-medium"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onNavigate(-1)}
              aria-label="Previous period"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onNavigate(1)}
              aria-label="Next period"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <h2 className="min-w-0 truncate text-base font-bold tracking-tight text-foreground">
            {headerLabel}
          </h2>

          <Button
            variant="outline"
            size="icon-xs"
            onClick={onToggleSidebar}
            aria-label="Open calendars filter drawer"
            className="rounded-full"
          >
            <Filter className="size-3.5" />
          </Button>
        </div>

        {/* View Switcher Chips (Samsung One UI / iOS segmented control style) */}
        <div className="grid grid-cols-3 rounded-xl bg-muted/60 p-1 text-center">
          {(["month", "week", "agenda"] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => onViewChange(v)}
                aria-pressed={active}
                className={cn(
                  "rounded-lg py-1 text-xs font-semibold capitalize transition-all",
                  active
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Calendar Surfaces ────────────────────────────────────────── */}
      {view === "month" && (
        <MobileMonthGrid
          grid={grid}
          cursor={cursor}
          selectedDate={selectedDate}
          now={now}
          eventsByDay={eventsByDay}
          onSelectDate={onSelectDate}
        />
      )}

      {view === "week" && (
        <MobileWeekStrip
          weekDays={weekDays}
          selectedDate={selectedDate}
          now={now}
          eventsByDay={eventsByDay}
          onSelectDate={onSelectDate}
        />
      )}

      {/* ── 3. Agenda / Selected Day Details (Samsung / Apple Style) ───── */}
      {view === "agenda" ? (
        <MobileAgendaList
          events={visibleEvents}
          now={now}
          onOpenEvent={onOpenEvent}
          onCreateEvent={() => onCreateEvent()}
        />
      ) : (
        <MobileDayDetailSection
          selectedDate={selectedDate}
          events={selectedDayEvents}
          now={now}
          onOpenEvent={onOpenEvent}
          onCreateEvent={() => onCreateEvent(selectedDate)}
        />
      )}

      {/* ── 4. Samsung/Apple Floating Action Button (FAB) ──────────────── */}
      <button
        type="button"
        onClick={() => onCreateEvent(selectedDate)}
        aria-label="Add new event"
        className={cn(
          "fixed bottom-6 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Plus className="size-6" />
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Mobile Month Calendar Grid (with iOS/Samsung colored event dots)
 * ══════════════════════════════════════════════════════════════════════════ */

function MobileMonthGrid({
  grid,
  cursor,
  selectedDate,
  now,
  eventsByDay,
  onSelectDate,
}: {
  grid: Date[];
  cursor: Date;
  selectedDate: Date;
  now: Date;
  eventsByDay: Map<string, TeamEvent[]>;
  onSelectDate: (date: Date) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-xs">
      {/* Weekday Row Header */}
      <div className="grid grid-cols-7 mb-1 text-center">
        {weekdayLabels.map((label) => (
          <span
            key={label}
            className="py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            {label.slice(0, 1)}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {grid.map((day) => {
          const isToday = isSameCalendarDay(day, now);
          const isSelected = isSameCalendarDay(day, selectedDate);
          const outside = isOutsideMonth(day, cursor);
          const dayEvents = getDayEvents(eventsByDay, day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDate(day)}
              className={cn(
                "group relative flex flex-col items-center justify-start rounded-xl py-1.5 transition-all",
                outside && "opacity-35",
                isSelected && !isToday && "bg-accent/60 font-bold ring-1 ring-primary/40",
                isToday && !isSelected && "font-bold",
              )}
            >
              {/* Date Circle/Pill */}
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                  isToday
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : isSelected
                      ? "bg-primary/20 text-primary font-bold"
                      : outside
                        ? "text-muted-foreground"
                        : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>

              {/* Mobile Event Pills / Titles */}
              <div className="mt-1 flex w-full flex-col gap-0.5 px-0.5 overflow-hidden">
                {dayEvents.slice(0, 2).map((evt) => {
                  const style = getEventTypeStyle(evt.type);
                  return (
                    <span
                      key={evt.id}
                      title={evt.title}
                      className={cn(
                        "block w-full truncate rounded px-1 py-0.5 text-[9px] font-semibold leading-tight text-left",
                        style.pill,
                      )}
                    >
                      {evt.title}
                    </span>
                  );
                })}
                {dayEvents.length > 2 && (
                  <span className="text-[9px] font-bold text-muted-foreground text-center leading-none">
                    +{dayEvents.length - 2} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Mobile Week Day Strip
 * ══════════════════════════════════════════════════════════════════════════ */

function MobileWeekStrip({
  weekDays,
  selectedDate,
  now,
  eventsByDay,
  onSelectDate,
}: {
  weekDays: Date[];
  selectedDate: Date;
  now: Date;
  eventsByDay: Map<string, TeamEvent[]>;
  onSelectDate: (date: Date) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1 rounded-2xl border border-border bg-card p-2 shadow-xs">
      {weekDays.map((day, idx) => {
        const isToday = isSameCalendarDay(day, now);
        const isSelected = isSameCalendarDay(day, selectedDate);
        const dayEvents = getDayEvents(eventsByDay, day);

        return (
          <button
            key={day.toISOString()}
            type="button"
            onClick={() => onSelectDate(day)}
            className={cn(
              "flex flex-col items-center rounded-xl py-2 transition-all",
              isSelected ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-muted/40",
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {weekdayLabels[idx].slice(0, 3)}
            </span>
            <span
              className={cn(
                "mt-1 flex size-8 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                isToday
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : isSelected
                    ? "bg-primary/20 text-primary font-bold"
                    : "text-foreground",
              )}
            >
              {format(day, "d")}
            </span>

            {/* Event Dots */}
            <div className="mt-1 flex h-1.5 items-center justify-center gap-0.5">
              {dayEvents.slice(0, 3).map((evt) => {
                const style = getEventTypeStyle(evt.type);
                return (
                  <span
                    key={evt.id}
                    className={cn("size-1.5 rounded-full", style.swatch)}
                  />
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Mobile Selected Day Schedule Card List (Samsung / Apple Style)
 * ══════════════════════════════════════════════════════════════════════════ */

function MobileDayDetailSection({
  selectedDate,
  events,
  now,
  onOpenEvent,
  onCreateEvent,
}: {
  selectedDate: Date;
  events: TeamEvent[];
  now: Date;
  onOpenEvent: (event: TeamEvent) => void;
  onCreateEvent: () => void;
}) {
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(selectedDate);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Day Schedule Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {formattedDate}
        </h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center shadow-xs">
          <CalendarDays className="size-8 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-semibold text-foreground">No events scheduled</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tap below to create an event for this date.
          </p>
          <Button size="sm" variant="outline" className="mt-3.5 gap-1.5" onClick={onCreateEvent}>
            <Plus className="size-3.5" />
            Add Event
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((evt) => (
            <MobileEventCard
              key={evt.id}
              event={evt}
              now={now}
              onOpenEvent={onOpenEvent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileEventCard({
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
      onClick={() => onOpenEvent(event)}
      className={cn(
        "flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 text-left shadow-xs transition-all active:scale-[0.99]",
        cancelled && "opacity-60",
        !cancelled && completed && "opacity-80",
      )}
    >
      {/* Left Color Indicator Stripe (Apple/Samsung style) */}
      <span className={cn("w-1.5 shrink-0 rounded-full", style.swatch)} aria-hidden="true" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm font-bold text-foreground",
              cancelled && "line-through",
            )}
          >
            {event.title}
          </span>
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
            {formatEventTime(event.scheduledAt)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-medium">
            <Icon className="size-3.5 shrink-0 text-foreground/70" />
            {eventTypeLabel(event.type)}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="size-3.5 shrink-0 text-foreground/70" />
              <span className="truncate max-w-[120px]">{event.location}</span>
            </span>
          )}
          {cancelled && <span className="font-semibold text-destructive">Cancelled</span>}
        </div>
      </div>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Mobile Full Agenda List View
 * ══════════════════════════════════════════════════════════════════════════ */

function MobileAgendaList({
  events,
  now,
  onOpenEvent,
  onCreateEvent,
}: {
  events: TeamEvent[];
  now: Date;
  onOpenEvent: (event: TeamEvent) => void;
  onCreateEvent: () => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, TeamEvent[]>();
    for (const evt of events) {
      const key = toDayKey(new Date(evt.scheduledAt));
      const list = map.get(key);
      if (list) {
        list.push(evt);
      } else {
        map.set(key, [evt]);
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-xs">
        <CalendarDays className="size-8 text-muted-foreground/60" />
        <p className="mt-2 text-sm font-semibold text-foreground">No events found</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Create an event to fill the agenda schedule.
        </p>
        <Button size="sm" className="mt-4 gap-1.5" onClick={onCreateEvent}>
          <Plus className="size-3.5" />
          New Event
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([dayKey, dayEvents]) => {
        const [y, m, d] = dayKey.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return (
          <MobileDayDetailSection
            key={dayKey}
            selectedDate={date}
            events={dayEvents}
            now={now}
            onOpenEvent={onOpenEvent}
            onCreateEvent={onCreateEvent}
          />
        );
      })}
    </div>
  );
}

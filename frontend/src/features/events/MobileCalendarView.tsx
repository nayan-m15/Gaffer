import { useMemo } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  PanelRight,
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
import { displayEventStatus, eventTypeLabel, EVENT_TYPE_OPTIONS } from "./event-utils";
import { getEventTypeStyle } from "./event-style";
import type { EventType, TeamEvent } from "./types";

interface MobileCalendarViewProps {
  view: CalendarView;
  cursor: Date;
  selectedDate: Date;
  now: Date;
  eventsByDay: Map<string, TeamEvent[]>;
  visibleEvents: TeamEvent[];
  hiddenTypes: ReadonlySet<EventType>;
  readOnly?: boolean;
  onToggleType: (type: EventType) => void;
  onViewChange: (view: CalendarView) => void;
  onSelectDate: (date: Date) => void;
  onNavigate: (direction: 1 | -1) => void;
  onToday: () => void;
  onCreateEvent: (date?: Date) => void;
  onOpenEvent: (event: TeamEvent) => void;
  onToggleSidebar?: () => void;
}

const weekdayLabels = getWeekdayLabels();

/**
 * Mobile-first smartphone calendar view inspired by Samsung Calendar & Apple iOS Calendar.
 * Features a clean header with direct event-type filters, full-width month grid with multi-line readable text
 * in event blocks.
 */
export function MobileCalendarView({
  view,
  cursor,
  selectedDate,
  now,
  eventsByDay,
  visibleEvents,
  hiddenTypes,
  readOnly = false,
  onToggleType,
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
    <div className="flex flex-col gap-3 pb-3 sm:hidden">
      {/* ── 1. Smartphone Top Navigation & Filter Bar ────────────────────── */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-xs">
        {/* Navigation & Period Title */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onNavigate(-1)}
              aria-label="Previous period"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <h2 className="text-base font-bold tracking-tight text-foreground uppercase">
              {headerLabel}
            </h2>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onNavigate(1)}
              aria-label="Next period"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="xs"
              onClick={onToday}
              className="rounded-full px-2.5 text-xs font-semibold"
            >
              Today
            </Button>

            {/* Sidebar drawer button for Other Calendars, Undated, and Calendar Feed */}
            {onToggleSidebar && (
              <Button
                variant="outline"
                size="icon-xs"
                onClick={onToggleSidebar}
                aria-label="Open calendar options and feeds"
                className="rounded-full"
              >
                <PanelRight className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Event Type Filter Chips (Training, Match, Meeting) directly accessible on mobile */}
        <div
          role="group"
          aria-label="Filter events by type"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
        >
          {EVENT_TYPE_OPTIONS.map((option) => {
            const isVisible = !hiddenTypes.has(option.value);
            const style = getEventTypeStyle(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="checkbox"
                aria-checked={isVisible}
                aria-label={`Toggle ${option.label} events`}
                onClick={() => onToggleType(option.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all duration-150 cursor-pointer shadow-2xs select-none",
                  isVisible
                    ? "border-border bg-background text-foreground"
                    : "border-border/40 bg-muted/40 text-muted-foreground opacity-50 line-through",
                )}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full transition-opacity",
                    style.swatch,
                    !isVisible && "opacity-40",
                  )}
                  aria-hidden="true"
                />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

        {/* View Switcher Tabs (Month / Week / Agenda) */}
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
                    ? "bg-background text-foreground shadow-xs font-bold"
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
          onOpenEvent={onOpenEvent}
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

      {/* ── 3. Agenda / Week Details ──────────────────────────────────── */}
      {view === "agenda" && (
        <MobileAgendaList
          events={visibleEvents}
          now={now}
          onOpenEvent={onOpenEvent}
          onCreateEvent={() => onCreateEvent()}
          readOnly={readOnly}
        />
      )}
      {view === "week" && (
        <MobileDayDetailSection
          selectedDate={selectedDate}
          events={selectedDayEvents}
          now={now}
          onOpenEvent={onOpenEvent}
          onCreateEvent={() => onCreateEvent(selectedDate)}
          readOnly={readOnly}
        />
      )}

      {/* ── 4. Floating Action Button (FAB) ────────────────────────────── */}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onCreateEvent(selectedDate)}
          aria-label="Add new event"
          className={cn(
            "fixed bottom-6 right-5 z-40 flex size-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Plus className="size-6" />
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Mobile Month Calendar Grid (Samsung Calendar style)
 * ══════════════════════════════════════════════════════════════════════════ */

function MobileMonthGrid({
  grid,
  cursor,
  selectedDate,
  now,
  eventsByDay,
  onSelectDate,
  onOpenEvent,
}: {
  grid: Date[];
  cursor: Date;
  selectedDate: Date;
  now: Date;
  eventsByDay: Map<string, TeamEvent[]>;
  onSelectDate: (date: Date) => void;
  onOpenEvent: (event: TeamEvent) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      {/* Weekday Row Header (M T W T F S S) */}
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/20 text-center py-1.5">
        {weekdayLabels.map((label, idx) => (
          <span
            key={label}
            className={cn(
              "text-[11px] font-bold uppercase tracking-wider",
              idx === 6 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {label.slice(0, 1)}
          </span>
        ))}
      </div>

      {/* Days Grid - Samsung full screen grid style */}
      <div className="grid grid-cols-7">
        {grid.map((day, dayIndex) => {
          const isToday = isSameCalendarDay(day, now);
          const isSelected = isSameCalendarDay(day, selectedDate);
          const outside = isOutsideMonth(day, cursor);
          const dayEvents = getDayEvents(eventsByDay, day);
          const isSunday = (dayIndex + 1) % 7 === 0;

          return (
            <div
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={cn(
                "group relative flex min-h-[64px] flex-col items-stretch justify-start p-1 transition-all border-b border-r border-border/40 text-left cursor-pointer",
                outside && "bg-muted/15 opacity-40",
                isSelected && !outside && "bg-accent/40",
                "hover:bg-muted/30",
              )}
            >
              {/* Date Number / Today Badge */}
              <div className="flex justify-center pb-0.5">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md text-xs font-bold tabular-nums transition-colors",
                    isToday
                      ? "bg-primary text-primary-foreground shadow-xs ring-1 ring-primary font-bold"
                      : isSelected
                        ? "bg-primary/20 text-primary font-bold ring-1 ring-primary/40"
                        : outside
                          ? "text-muted-foreground font-normal"
                          : isSunday
                            ? "text-destructive font-semibold"
                            : "text-foreground font-semibold",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              {/* Samsung-style Event blocks with multi-line readable text */}
              <div className="flex w-full flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, 2).map((evt) => {
                  const style = getEventTypeStyle(evt.type);
                  const isCancelled = evt.status === "cancelled";
                  return (
                    <button
                      key={evt.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEvent(evt);
                      }}
                      title={evt.title}
                      className={cn(
                        "block w-full rounded px-1 py-0.5 text-[9px] font-medium leading-[1.15] text-left break-words whitespace-normal line-clamp-2 transition-transform active:scale-95 shadow-2xs",
                        style.pill,
                        isCancelled && "line-through opacity-60",
                      )}
                    >
                      {evt.title}
                    </button>
                  );
                })}
                {dayEvents.length > 2 && (
                  <span className="text-[8.5px] font-bold text-muted-foreground text-center leading-none pt-0.5">
                    +{dayEvents.length - 2} more
                  </span>
                )}
              </div>
            </div>
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
 * Mobile Selected Day Schedule Card List (used in Week view)
 * ══════════════════════════════════════════════════════════════════════════ */

function MobileDayDetailSection({
  selectedDate,
  events,
  now,
  onOpenEvent,
  onCreateEvent,
  readOnly = false,
}: {
  selectedDate: Date;
  events: TeamEvent[];
  now: Date;
  onOpenEvent: (event: TeamEvent) => void;
  onCreateEvent: () => void;
  readOnly?: boolean;   
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
            {readOnly ? "Nothing scheduled for this date." : "Tap below to create an event for this date."}
          </p>
          {!readOnly && (
            <Button size="sm" variant="outline" className="mt-3.5 gap-1.5" onClick={onCreateEvent}>
              <Plus className="size-3.5" />
              Add Event
            </Button>
          )}
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
      {/* Left Color Indicator Stripe */}
      <span className={cn("w-1.5 shrink-0 rounded-full", style.swatch)} aria-hidden="true" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm font-bold text-foreground break-words line-clamp-2",
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
  readOnly = false,
}: {
  events: TeamEvent[];
  now: Date;
  onOpenEvent: (event: TeamEvent) => void;
  onCreateEvent: () => void;
  readOnly?: boolean;
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
          {readOnly ? "Your team has no events yet." : "Create an event to fill the agenda schedule."}
        </p>
        {!readOnly && (
          <Button size="sm" className="mt-4 gap-1.5" onClick={onCreateEvent}>
            <Plus className="size-3.5" />
            New Event
          </Button>
        )}
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
            readOnly={readOnly}
          />
        );
      })}
    </div>
  );
}

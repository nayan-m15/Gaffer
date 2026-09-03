import { useMemo } from "react";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEventTime, getMonthEvents, toDayKey } from "./calendar-utils";
import { displayEventStatus, eventTypeLabel } from "./event-utils";
import { getEventTypeStyle } from "./event-style";
import type { TeamEvent } from "./types";

interface AgendaViewProps {
  /** Any date inside the month being displayed. */
  month: Date;
  /** Visible (type-filtered) events. */
  events: TeamEvent[];
  now: Date;
  onOpenEvent: (event: TeamEvent) => void;
  onCreateEvent: () => void;
}

/**
 * Agenda view: the displayed month's events as a chronological list
 * grouped by day.
 */
export function AgendaView({
  month,
  events,
  now,
  onOpenEvent,
  onCreateEvent,
}: AgendaViewProps) {
  const groups = useMemo(() => {
    const monthEvents = getMonthEvents(events, month);
    const byDay = new Map<string, TeamEvent[]>();
    for (const event of monthEvents) {
      const key = toDayKey(new Date(event.scheduledAt));
      const list = byDay.get(key);
      if (list) {
        list.push(event);
      } else {
        byDay.set(key, [event]);
      }
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events, month]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <CalendarDays className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          No events this month
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a training session, match, or meeting to fill the calendar.
        </p>
        <Button
          className="mt-6 font-semibold tracking-wide"
          onClick={onCreateEvent}
        >
          <Plus className="size-4" />
          New Event
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {groups.map(([dayKey, dayEvents], index) => (
        <AgendaDayGroup
          key={dayKey}
          dayKey={dayKey}
          events={dayEvents}
          now={now}
          separated={index > 0}
          onOpenEvent={onOpenEvent}
        />
      ))}
    </div>
  );
}

function AgendaDayGroup({
  dayKey,
  events,
  now,
  separated,
  onOpenEvent,
}: {
  dayKey: string;
  events: TeamEvent[];
  now: Date;
  separated: boolean;
  onOpenEvent: (event: TeamEvent) => void;
}) {
  const [year, monthIndex, dayNumber] = dayKey.split("-").map(Number);
  const date = new Date(year, monthIndex - 1, dayNumber);
  const isToday = date.toDateString() === now.toDateString();

  return (
    <section
      aria-label={new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date)}
      className={cn("flex gap-4 p-4 sm:gap-6 sm:p-5", separated && "border-t border-border")}
    >
      {/* Date column */}
      <div className="flex w-14 shrink-0 flex-col items-center sm:w-20">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)}
        </p>
        <p
          className={cn(
            "mt-0.5 flex size-9 items-center justify-center rounded-full text-lg font-semibold tabular-nums",
            isToday
              ? "bg-primary text-primary-foreground"
              : "text-foreground",
          )}
        >
          {dayNumber}
        </p>
      </div>

      {/* Events */}
      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {events.map((event) => (
          <AgendaEventRow key={event.id} event={event} now={now} onOpenEvent={onOpenEvent} />
        ))}
      </ul>
    </section>
  );
}

function AgendaEventRow({
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
    <li>
      <button
        type="button"
        onClick={() => onOpenEvent(event)}
        className={cn(
          "flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors",
          "hover:border-primary/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          cancelled && "opacity-60",
          !cancelled && completed && "opacity-75",
        )}
      >
        <span
          className={cn("size-2.5 shrink-0 rounded-full", style.swatch)}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatEventTime(event.scheduledAt)}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium text-foreground",
            cancelled && "line-through",
          )}
        >
          {event.title}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          {eventTypeLabel(event.type)}
        </span>
        {event.location && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="max-w-[12rem] truncate">{event.location}</span>
          </span>
        )}
      </button>
    </li>
  );
}

import { useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { cn } from "@/lib/utils";
import { formatEventTime, formatMonthYear, getMonthEvents, toDayKey } from "./calendar-utils";
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
  readOnly?: boolean;
  /** Optional handler to navigate months. */
  onNavigateMonth?: (direction: 1 | -1) => void;
  className?: string;
}

/**
 * Agenda view: the displayed month's events as a chronological list
 * grouped by day. Designed to render cleanly in the sidebar and main views.
 */
export function AgendaView({
  month,
  events,
  now,
  onOpenEvent,
  onCreateEvent,
  readOnly = false,
  onNavigateMonth,
  className,
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

  return (
    <div className={cn("flex flex-col gap-2.5 h-full min-h-0 flex-1", className)}>
      {/* Optional Month Header Navigation */}
      {onNavigateMonth && (
        <div className="flex shrink-0 items-center justify-between gap-1">
          <p className="truncate text-sm font-semibold text-foreground" aria-live="polite">
            {formatMonthYear(month)} Agenda
          </p>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onNavigateMonth(-1)}
              aria-label="Previous month in agenda"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onNavigateMonth(1)}
              aria-label="Next month in agenda"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="flex-1 rounded-xl border border-dashed border-border bg-card p-5 text-center flex flex-col items-center justify-center">
          <CalendarDays className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-2 text-xs font-semibold text-foreground">
            No events this month
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a training session, match, or meeting to fill the calendar.
          </p>
          {!readOnly && (
            <Button
              size="sm"
              className="mt-4 gap-1.5 text-xs font-semibold tracking-wide"
              onClick={onCreateEvent}
            >
              <Plus className="size-3.5" />
              New Event
            </Button>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card pr-0.5 shadow-xs">
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
      )}
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
      className={cn("flex flex-col gap-2 p-3 sm:p-3.5", separated && "border-t border-border")}
    >
      {/* Day header */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
            isToday ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {dayNumber}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short" }).format(date)}
        </span>
      </div>

      {/* Events */}
      <ul className="flex flex-col gap-1.5">
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
      <ExpandableCard
        buttonLabel={`${event.title}, ${formatEventTime(event.scheduledAt)}. Show event summary`}
        className={cn(
          "bg-background",
          cancelled && "opacity-60",
          !cancelled && completed && "opacity-75",
        )}
        summary={
          <div className="flex items-center gap-2.5">
            <span className={cn("size-2 shrink-0 rounded-full", style.swatch)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className={cn("truncate text-xs font-semibold text-foreground", cancelled && "line-through")}>
                  {event.title}
                </span>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {formatEventTime(event.scheduledAt)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Icon className="size-3 shrink-0" aria-hidden="true" />
                  {eventTypeLabel(event.type)}
                </span>
                {event.location && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    <span className="max-w-[100px] truncate">{event.location}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        }
      >
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>{event.notes?.trim() || "No additional notes for this event."}</p>
          <Button size="sm" variant="outline" onClick={() => onOpenEvent(event)}>
            View full details
          </Button>
        </div>
      </ExpandableCard>
    </li>
  );
}

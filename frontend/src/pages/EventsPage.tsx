import { useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventDetailDialog, StatusBadge } from "@/features/events/EventDetailDialog";
import { EventFormDialog } from "@/features/events/EventFormDialog";
import {
  displayEventStatus,
  eventTypeLabel,
  formatEventDateTime,
} from "@/features/events/event-utils";
import { useEvents, useNow } from "@/features/events/hooks";
import type { TeamEvent } from "@/features/events/types";
import { cn } from "@/lib/utils";

type Panel =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "view"; eventId: string }
  | { kind: "edit"; eventId: string };

/**
 * Events list for the signed-in coach's team.
 *
 * Fetches GET /events (soonest first), opens a create/edit dialog, and a
 * detail dialog with a soft-cancel action.
 */
export default function EventsPage() {
  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const now = useNow();
  const [panel, setPanel] = useState<Panel>({ kind: "closed" });

  const selectedEvent =
    panel.kind === "view" || panel.kind === "edit"
      ? (events?.find((event) => event.id === panel.eventId) ?? null)
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Schedule
          </p>
          <h1 className="mt-1 text-3xl font-semibold uppercase tracking-wide text-foreground">
            Events
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upcoming matches, training sessions, and meetings.
          </p>
        </div>
        <Button
          size="lg"
          className="font-semibold tracking-wide"
          onClick={() => setPanel({ kind: "create" })}
        >
          + New Event
        </Button>
      </header>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading events…</p>
      )}

      {isError && (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Could not load events."}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      {!isLoading && !isError && events && events.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No events yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a training, match, or meeting to start the calendar.
          </p>
          <Button
            className="mt-6 font-semibold tracking-wide"
            onClick={() => setPanel({ kind: "create" })}
          >
            + New Event
          </Button>
        </div>
      )}

      {!isLoading && !isError && events && events.length > 0 && (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventRow
                event={event}
                now={now}
                onSelect={() =>
                  setPanel({ kind: "view", eventId: event.id })
                }
              />
            </li>
          ))}
        </ul>
      )}

      <EventFormDialog
        open={panel.kind === "create" || panel.kind === "edit"}
        event={panel.kind === "edit" ? (selectedEvent ?? undefined) : undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPanel({ kind: "closed" });
          }
        }}
      />

      <EventDetailDialog
        open={panel.kind === "view"}
        event={selectedEvent}
        now={now}
        onOpenChange={(open) => {
          if (!open) {
            setPanel({ kind: "closed" });
          }
        }}
        onEdit={(event) => setPanel({ kind: "edit", eventId: event.id })}
      />
    </div>
  );
}

function EventRow({
  event,
  now,
  onSelect,
}: {
  event: TeamEvent;
  now: Date;
  onSelect: () => void;
}) {
  const cancelled = event.status === "cancelled";
  const shownStatus = displayEventStatus(event, now);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border border-border bg-card p-4 text-left transition-colors",
        "hover:border-primary/40 hover:bg-card/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        cancelled && "opacity-55",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className={cn(
              "truncate text-base font-semibold text-foreground",
              cancelled && "line-through",
            )}
          >
            {event.title}
          </h2>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eventTypeLabel(event.type)}
          </p>
        </div>
        <StatusBadge status={shownStatus} />
      </div>

      <div className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-4">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" />
          {formatEventDateTime(event.scheduledAt)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          {event.location}
        </span>
      </div>
    </button>
  );
}

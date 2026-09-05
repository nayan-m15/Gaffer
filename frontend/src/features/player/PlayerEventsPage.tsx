import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Loader2,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fetchPlayerEvents } from "@/services/player";
import type { PlayerEvent } from "@/services/player";
import {
  displayEventStatus,
  eventTypeLabel,
  formatEventDateTime,
} from "@/features/events/event-utils";
import { RsvpWidget } from "./RsvpWidget";
import type { RsvpStatus } from "@/services/rsvps";

/* ═══════════════════════════════════════════════════════════════════════════
 *  EVENT TYPE STYLING
 * ═══════════════════════════════════════════════════════════════════════════ */

const EVENT_TYPE_STYLES: Record<
  PlayerEvent["type"],
  { bg: string; text: string }
> = {
  match: { bg: "bg-primary/10", text: "text-primary" },
  training: { bg: "bg-muted", text: "text-foreground" },
  meeting: { bg: "bg-muted-foreground/10", text: "text-muted-foreground" },
};

/* ═══════════════════════════════════════════════════════════════════════════
 *  RSVP STATUS PILL (for display in event card header)
 * ═══════════════════════════════════════════════════════════════════════════ */

const RSVP_LABELS: Record<RsvpStatus, { label: string; className: string }> = {
  going: {
    label: "Going",
    className: "bg-emerald-500/20 text-emerald-400",
  },
  maybe: {
    label: "Maybe",
    className: "bg-amber-500/20 text-amber-400",
  },
  not_going: {
    label: "Can't go",
    className: "bg-red-500/20 text-red-400",
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

const playerEventsQueryKey = ["player", "events"] as const;

export default function PlayerEventsPage() {
  const { claimedAthletes } = useAuth();
  const now = new Date();

  const eventsQuery = useQuery({
    queryKey: playerEventsQueryKey,
    queryFn: () => fetchPlayerEvents(claimedAthletes[0]?.id),
    enabled: claimedAthletes.length > 0,
  });

  const events = eventsQuery.data ?? [];

  // Split into upcoming vs past
  const upcoming = events.filter(
    (e) => e.status === "scheduled" && new Date(e.scheduledAt) > now,
  );
  const past = events.filter(
    (e) => e.status !== "scheduled" || new Date(e.scheduledAt) <= now,
  );

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Team events and your RSVP responses."
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* Loading */}
        {eventsQuery.isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading events…
          </div>
        )}

        {/* Error */}
        {eventsQuery.isError && (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-destructive">
              {eventsQuery.error instanceof ApiError
                ? eventsQuery.error.message
                : "Could not load events."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void eventsQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        )}

        {eventsQuery.data && (
          <>
            {/* Upcoming events */}
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Upcoming
              </h2>
              {upcoming.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
                  <Calendar className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">
                    No upcoming events
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your coach hasn't scheduled any events yet.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      now={now}
                      queryKey={playerEventsQueryKey}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Past events */}
            {past.length > 0 && (
              <section>
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Past Events
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {past.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      now={now}
                      queryKey={playerEventsQueryKey}
                      isPast
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  EVENT CARD
 * ═══════════════════════════════════════════════════════════════════════════ */

function EventCard({
  event,
  now,
  queryKey,
  isPast = false,
}: {
  event: PlayerEvent;
  now: Date;
  queryKey: readonly string[];
  isPast?: boolean;
}) {
  const typeStyle = EVENT_TYPE_STYLES[event.type];
  const rsvpInfo = event.rsvpStatus ? RSVP_LABELS[event.rsvpStatus] : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm transition-opacity",
        isPast && "opacity-70",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">{event.title}</h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              typeStyle.bg,
              typeStyle.text,
            )}
          >
            {eventTypeLabel(event.type)}
          </span>
          <StatusPill status={displayEventStatus(event, now)} />
        </div>
      </div>

      {/* Details */}
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>{formatEventDateTime(event.scheduledAt)}</p>
        <p className="flex items-center gap-1">
          <MapPin className="size-3" aria-hidden="true" />
          {event.location}
        </p>
        {event.notes && <p className="italic">"{event.notes}"</p>}
      </div>

      {/* Current RSVP pill */}
      {rsvpInfo && (
        <div className="mt-2">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
              rsvpInfo.className,
            )}
          >
            {rsvpInfo.label}
          </span>
        </div>
      )}

      {/* RSVP widget (only for upcoming scheduled events) */}
      {!isPast && event.status === "scheduled" && (
        <RsvpWidget
          eventId={event.id}
          currentStatus={event.rsvpStatus}
          currentNote={event.rsvpNote}
          queryKey={queryKey}
        />
      )}
    </div>
  );
}

/* ── Small status pill ────────────────────────────────────────────────────── */

function StatusPill({
  status,
}: {
  status: "scheduled" | "completed" | "cancelled";
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        status === "scheduled" && "bg-primary/10 text-primary",
        status === "completed" && "bg-muted text-muted-foreground",
        status === "cancelled" &&
          "bg-destructive/10 text-destructive line-through",
      )}
    >
      {status}
    </span>
  );
}

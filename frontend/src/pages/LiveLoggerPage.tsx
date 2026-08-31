import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, FileText, Lock, MapPin, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/features/events/EventDetailDialog";
import {
  formatDateLabel,
  formatEventDateTime,
  formatLocalDate,
} from "@/features/events/event-utils";
import { useEvents } from "@/features/events/hooks";
import type { TeamEvent } from "@/features/events/types";
import { cn } from "@/lib/utils";

function isFutureCalendarDate(scheduledAt: string, now = new Date()) {
  const scheduled = new Date(scheduledAt);
  if (Number.isNaN(scheduled.getTime())) {
    return false;
  }
  return formatLocalDate(now) < formatLocalDate(scheduled);
}

/**
 * Match picker for the live logger. Lists Match-type events from GET /events
 * and routes unlocked ones into the existing confirm-squad flow.
 */
export default function LiveLoggerPage() {
  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const navigate = useNavigate();

  const matches = useMemo(
    () => (events ?? []).filter((event) => event.type === "match"),
    [events],
  );

  return (
    <>
      <PageHeader
        title="Live Logger"
        subtitle="Select a match to confirm the squad and start logging."
      />

      <div className="space-y-6 p-6 sm:p-8">
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

        {!isLoading && !isError && matches.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <Radio className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">
              No matches yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a match event from the Events page to start logging.
            </p>
          </div>
        )}

        {!isLoading && !isError && matches.length > 0 && (
          <ul className="flex flex-col gap-3">
            {matches.map((event) => (
              <li key={event.id}>
                <MatchRow
                  event={event}
                  onSelect={() => {
                    if (event.status === "completed" && event.matchId) {
                      navigate(`/matches/${event.matchId}/report`);
                      return;
                    }
                    navigate(`/events/${event.id}/confirm-squad`);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function MatchRow({
  event,
  onSelect,
}: {
  event: TeamEvent;
  onSelect: () => void;
}) {
  const cancelled = event.status === "cancelled";
  const completed = event.status === "completed";
  const reportable = completed && Boolean(event.matchId);
  const locked =
    !cancelled && !completed && isFutureCalendarDate(event.scheduledAt);
  const startable = !cancelled && !completed && !locked;
  const clickable = reportable || startable;
  const scheduledDate = new Date(event.scheduledAt);
  const unlockLabel = Number.isNaN(scheduledDate.getTime())
    ? event.scheduledAt
    : formatDateLabel(scheduledDate);

  const className = cn(
    "w-full rounded-xl border border-border bg-card p-4 text-left",
    cancelled && "opacity-55",
    clickable &&
      "transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    locked && "cursor-not-allowed",
  );

  const body = (
    <>
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
            Match
          </p>
        </div>
        {cancelled ? (
          <StatusBadge status="cancelled" />
        ) : reportable ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary">
            <FileText className="size-3" />
            View Match Report
          </span>
        ) : completed ? (
          <StatusBadge status="completed" />
        ) : locked ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
            <Lock className="size-3" />
            Unlocks {unlockLabel}
          </span>
        ) : (
          <StatusBadge status={event.status} />
        )}
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
    </>
  );

  if (clickable) {
    return (
      <button type="button" onClick={onSelect} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}

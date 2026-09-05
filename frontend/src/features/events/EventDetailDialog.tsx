import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  displayEventStatus,
  eventStatusLabel,
  eventTypeLabel,
  formatEventDateTime,
} from "./event-utils";
import { useCancelEvent } from "./hooks";
import type { EventStatus, TeamEvent } from "./types";
import { fetchEventRsvps, type AthleteRsvp, type RsvpStatus } from "@/services/rsvps";

interface EventDetailDialogProps {
  event: TeamEvent | null;
  now: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (event: TeamEvent) => void;
}

/** Read-only event summary with Edit and Cancel Event actions. */
export function EventDetailDialog({
  event,
  now,
  open,
  onOpenChange,
  onEdit,
}: EventDetailDialogProps) {
  const navigate = useNavigate();
  const cancelEvent = useCancelEvent();
  const [error, setError] = useState<string | null>(null);

  // Fetch RSVP breakdown for the coach
  const rsvpsQuery = useQuery({
    queryKey: ["events", event?.id, "rsvps"],
    queryFn: () => fetchEventRsvps(event!.id),
    enabled: open && Boolean(event?.id),
  });

  const rsvpGroups = useMemo(() => {
    const athletes = rsvpsQuery.data ?? [];
    const groups: Record<
      "confirmed" | "maybe" | "declined" | "no_response",
      AthleteRsvp[]
    > = {
      confirmed: [],
      maybe: [],
      declined: [],
      no_response: [],
    };
    for (const a of athletes) {
      if (a.rsvpStatus === "going") groups.confirmed.push(a);
      else if (a.rsvpStatus === "maybe") groups.maybe.push(a);
      else if (a.rsvpStatus === "not_going") groups.declined.push(a);
      else groups.no_response.push(a);
    }
    return groups;
  }, [rsvpsQuery.data]);

  const handleCancel = async () => {
    if (!event) {
      return;
    }
    setError(null);
    try {
      await cancelEvent.mutateAsync(event.id);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not cancel this event. Please try again.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setError(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold uppercase tracking-wide text-foreground">
            Event
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Review this event, edit it, or cancel it on the calendar.
          </DialogDescription>
        </DialogHeader>

        {event && (
          <div
            className={cn(
              "space-y-4 rounded-lg border border-border bg-background p-4",
              event.status === "cancelled" && "opacity-70",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h3
                className={cn(
                  "text-xl font-semibold text-foreground",
                  event.status === "cancelled" && "line-through",
                )}
              >
                {event.title}
              </h3>
              <StatusBadge status={displayEventStatus(event, now)} />
            </div>

            <DetailRow label="Type" value={eventTypeLabel(event.type)} />
            <DetailRow
              label="Date & time"
              value={formatEventDateTime(event.scheduledAt)}
            />
            <DetailRow label="Location" value={event.location} />
            <DetailRow
              label="Notes"
              value={event.notes?.trim() ? event.notes : "None"}
            />
          </div>
        )}

        {/* ── RSVP Breakdown (coach view) ──────────────────────────────── */}
        {event && rsvpsQuery.data && rsvpsQuery.data.length > 0 && (
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              RSVP Responses ({rsvpsQuery.data.length})
            </h3>
            <div className="space-y-3">
              <RsvpGroup
                label="Confirmed"
                athletes={rsvpGroups.confirmed}
                dotClass="bg-emerald-400"
              />
              <RsvpGroup
                label="Maybe"
                athletes={rsvpGroups.maybe}
                dotClass="bg-amber-400"
              />
              <RsvpGroup
                label="Declined"
                athletes={rsvpGroups.declined}
                dotClass="bg-red-400"
              />
              <RsvpGroup
                label="No response"
                athletes={rsvpGroups.no_response}
                dotClass="bg-muted-foreground/40"
              />
            </div>
          </div>
        )}

        {event && rsvpsQuery.isLoading && (
          <div className="rounded-lg border border-border bg-background p-4 text-center text-xs text-muted-foreground">
            Loading RSVP responses…
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {event && event.status !== "cancelled" && (
            <Button
              variant="destructive"
              onClick={() => void handleCancel()}
              disabled={cancelEvent.isPending}
            >
              {cancelEvent.isPending ? "Cancelling…" : "Cancel Event"}
            </Button>
          )}
          {event && event.type === "match" && event.status !== "cancelled" && (
            <Button
              onClick={() => navigate(`/events/${event.id}/confirm-squad`)}
            >
              Confirm squad
            </Button>
          )}
          {event && (
            <Button
              variant="outline"
              className="sm:ml-auto"
              onClick={() => onEdit(event)}
            >
              Edit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        status === "scheduled" && "bg-primary/10 text-primary",
        status === "completed" && "bg-muted text-muted-foreground",
        status === "cancelled" &&
          "bg-destructive/10 text-destructive line-through",
      )}
    >
      {eventStatusLabel(status)}
    </span>
  );
}

/* ── RSVP breakdown sub-components ──────────────────────────────────────── */

function RsvpGroup({
  label,
  athletes,
  dotClass,
}: {
  label: string;
  athletes: AthleteRsvp[];
  dotClass: string;
}) {
  if (athletes.length === 0) return null;

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className={cn("size-2 rounded-full", dotClass)} />
        <span className="text-xs font-semibold text-foreground">
          {label} ({athletes.length})
        </span>
      </div>
      <ul className="space-y-1 pl-3.5">
        {athletes.map((a) => (
          <li key={a.id} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {a.firstName} {a.lastName}
            </span>
            {a.squadNumber != null && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                #{a.squadNumber}
              </span>
            )}
            {a.rsvpNote && (
              <span className="ml-1 italic">“{a.rsvpNote}”</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

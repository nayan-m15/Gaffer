import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { displayEventStatus, eventStatusLabel, eventTypeLabel, formatEventDateTime } from "./event-utils";
import { useCancelEvent } from "./hooks";
import type { EventStatus, TeamEvent } from "./types";
import { fetchEventRsvps, type AthleteRsvp } from "@/services/rsvps";
import type { PlayerEvent } from "@/services/player";
import { RsvpWidget } from "@/features/player/RsvpWidget";
import { EventWeatherCard } from "./EventWeatherCard";

interface EventDetailDialogProps {
  event: TeamEvent | PlayerEvent | null;
  now: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (event: TeamEvent) => void;
  /**
   * Player mode: hides Edit/Cancel/Confirm-squad and skips the coach-only
   * RSVP breakdown fetch (GET /events/:eventId/rsvps 403s for a player),
   * showing the player's own RsvpWidget instead. `rsvpQueryKey` is required
   * in this mode so the widget can invalidate the right query on submit.
   */
  readOnly?: boolean;
  rsvpQueryKey?: readonly string[];
  /**
   * Assistant mode: hides the coach-only Edit/Cancel actions while keeping
   * the RSVP breakdown and the "Confirm squad" live-logging entry. The
   * backend independently enforces 403 on event mutations.
   */
  canManage?: boolean;
}

export function EventDetailDialog({
  event, now, open, onOpenChange, onEdit, readOnly = false, rsvpQueryKey, canManage = true,
}: EventDetailDialogProps) {
  const navigate = useNavigate();
  const cancelEvent = useCancelEvent();
  const [error, setError] = useState<string | null>(null);

  const rsvpsQuery = useQuery({
    queryKey: ["events", event?.id, "rsvps"],
    queryFn: () => fetchEventRsvps(event!.id),
    enabled: open && Boolean(event?.id) && !readOnly, // ← the key change
  });

  const rsvpGroups = useMemo(() => {
    const athletes = rsvpsQuery.data ?? [];
    const groups: Record<"confirmed" | "maybe" | "declined" | "no_response", AthleteRsvp[]> = {
      confirmed: [], maybe: [], declined: [], no_response: [],
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
    if (!event) return;
    setError(null);
    try {
      await cancelEvent.mutateAsync(event.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel this event. Please try again.");
    }
  };

  const playerEvent = readOnly ? (event as PlayerEvent | null) : null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) setError(null); onOpenChange(nextOpen); }}>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold uppercase tracking-wide text-foreground">Event</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {readOnly
              ? "Event details and your RSVP."
              : canManage
                ? "Review this event, edit it, or cancel it on the calendar."
                : "View this event's details and RSVP responses."}
          </DialogDescription>
        </DialogHeader>

        {event && (
          <div className={cn("space-y-4 rounded-lg border border-border bg-background p-4", event.status === "cancelled" && "opacity-70")}>
            <div className="flex items-start justify-between gap-3">
              <h3 className={cn("text-xl font-semibold text-foreground", event.status === "cancelled" && "line-through")}>
                {event.title}
              </h3>
              <StatusBadge status={displayEventStatus(event, now)} />
            </div>
            <DetailRow label="Type" value={eventTypeLabel(event.type)} />
            <DetailRow label="Date & time" value={formatEventDateTime(event.scheduledAt)} />
            <DetailRow label="Location" value={event.location} />
            {event.venueAddress && <DetailRow label="Address" value={event.venueAddress} />}
            <LocationLinks event={event} />
            <DetailRow label="Notes" value={event.notes?.trim() ? event.notes : "None"} />
            {event.status !== "cancelled" && !readOnly && (
              <EventWeatherCard eventId={event.id} enabled={open} />
            )}
          </div>
        )}

        {/* Player RSVP — replaces the coach breakdown entirely */}
        {readOnly && event && playerEvent && rsvpQueryKey && event.status === "scheduled" && (
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Your RSVP
            </h3>
            <RsvpWidget
              eventId={event.id}
              currentStatus={playerEvent.rsvpStatus}
              currentNote={playerEvent.rsvpNote}
              queryKey={rsvpQueryKey}
            />
          </div>
        )}

        {/* Coach breakdown — unchanged, just gated on !readOnly */}
        {!readOnly && event && rsvpsQuery.data && rsvpsQuery.data.length > 0 && (
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              RSVP Responses ({rsvpsQuery.data.length})
            </h3>
            <div className="space-y-3">
              <RsvpGroup label="Confirmed" athletes={rsvpGroups.confirmed} dotClass="bg-emerald-400" />
              <RsvpGroup label="Maybe" athletes={rsvpGroups.maybe} dotClass="bg-amber-400" />
              <RsvpGroup label="Declined" athletes={rsvpGroups.declined} dotClass="bg-red-400" />
              <RsvpGroup label="No response" athletes={rsvpGroups.no_response} dotClass="bg-muted-foreground/40" />
            </div>
          </div>
        )}

        {!readOnly && event && rsvpsQuery.isLoading && (
          <div className="rounded-lg border border-border bg-background p-4 text-center text-xs text-muted-foreground">
            Loading RSVP responses…
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {!readOnly && (
          <DialogFooter className="gap-2 sm:justify-between">
            {canManage && event && event.status !== "cancelled" && (
              <Button variant="destructive" onClick={() => void handleCancel()} disabled={cancelEvent.isPending}>
                {cancelEvent.isPending ? "Cancelling…" : "Cancel Event"}
              </Button>
            )}
            {event && event.type === "match" && event.status !== "cancelled" && (
              <Button onClick={() => navigate(`/events/${event.id}/confirm-squad`)}>Confirm squad</Button>
            )}
            {canManage && event && (
              <Button variant="outline" className="sm:ml-auto" onClick={() => onEdit(event as TeamEvent)}>Edit</Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LocationLinks({ event }: { event: TeamEvent | PlayerEvent }) {
  const destination = [event.location, event.venueAddress]
    .filter(Boolean)
    .join(", ");
  const encoded = encodeURIComponent(destination);
  return (
    <div className="flex gap-3 text-xs">
      <a className="font-medium text-primary hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${encoded}`} target="_blank" rel="noreferrer">View map</a>
      <a className="font-medium text-primary hover:underline" href={`https://www.google.com/maps/dir/?api=1&destination=${encoded}`} target="_blank" rel="noreferrer">Get directions</a>
    </div>
  );
}

// DetailRow, StatusBadge, RsvpGroup — unchanged, keep as-is.
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

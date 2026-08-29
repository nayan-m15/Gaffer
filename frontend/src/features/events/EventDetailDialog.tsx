import { useState } from "react";
import { useNavigate } from "react-router-dom";
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

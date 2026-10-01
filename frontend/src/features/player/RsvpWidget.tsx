import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, HelpCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { isRsvpOpen } from "@/features/events/event-utils";
import type { EventStatus } from "@/features/events/types";
import { submitRsvp, type RsvpStatus } from "@/services/rsvps";

/**
 * RSVP widget for a single event card.
 *
 * Three action buttons (Going / Maybe / Can't go) plus an optional short
 * note field. Status pills reuse the same semantic colour conventions as
 * `StatusBadge.tsx`: emerald for positive, amber for uncertain, destructive
 * for declined.
 */
interface RsvpWidgetProps {
  eventId: string;
  scheduledAt: string;
  eventStatus: EventStatus;
  currentStatus: RsvpStatus | null;
  currentNote: string | null;
  /** Query key to invalidate after a successful RSVP submission. */
  queryKey?: readonly unknown[];
}

const RSVP_OPTIONS: {
  status: RsvpStatus;
  label: string;
  icon: typeof Check;
  activeClass: string;
}[] = [
  {
    status: "going",
    label: "Going",
    icon: Check,
    activeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  {
    status: "maybe",
    label: "Maybe",
    icon: HelpCircle,
    activeClass: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  {
    status: "not_going",
    label: "Can't go",
    icon: XCircle,
    activeClass: "bg-red-500/20 text-red-400 border-red-500/40",
  },
];

export function RsvpWidget({
  eventId,
  scheduledAt,
  eventStatus,
  currentStatus,
  currentNote,
  queryKey,
}: RsvpWidgetProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(currentNote ?? "");
  const [showNote, setShowNote] = useState(Boolean(currentNote));
  const [clock, setClock] = useState(() => Date.now());
  const canRespond = isRsvpOpen({ status: eventStatus, scheduledAt }, new Date(clock));

  // Close the controls exactly at the deadline, even if the modal remains
  // open. Long timers are rearmed safely for distant future events.
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => setClock(Date.now());
    const scheduleRefresh = () => {
      const remaining = new Date(scheduledAt).getTime() - Date.now();
      if (eventStatus !== "scheduled" || !(remaining > 0)) return;
      timer = window.setTimeout(() => {
        refresh();
        scheduleRefresh();
      }, Math.min(remaining, 2_147_483_647));
    };
    refresh();
    scheduleRefresh();
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [eventStatus, scheduledAt]);

  useEffect(() => {
    setNote(currentNote ?? "");
    setShowNote(Boolean(currentNote));
  }, [currentNote]);

  const rsvpMutation = useMutation({
    mutationFn: (status: RsvpStatus) => {
      // A tab left open must not submit using an outdated button state.
      if (!isRsvpOpen({ status: eventStatus, scheduledAt })) {
        setClock(Date.now());
        throw new Error("RSVP closed: this event has already started or is no longer scheduled.");
      }
      return submitRsvp(eventId, {
        status,
        ...(showNote && note.trim() ? { note: note.trim() } : {}),
      });
    },
    onSuccess: async () => {
      if (queryKey) {
        await queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) setClock(Date.now());
    },
  });

  const activeStatus = rsvpMutation.isPending
    ? (rsvpMutation.variables ?? currentStatus)
    : currentStatus;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Your RSVP
      </p>

      {!canRespond && (
        <p className="mb-2 text-xs text-muted-foreground" role="status">
          RSVP closed — {currentStatus ? "your recorded response is shown below." : "you did not submit a response."}
        </p>
      )}

      {/* Status buttons */}
      <div className="flex flex-wrap gap-2">
        {RSVP_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = activeStatus === option.status;

          return (
            <button
              key={option.status}
              type="button"
              disabled={!canRespond || rsvpMutation.isPending}
              onClick={() => rsvpMutation.mutate(option.status)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                isActive
                  ? option.activeClass
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                (!canRespond || rsvpMutation.isPending) && "cursor-not-allowed opacity-60",
              )}
              aria-pressed={isActive}
              title={!canRespond ? "RSVP closed" : undefined}
            >
              <Icon className="size-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Note toggle + field */}
      {canRespond ? (
        <div className="mt-2">
        {!showNote ? (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
          >
            {currentNote ? "Edit note" : "Add a note"}
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional short note…"
              maxLength={280}
              className="h-8 flex-1 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                if (currentStatus) {
                  rsvpMutation.mutate(currentStatus);
                }
              }}
              disabled={!note.trim() || note === currentNote || rsvpMutation.isPending}
            >
              Save
            </Button>
          </div>
        )}

        {currentNote && !showNote && (
          <p className="mt-1 text-xs italic text-muted-foreground">
            "{currentNote}"
          </p>
        )}
        </div>
      ) : currentNote ? (
        <p className="mt-2 text-xs italic text-muted-foreground">Note: {currentNote}</p>
      ) : null}

      {/* Error state */}
      {rsvpMutation.isError && (
        <p className="mt-2 text-xs text-destructive">
          {rsvpMutation.error instanceof ApiError && rsvpMutation.error.status === 409
            ? "RSVP closed — your response can no longer be changed."
            : rsvpMutation.error?.message.startsWith("RSVP closed")
              ? rsvpMutation.error.message
              : "Failed to save RSVP. Please try again."}
        </p>
      )}
    </div>
  );
}

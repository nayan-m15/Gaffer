import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, HelpCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  currentStatus,
  currentNote,
  queryKey,
}: RsvpWidgetProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(currentNote ?? "");
  const [showNote, setShowNote] = useState(Boolean(currentNote));

  const rsvpMutation = useMutation({
    mutationFn: (status: RsvpStatus) =>
      submitRsvp(eventId, {
        status,
        ...(showNote && note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: async () => {
      if (queryKey) {
        await queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
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

      {/* Status buttons */}
      <div className="flex flex-wrap gap-2">
        {RSVP_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = activeStatus === option.status;

          return (
            <button
              key={option.status}
              type="button"
              disabled={rsvpMutation.isPending}
              onClick={() => rsvpMutation.mutate(option.status)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                isActive
                  ? option.activeClass
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                rsvpMutation.isPending && "opacity-60",
              )}
              aria-pressed={isActive}
            >
              <Icon className="size-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Note toggle + field */}
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

      {/* Error state */}
      {rsvpMutation.isError && (
        <p className="mt-2 text-xs text-destructive">
          Failed to save RSVP. Please try again.
        </p>
      )}
    </div>
  );
}

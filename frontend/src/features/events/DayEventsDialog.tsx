import { format } from "date-fns";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatEventTime } from "./calendar-utils";
import { displayEventStatus, eventTypeLabel } from "./event-utils";
import { getEventTypeStyle } from "./event-style";
import type { TeamEvent } from "./types";

interface DayEventsDialogProps {
  date: Date | null;
  events: TeamEvent[];
  now: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectEvent: (event: TeamEvent) => void;
  onAddEvent: (date: Date) => void;
  readOnly?: boolean;
}

/**
 * Popup modal showing all events for a clicked date (Samsung Calendar style)
 * with direct option to add another event on that specific date.
 */
export function DayEventsDialog({
  date,
  events,
  now,
  open,
  onOpenChange,
  onSelectEvent,
  onAddEvent,
  readOnly = false,
}: DayEventsDialogProps) {
  if (!date) return null;

  const dayNumber = format(date, "d");
  const weekdayName = format(date, "EEEE");
  const dateSubLabel = format(date, "dd MMM");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md p-5 rounded-3xl border border-border shadow-2xl">
        <DialogHeader className="gap-0.5 pb-2">
          <DialogTitle className="flex items-baseline gap-2.5 text-foreground">
            <span className="text-2xl sm:text-3xl font-black tracking-tight">{dayNumber}</span>
            <span className="text-xl sm:text-2xl font-bold tracking-tight">{weekdayName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {dateSubLabel} · {events.length} {events.length === 1 ? "event" : "events"}
          </DialogDescription>
        </DialogHeader>

        {/* Events list */}
        <div className="flex flex-col gap-2 my-2 max-h-[360px] overflow-y-auto pr-0.5">
          {events.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No events scheduled for this day.
            </div>
          ) : (
            events.map((event) => {
              const style = getEventTypeStyle(event.type);
              const Icon = style.icon;
              const cancelled = event.status === "cancelled";
              const completed = displayEventStatus(event, now) === "completed";

              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onSelectEvent(event);
                  }}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-2xl border border-border bg-background/80 p-3 text-left transition-all duration-150 shadow-2xs",
                    "hover:bg-muted/60 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    cancelled && "opacity-60",
                    !cancelled && completed && "opacity-80",
                  )}
                >
                  {/* Time label */}
                  <span className="w-12 shrink-0 font-bold tabular-nums text-sm text-foreground">
                    {formatEventTime(event.scheduledAt)}
                  </span>

                  {/* Vertical color stripe */}
                  <span
                    className={cn("w-1 self-stretch shrink-0 rounded-full", style.swatch)}
                    aria-hidden="true"
                  />

                  {/* Event content */}
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <span
                      className={cn(
                        "text-sm font-bold text-foreground truncate",
                        cancelled && "line-through",
                      )}
                    >
                      {event.title}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {eventTypeLabel(event.type)}
                        {event.location ? ` · ${event.location}` : ""}
                      </span>
                      {cancelled && (
                        <span className="text-destructive font-semibold">Cancelled</span>
                      )}
                    </div>
                  </div>

                  {/* Icon badge */}
                  <div className="shrink-0 flex items-center justify-center p-1.5 rounded-full bg-muted/60 text-muted-foreground group-hover:text-foreground group-hover:bg-primary/15 transition-colors">
                    <Icon className="size-4" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Bottom "Add on [Date] +" Capsule Button (Samsung Calendar style) */}
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onAddEvent(date);
            }}
            className={cn(
              "mt-2 w-full rounded-full bg-muted/80 hover:bg-muted text-foreground py-3 px-5",
              "flex items-center justify-between text-sm font-bold transition-all duration-150 active:scale-[0.99] border border-border/50 shadow-xs",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            )}
          >
            <span>Add on {dateSubLabel}</span>
            <Plus className="size-4.5 text-foreground" />
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

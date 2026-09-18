import { useMemo, useState } from "react";
import { Bell, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  dismissEventReminder,
  getUpcomingReminders,
  type ReminderEvent,
} from "./upcomingReminders";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TYPE_LABEL: Record<ReminderEvent["type"], string> = {
  match: "Match",
  training: "Training",
  meeting: "Meeting",
};

/**
 * Dashboard banner for scheduled events starting within the next 24 hours.
 * Renders nothing when there are no active reminders.
 */
export function EventRemindersBanner({ events }: { events: ReminderEvent[] }) {
  const [extraDismissed, setExtraDismissed] = useState<string[]>([]);

  const reminders = useMemo(() => {
    const base = getUpcomingReminders(events);
    if (extraDismissed.length === 0) return base;
    const dismissed = new Set(extraDismissed);
    return base.filter((event) => !dismissed.has(event.id));
  }, [events, extraDismissed]);

  if (reminders.length === 0) return null;

  const handleDismiss = (eventId: string) => {
    dismissEventReminder(eventId);
    setExtraDismissed((ids) =>
      ids.includes(eventId) ? ids : [...ids, eventId],
    );
  };

  return (
    <section
      aria-label="Upcoming event reminders"
      className="rounded-xl border border-primary/30 bg-card p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <Bell className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Reminders · Next 24 hours
        </h2>
      </div>

      <ul className="-my-1">
        {reminders.map((event) => (
          <li
            key={event.id}
            className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {event.title}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    event.type === "match"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-foreground",
                  )}
                >
                  {TYPE_LABEL[event.type]}
                </span>
                {event.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" aria-hidden="true" />
                    {event.location}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-right">
                <p className="text-xs font-medium text-foreground">
                  {DATE_FMT.format(new Date(event.scheduledAt))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {TIME_FMT.format(new Date(event.scheduledAt))}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                aria-label={`Dismiss reminder for ${event.title}`}
                onClick={() => handleDismiss(event.id)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useEvents, useNow } from "@/features/events/hooks";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { REMINDER_WINDOW_MS } from "./upcomingReminders";
import type { TeamEvent } from "@/features/events/types";

const DISMISS_STORAGE_KEY = "gaffer:squad-reminder-dismissed";

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function readDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissedIds(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore quota / private-mode failures — reminder still shows.
  }
}

function dismissSquadReminder(eventId: string) {
  const ids = readDismissedIds();
  ids.add(eventId);
  writeDismissedIds(ids);
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dayLabel(scheduledAt: Date, now: Date): "today" | "tomorrow" {
  const eventDay = startOfLocalDay(scheduledAt).getTime();
  const today = startOfLocalDay(now).getTime();
  const tomorrow = today + 24 * 60 * 60 * 1000;
  if (eventDay === tomorrow) return "tomorrow";
  return "today";
}

function unconfirmedMatchesNeedingSquad(
  events: TeamEvent[],
  now: Date,
  extraDismissed: string[],
): TeamEvent[] {
  const dismissed = readDismissedIds();
  for (const id of extraDismissed) dismissed.add(id);
  const windowEnd = now.getTime() + REMINDER_WINDOW_MS;

  return events
    .filter((event) => {
      if (event.type !== "match") return false;
      if (event.status !== "scheduled") return false;
      if (event.lineupConfirmedAt != null) return false;
      if (event.competitionFixtureId && !event.fixtureScheduleConfirmedAt) {
        return false;
      }
      if (dismissed.has(event.id)) return false;

      const at = new Date(event.scheduledAt).getTime();
      if (Number.isNaN(at)) return false;
      return at >= now.getTime() && at <= windowEnd;
    })
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
}

/**
 * Warns coaches and assistants when a scheduled match within 24 hours has
 * no confirmed squad. Confirm-squad is allowed for any team member (not
 * coach-only), matching ConfirmSquadPage and PUT /events/:id/lineup.
 */
export function MatchSquadReminder() {
  const { team } = useAuth();
  const { data: events } = useEvents();
  const now = useNow();
  const [extraDismissed, setExtraDismissed] = useState<string[]>([]);

  const matches = useMemo(
    () => unconfirmedMatchesNeedingSquad(events ?? [], now, extraDismissed),
    [events, now, extraDismissed],
  );

  if (!team) return null;
  if (matches.length === 0) return null;

  const soonest = matches[0];
  const moreCount = matches.length - 1;
  const scheduled = new Date(soonest.scheduledAt);
  const when = Number.isNaN(scheduled.getTime())
    ? soonest.scheduledAt
    : TIME_FMT.format(scheduled);
  const day = Number.isNaN(scheduled.getTime())
    ? "today"
    : dayLabel(scheduled, now);

  const handleDismiss = () => {
    dismissSquadReminder(soonest.id);
    setExtraDismissed((ids) =>
      ids.includes(soonest.id) ? ids : [...ids, soonest.id],
    );
  };

  return (
    <section
      aria-labelledby="squad-reminder-heading"
      className="rounded-xl border border-warning/30 bg-warning/5 p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="squad-reminder-heading"
            className="text-sm font-semibold text-foreground"
          >
            Squad not confirmed
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {soonest.title} is {day} at {when}. Confirm your squad before
            kick-off.
          </p>
          {moreCount > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              +{moreCount} more match{moreCount === 1 ? "" : "es"} need a squad
            </p>
          )}
          <Link
            to={`/events/${soonest.id}/confirm-squad`}
            className={cn(buttonVariants({ size: "sm" }), "mt-3")}
          >
            Confirm squad
          </Link>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-8 shrink-0 p-0"
          aria-label={`Dismiss squad reminder for ${soonest.title}`}
          onClick={handleDismiss}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

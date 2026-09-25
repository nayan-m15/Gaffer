/** Window used for “happening soon” reminders on the dashboards. */
export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

const DISMISS_STORAGE_KEY = "event-reminder-dismissed";

/** Minimal event shape shared by coach and player upcoming lists. */
export interface ReminderEvent {
  id: string;
  title: string;
  type: "match" | "training" | "meeting";
  scheduledAt: string;
  location?: string;
  /** When present, only `scheduled` events produce reminders. */
  status?: "scheduled" | "cancelled" | "completed";
  /** Generated competition fixtures stay visible in the calendar while their
   * date is negotiated, but should not produce match-day reminders yet. */
  competitionFixtureId?: string | null;
  fixtureScheduleConfirmedAt?: string | null;
}

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
    // Ignore quota / private-mode failures — reminders still show.
  }
}

/** Persist a dismiss so this event’s reminder stays hidden on this device. */
export function dismissEventReminder(eventId: string) {
  const ids = readDismissedIds();
  ids.add(eventId);
  writeDismissedIds(ids);
}

/**
 * Events scheduled within the next 24 hours that should surface as reminders.
 * Past, cancelled, completed, and locally dismissed events are excluded.
 */
export function getUpcomingReminders(
  events: ReminderEvent[],
  now: Date = new Date(),
): ReminderEvent[] {
  const dismissed = readDismissedIds();
  const windowEnd = now.getTime() + REMINDER_WINDOW_MS;

  return events
    .filter((event) => {
      if (event.status != null && event.status !== "scheduled") return false;
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

import type { EventStatus, EventType } from "./types";

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "training", label: "Training" },
  { value: "match", label: "Match" },
  { value: "meeting", label: "Meeting" },
];

export const EVENT_TYPE_ITEMS: Record<EventType, string> = {
  training: "Training",
  match: "Match",
  meeting: "Meeting",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Formats an ISO timestamp for the events list and detail views. */
export function formatEventDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTimeLabel(time: string) {
  const [hour, minute] = time.split(":");
  if (hour === undefined || minute === undefined) {
    return time;
  }
  const sample = new Date();
  sample.setHours(Number(hour), Number(minute), 0, 0);
  if (Number.isNaN(sample.getTime())) {
    return time;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(sample);
}

/** Local calendar date as YYYY-MM-DD, avoiding UTC shift from toISOString(). */
export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

export function splitScheduledAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }

  return {
    date: formatLocalDate(date),
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function combineScheduledAt(date: string, time: string) {
  return new Date(`${date}T${time}`).toISOString();
}

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isScheduleInThePast(
  date: Date,
  time: string,
  now = new Date(),
) {
  const scheduled = new Date(`${formatLocalDate(date)}T${time}`);
  return Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= now.getTime();
}

/**
 * Status shown in the UI. Past `scheduled` events read as completed without
 * writing to the API; `cancelled` is never overridden.
 */
export function displayEventStatus(
  event: { status: EventStatus; scheduledAt: string },
  now = new Date(),
): EventStatus {
  if (event.status !== "scheduled") {
    return event.status;
  }
  const scheduledAt = new Date(event.scheduledAt);
  if (
    !Number.isNaN(scheduledAt.getTime()) &&
    scheduledAt.getTime() <= now.getTime()
  ) {
    return "completed";
  }
  return "scheduled";
}

export function eventTypeLabel(type: EventType) {
  return EVENT_TYPE_ITEMS[type];
}

export function eventStatusLabel(status: EventStatus) {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
  }
}

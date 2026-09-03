import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { EventType, TeamEvent } from "./types";

/** Weeks start on Monday across the events calendar. */
export const WEEK_STARTS_ON = 1 as const;

/** Max event pills rendered inside a month cell before switching to "+N more". */
export const MAX_VISIBLE_EVENTS_PER_DAY = 3;

export type CalendarView = "month" | "week" | "agenda";

/**
 * The 42 dates (six Monday-start weeks) that cover the month of `anchor`.
 * A fixed cell count keeps the grid height stable across months.
 */
export function getMonthGrid(anchor: Date): Date[] {
  const first = startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

/** The seven dates (Monday–Sunday) of the week containing `anchor`. */
export function getWeekDays(anchor: Date): Date[] {
  const first = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

/** Step the displayed period by one unit for the active view. */
export function moveCursor(
  view: CalendarView,
  cursor: Date,
  direction: 1 | -1,
): Date {
  return view === "week" ? addWeeks(cursor, direction) : addMonths(cursor, direction);
}

/** Local calendar day key (YYYY-MM-DD) used to group events by date. */
export function toDayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Day key of an event in the viewer's local timezone. */
export function eventDayKey(event: TeamEvent): string {
  return toDayKey(new Date(event.scheduledAt));
}

/** Groups events by local calendar day, each list sorted by start time. */
export function groupEventsByDay(events: TeamEvent[]): Map<string, TeamEvent[]> {
  const byDay = new Map<string, TeamEvent[]>();
  const sorted = [...events].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  for (const event of sorted) {
    const key = eventDayKey(event);
    const list = byDay.get(key);
    if (list) {
      list.push(event);
    } else {
      byDay.set(key, [event]);
    }
  }
  return byDay;
}

export function getDayEvents(
  byDay: Map<string, TeamEvent[]>,
  date: Date,
): TeamEvent[] {
  return byDay.get(toDayKey(date)) ?? [];
}

/** Removes events whose type is hidden through the sidebar calendar toggles. */
export function filterEventTypes(
  events: TeamEvent[],
  hiddenTypes: ReadonlySet<EventType>,
): TeamEvent[] {
  if (hiddenTypes.size === 0) {
    return events;
  }
  return events.filter((event) => !hiddenTypes.has(event.type));
}

/** Events that fall inside the calendar month of `month`. */
export function getMonthEvents(events: TeamEvent[], month: Date): TeamEvent[] {
  return events.filter((event) => isSameMonth(new Date(event.scheduledAt), month));
}

/** Splits a day's events into the pills that fit and the hidden remainder. */
export function splitDayEvents(
  events: TeamEvent[],
  max = MAX_VISIBLE_EVENTS_PER_DAY,
): { visible: TeamEvent[]; hiddenCount: number } {
  const visible = events.slice(0, max);
  return { visible, hiddenCount: Math.max(0, events.length - visible.length) };
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return isSameDay(a, b);
}

export function isOutsideMonth(day: Date, month: Date): boolean {
  return !isSameMonth(day, month);
}

/* ─── Label helpers (locale-aware, matching event-utils' Intl usage) ───── */

/** "September 2026" — toolbar label for month and agenda views. */
export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "1 – 7 September 2026" — toolbar label for the week view. */
export function formatWeekRangeLabel(weekDays: Date[]): string {
  if (weekDays.length === 0) {
    return "";
  }

  const first = weekDays[0];
  const last = weekDays[weekDays.length - 1];
  const day = (date: Date) =>
    new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date);
  const monthShort = (date: Date) =>
    new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  const monthLong = (date: Date) =>
    new Intl.DateTimeFormat(undefined, { month: "long" }).format(date);
  const year = (date: Date) =>
    new Intl.DateTimeFormat(undefined, { year: "numeric" }).format(date);

  if (isSameMonth(first, last)) {
    return `${day(first)} – ${day(last)} ${monthLong(first)} ${year(first)}`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${day(first)} ${monthShort(first)} – ${day(last)} ${monthShort(last)} ${year(first)}`;
  }
  return `${day(first)} ${monthShort(first)} ${year(first)} – ${day(last)} ${monthShort(last)} ${year(last)}`;
}

/** Short weekday labels ("Mon"… "Sun") for the calendar header. */
export function getWeekdayLabels(): string[] {
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  // 2024-09-02 was a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(2024, 8, 2 + index)),
  );
}

/** Single-letter weekday labels for the mini calendar. */
export function getMiniWeekdayLabels(): string[] {
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(2024, 8, 2 + index)),
  );
}

/** Compact start time ("09:00") for calendar pills. */
export function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Full accessible day label ("Monday, 1 September 2026"). */
export function formatFullDayLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

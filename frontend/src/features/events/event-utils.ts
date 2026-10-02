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
export function formatEventDateTime(iso: string, timeZone?: string | null) {
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
    ...(timeZone ? { timeZone, timeZoneName: "short" } : {}),
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
/** RSVP changes stop at the event's scheduled start instant (inclusive). */
export function isRsvpOpen(
  event: { status: EventStatus; scheduledAt: string },
  now = new Date(),
): boolean {
  const scheduledAt = new Date(event.scheduledAt).getTime();
  return event.status === "scheduled" &&
    Number.isFinite(scheduledAt) &&
    scheduledAt > now.getTime();
}

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

/** Formats the full event venue destination string from location, venue name, and address. */
export function buildEventDestination(event: {
  location?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
}): string {
  return [event.location, event.venueName, event.venueAddress]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

/** Builds the Google Maps search link matching the "View map" button. */
export function buildEventMapUrl(destination: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

/** Builds an OpenStreetMap embed iframe URL centered on the given coordinates. */
export function buildEventOsmEmbedUrl(
  latitude: number,
  longitude: number,
  deltaLon = 0.007,
  deltaLat = 0.005,
): string {
  const minLon = (longitude - deltaLon).toFixed(6);
  const maxLon = (longitude + deltaLon).toFixed(6);
  const minLat = (latitude - deltaLat).toFixed(6);
  const maxLat = (latitude + deltaLat).toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${latitude.toFixed(6)}%2C${longitude.toFixed(6)}`;
}

export interface EventMapTile {
  url: string;
  left: number;
  top: number;
  key: string;
}

/** Calculates standard OpenStreetMap slippy tiles and offsets to cover a centered preview box. */
export function getEventMapTiles(
  latitude: number,
  longitude: number,
  zoom = 15,
  width = 128,
  height = 128,
): EventMapTile[] {
  const sinY = Math.sin((latitude * Math.PI) / 180);
  const clampedSinY = Math.min(Math.max(sinY, -0.9999), 0.9999);
  const scale = 256 * Math.pow(2, zoom);
  const centerX = scale * (0.5 + longitude / 360);
  const centerY = scale * (0.5 - Math.log((1 + clampedSinY) / (1 - clampedSinY)) / (4 * Math.PI));

  const originX = centerX - width / 2;
  const originY = centerY - height / 2;

  const minTileX = Math.floor(originX / 256);
  const maxTileX = Math.floor((originX + width) / 256);
  const minTileY = Math.floor(originY / 256);
  const maxTileY = Math.floor((originY + height) / 256);

  const tiles: EventMapTile[] = [];
  for (let x = minTileX; x <= maxTileX; x++) {
    for (let y = minTileY; y <= maxTileY; y++) {
      tiles.push({
        url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        left: Math.round(x * 256 - originX),
        top: Math.round(y * 256 - originY),
        key: `${zoom}-${x}-${y}`,
      });
    }
  }
  return tiles;
}

import assert from "node:assert/strict";
import {
  buildEventDestination,
  buildEventMapUrl,
  buildEventOsmEmbedUrl,
  combineScheduledAt,
  displayEventStatus,
  eventStatusLabel,
  eventTypeLabel,
  formatLocalDate,
  getEventMapTiles,
  isScheduleInThePast,
  isRsvpOpen,
  parseLocalDate,
  splitScheduledAt,
  startOfLocalDay,
} from "./event-utils.ts";

/* ─── formatLocalDate / parseLocalDate ───────────────────────────────── */

assert.equal(formatLocalDate(new Date(2026, 8, 1)), "2026-09-01");
assert.equal(
  formatLocalDate(new Date(2026, 0, 5)),
  "2026-01-05",
  "month and day are zero-padded",
);

const parsed = parseLocalDate("2026-09-28");
assert.ok(parsed);
assert.equal(parsed.getFullYear(), 2026);
assert.equal(parsed.getMonth(), 8);
assert.equal(parsed.getDate(), 28);

assert.equal(parseLocalDate("not-a-date"), undefined);
assert.equal(
  parseLocalDate("2026-02-30"),
  undefined,
  "a calendar-invalid date (Feb 30) is rejected, not rolled forward",
);

/* ─── splitScheduledAt / combineScheduledAt round-trip ───────────────── */

const iso = "2026-09-28T14:30:00.000Z";
const { date, time } = splitScheduledAt(new Date(iso).toISOString());
assert.equal(date, formatLocalDate(new Date(iso)));
assert.equal(time, `${String(new Date(iso).getHours()).padStart(2, "0")}:30`);

assert.deepEqual(splitScheduledAt("not-a-date"), { date: "", time: "" });

const recombined = combineScheduledAt("2026-09-28", "09:15");
assert.equal(new Date(recombined).getHours(), 9);
assert.equal(new Date(recombined).getMinutes(), 15);

/* ─── startOfLocalDay ─────────────────────────────────────────────────── */

const midDay = new Date(2026, 8, 28, 17, 45, 30);
const start = startOfLocalDay(midDay);
assert.equal(start.getHours(), 0);
assert.equal(start.getMinutes(), 0);
assert.equal(start.getSeconds(), 0);
assert.equal(start.getDate(), 28);

/* ─── isScheduleInThePast ─────────────────────────────────────────────── */

const now = new Date(2026, 8, 28, 12, 0, 0);
assert.equal(
  isScheduleInThePast(new Date(2026, 8, 28), "11:00", now),
  true,
  "earlier today is in the past",
);
assert.equal(
  isScheduleInThePast(new Date(2026, 8, 28), "13:00", now),
  false,
  "later today is not in the past",
);
assert.equal(
  isScheduleInThePast(new Date(2026, 8, 28), "12:00", now),
  true,
  "exactly now counts as in the past (inclusive)",
);
assert.equal(
  isScheduleInThePast(new Date(2026, 8, 27), "23:59", now),
  true,
  "yesterday is in the past regardless of time",
);

/* ─── displayEventStatus ──────────────────────────────────────────────── */

assert.equal(
  displayEventStatus({ status: "cancelled", scheduledAt: "2026-01-01T00:00:00.000Z" }, now),
  "cancelled",
  "cancelled is never overridden even if the date is far in the past",
);
assert.equal(
  displayEventStatus({ status: "completed", scheduledAt: "2099-01-01T00:00:00.000Z" }, now),
  "completed",
);
assert.equal(
  displayEventStatus({ status: "scheduled", scheduledAt: "2026-01-01T00:00:00.000Z" }, now),
  "completed",
  "a past scheduled event displays as completed",
);
assert.equal(
  displayEventStatus({ status: "scheduled", scheduledAt: "2099-01-01T00:00:00.000Z" }, now),
  "scheduled",
  "a future scheduled event stays scheduled",
);
assert.equal(
  displayEventStatus({ status: "scheduled", scheduledAt: "not-a-date" }, now),
  "scheduled",
  "an unparsable timestamp does not falsely flip to completed",
);

/* ─── label helpers ───────────────────────────────────────────────────── */

assert.equal(eventTypeLabel("training"), "Training");
assert.equal(eventTypeLabel("match"), "Match");
assert.equal(eventTypeLabel("meeting"), "Meeting");

assert.equal(eventStatusLabel("scheduled"), "Scheduled");
assert.equal(eventStatusLabel("cancelled"), "Cancelled");
assert.equal(eventStatusLabel("completed"), "Completed");

console.log("[event-utils:node-test] passed");

/* ─── RSVP deadline: absolute instant, not calendar day ──────────────── */
const rsvpNow = new Date("2026-09-29T17:00:00.000Z");
assert.equal(isRsvpOpen({ status: "scheduled", scheduledAt: "2026-09-29T17:00:01.000Z" }, rsvpNow), true);
assert.equal(isRsvpOpen({ status: "scheduled", scheduledAt: "2026-09-29T17:00:00.000Z" }, rsvpNow), false);
assert.equal(isRsvpOpen({ status: "scheduled", scheduledAt: "2026-09-28T23:59:00.000Z" }, rsvpNow), false);
assert.equal(isRsvpOpen({ status: "cancelled", scheduledAt: "2099-01-01T00:00:00.000Z" }, rsvpNow), false);
assert.equal(isRsvpOpen({ status: "completed", scheduledAt: "2099-01-01T00:00:00.000Z" }, rsvpNow), false);
assert.equal(isRsvpOpen({ status: "scheduled", scheduledAt: "invalid" }, rsvpNow), false);
assert.equal(isRsvpOpen({ status: "scheduled", scheduledAt: "2099-01-01T00:00:00.000Z" }, rsvpNow), true);

/* ─── buildEventDestination / buildEventMapUrl / buildEventOsmEmbedUrl ─── */
assert.equal(
  buildEventDestination({
    location: "Lenasia",
    venueName: "Lenasia Football Stadium",
    venueAddress: "12 River Road",
  }),
  "Lenasia, Lenasia Football Stadium, 12 River Road",
);
assert.equal(
  buildEventDestination({
    location: "Lenasia",
    venueName: null,
    venueAddress: undefined,
  }),
  "Lenasia",
);
assert.equal(
  buildEventDestination({ location: "   ", venueName: "", venueAddress: null }),
  "",
);

const mapUrl = buildEventMapUrl("Lenasia, Lenasia Football Stadium");
assert.equal(
  mapUrl,
  "https://www.google.com/maps/search/?api=1&query=Lenasia%2C%20Lenasia%20Football%20Stadium",
);

const osmUrl = buildEventOsmEmbedUrl(-26.181667, 28.027778);
assert.ok(osmUrl.startsWith("https://www.openstreetmap.org/export/embed.html?"));
assert.ok(osmUrl.includes("marker=-26.181667%2C28.027778"));
assert.ok(osmUrl.includes("layer=mapnik"));

/* ─── getEventMapTiles ─────────────────────────────────────────────────── */
const tiles = getEventMapTiles(-26.181667, 28.027778, 15, 128, 128);
assert.ok(tiles.length >= 1 && tiles.length <= 4);
for (const tile of tiles) {
  assert.match(tile.url, /^https:\/\/tile\.openstreetmap\.org\/15\/\d+\/\d+\.png$/);
  assert.equal(typeof tile.left, "number");
  assert.equal(typeof tile.top, "number");
  assert.ok(tile.key.startsWith("15-"));
}

import assert from "node:assert/strict";
import {
  getCalendarCompetitionOptions,
  isFriendlyMatch,
  matchesCompetitionFilter,
} from "./match-competition-filter.ts";

const competitions = [
  { id: "league-1", name: "Spring League", type: "league", season: "2026" },
  { id: "cup-2", name: "Winter Cup", type: "cup" },
  { id: "legacy-friendly", name: "Friendlies", type: "friendly" },
];
const events = [
  { type: "match", competitionId: "league-1" },
  { type: "match", competitionId: "cup-2" },
  { type: "match", competitionId: null },
  { type: "match", competitionId: "legacy-friendly" },
  { type: "training", competitionId: null },
  { type: "meeting", competitionId: null },
];

assert.equal(events.every((event) => matchesCompetitionFilter(event, "all", competitions)), true);
assert.deepEqual(events.filter((event) => matchesCompetitionFilter(event, "friendly", competitions)), [events[2], events[3], events[4], events[5]]);
assert.deepEqual(events.filter((event) => matchesCompetitionFilter(event, "league-1", competitions)), [events[0], events[4], events[5]]);
assert.deepEqual(events.filter((event) => matchesCompetitionFilter(event, "cup-2", competitions)), [events[1], events[4], events[5]]);
assert.equal(isFriendlyMatch(events[2], competitions), true);
assert.equal(isFriendlyMatch(events[0], competitions), false);
assert.deepEqual(getCalendarCompetitionOptions(events, competitions), [
  { value: "league-1", label: "Spring League (2026)" },
  { value: "cup-2", label: "Winter Cup" },
]);
assert.deepEqual(getCalendarCompetitionOptions(events, []), [
  { value: "cup-2", label: "Competition (cup-2)" },
  { value: "league-1", label: "Competition (league-1)" },
  { value: "legacy-friendly", label: "Competition (legacy-f)" },
]);
console.log("[match-competition-filter:node-test] passed");

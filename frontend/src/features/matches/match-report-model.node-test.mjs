import assert from "node:assert/strict";
import {
  busiestInterval,
  cardProgressionMarks,
  chronological,
  eventBreakdownSlices,
  scoreProgressionPoints,
  teamComparisonRows,
  teamEventSplit,
} from "./match-report-chart-stats.ts";
import { matchFacts, matchStory } from "./match-report-model.ts";

const SECOND_YELLOW_DETAIL = "Second yellow card";

function event(overrides) {
  return {
    id: overrides.id ?? "e",
    matchId: "m",
    athleteId: null,
    team: "own",
    opponentLabel: null,
    opponentPlayerId: null,
    eventType: "goal",
    minute: 0,
    detail: null,
    loggedByUserId: "u",
    manuallyAdjusted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    athlete: null,
    opponentPlayer: null,
    ...overrides,
  };
}

const rows = teamComparisonRows([
  event({ id: "y1", eventType: "yellow_card", team: "own", minute: 12 }),
  event({ id: "y2", eventType: "yellow_card", team: "opponent", minute: 40 }),
  event({
    id: "sy",
    eventType: "red_card",
    team: "own",
    minute: 70,
    detail: SECOND_YELLOW_DETAIL,
  }),
  event({ id: "r1", eventType: "red_card", team: "opponent", minute: 88 }),
]);
const yellow = rows.find((row) => row.category === "YELLOW CARDS");
const red = rows.find((row) => row.category === "RED CARDS");
assert.ok(yellow && red);
assert.equal(yellow.own, 1);
assert.equal(yellow.opp, 1);
assert.equal(red.own, 1, "second yellow is stored as red_card");
assert.equal(red.opp, 1);
assert.equal(
  rows.some((row) => row.category === "CARDS"),
  false,
);

const marks = cardProgressionMarks([
  event({ id: "y1", eventType: "yellow_card", minute: 12 }),
  event({
    id: "sy",
    eventType: "red_card",
    minute: 70,
    detail: SECOND_YELLOW_DETAIL,
  }),
]);
assert.deepEqual(
  marks.map((mark) => ({ minute: mark.minute, kind: mark.kind })),
  [
    { minute: 12, kind: "yellow" },
    { minute: 70, kind: "red" },
  ],
);

const split = teamEventSplit([
  event({ id: "1", team: "own" }),
  event({ id: "2", team: "own" }),
  event({ id: "3", team: "opponent" }),
]);
assert.deepEqual(split, { own: 2, opp: 1 });

const tied = busiestInterval([
  event({ id: "a", minute: 41 }),
  event({ id: "b", minute: 49 }),
  event({ id: "c", minute: 12 }),
  event({ id: "d", minute: 18 }),
]);
assert.equal(tied.start, 10);
assert.equal(tied.end, 20);
assert.equal(tied.count, 2);

const extraTime = busiestInterval([event({ id: "et", minute: 93 })]);
assert.equal(extraTime.start, 80);
assert.equal(extraTime.end, 90);

const unordered = chronological([
  event({ id: "late", minute: 60, createdAt: "2026-01-01T00:00:02.000Z" }),
  event({ id: "early", minute: 10, createdAt: "2026-01-01T00:00:00.000Z" }),
  event({
    id: "same-minute-first",
    minute: 60,
    createdAt: "2026-01-01T00:00:01.000Z",
  }),
]);
assert.deepEqual(
  unordered.map((e) => e.id),
  ["early", "same-minute-first", "late"],
  "ties on minute break by createdAt",
);

const { points, endMinute } = scoreProgressionPoints([
  event({ id: "g1", eventType: "goal", team: "own", minute: 20 }),
  event({ id: "g2", eventType: "goal", team: "opponent", minute: 20 }),
  event({ id: "g3", eventType: "goal", team: "own", minute: 75 }),
]);
assert.deepEqual(points, [
  { minute: 0, own: 0, opp: 0 },
  { minute: 20, own: 1, opp: 1 },
  { minute: 75, own: 2, opp: 1 },
  { minute: 90, own: 2, opp: 1 },
]);
assert.equal(endMinute, 90);

const lateWinner = scoreProgressionPoints([
  event({ id: "g1", eventType: "goal", team: "own", minute: 93 }),
]);
assert.equal(
  lateWinner.endMinute,
  93,
  "extra-time goals extend the progression past 90",
);

const breakdown = eventBreakdownSlices([
  event({ id: "g1", eventType: "goal" }),
  event({ id: "g2", eventType: "goal" }),
  event({ id: "y1", eventType: "yellow_card" }),
  event({ id: "s1", eventType: "substitution" }),
]);
assert.equal(breakdown.total, 4);
assert.deepEqual(
  breakdown.slices.map((slice) => slice.name),
  ["Goals", "Cards", "Subs"],
  "zero-value categories (assists, saves) are dropped from the pie slices",
);
assert.equal(breakdown.all.length, 5, "the unfiltered list keeps every category");

const squad = [
  { id: "p1", firstName: "Alex", lastName: "Smith", squadNumber: 9, position: "ST" },
];

assert.equal(
  matchStory({
    ownName: "Riverside FC",
    oppName: "Oakwood FC",
    teamScore: 0,
    oppScore: 0,
    goals: [],
    squad,
  }),
  "Riverside FC and Oakwood FC played out a goalless draw.",
);

assert.equal(
  matchStory({
    ownName: "Riverside FC",
    oppName: "Oakwood FC",
    teamScore: 2,
    oppScore: 2,
    goals: [],
    squad,
  }),
  "Riverside FC and Oakwood FC shared the points in a 2-2 draw.",
);

assert.equal(
  matchStory({
    ownName: "Riverside FC",
    oppName: "Oakwood FC",
    teamScore: 1,
    oppScore: 0,
    goals: [
      event({ id: "g1", eventType: "goal", team: "own", minute: 15, athleteId: "p1" }),
    ],
    squad,
  }),
  "RF struck early through Smith and made it stand up for the full 90 — a disciplined, single-goal win.",
  "an early single-goal winner gets the narrow-win narrative",
);

assert.equal(
  matchStory({
    ownName: "Riverside FC",
    oppName: "Oakwood FC",
    teamScore: 5,
    oppScore: 1,
    goals: [
      event({ id: "g1", eventType: "goal", team: "own", minute: 70, athleteId: "p1" }),
    ],
    squad,
  }),
  "Riverside FC were dominant, running out 5-1 winners.",
  "a margin of 3+ gets the dominant-win narrative regardless of when the first goal fell",
);

assert.equal(
  matchStory({
    ownName: "Riverside FC",
    oppName: "Oakwood FC",
    teamScore: 2,
    oppScore: 1,
    goals: [
      event({ id: "g1", eventType: "goal", team: "own", minute: 60, athleteId: "p1" }),
    ],
    squad,
  }),
  "Riverside FC won 2-1, with Smith opening the scoring.",
  "a late single-goal winner falls back to the generic scorer narrative",
);

const facts = matchFacts([
  event({ id: "g1", eventType: "goal", minute: 30 }),
  event({ id: "y1", eventType: "yellow_card", minute: 12 }),
  event({ id: "s1", eventType: "substitution", minute: 60 }),
  event({ id: "s2", eventType: "substitution", minute: 75 }),
]);
assert.deepEqual(facts, {
  firstGoalMinute: 30,
  firstCardMinute: 12,
  substitutionCount: 2,
  totalEvents: 4,
});

assert.deepEqual(matchFacts([]), {
  firstGoalMinute: null,
  firstCardMinute: null,
  substitutionCount: 0,
  totalEvents: 0,
});

console.log("[match-report-model:charts] passed");

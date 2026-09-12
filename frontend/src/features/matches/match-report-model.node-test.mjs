import assert from "node:assert/strict";
import {
  busiestInterval,
  cardProgressionMarks,
  teamComparisonRows,
  teamEventSplit,
} from "./match-report-chart-stats.ts";

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

console.log("[match-report-model:charts] passed");

import assert from "node:assert/strict";
import {
  linkedAssistsForGoal,
  uniqueTimelineEvents,
} from "./event-visuals.ts";

function sub(overrides) {
  return {
    id: "a",
    matchId: "m1",
    athleteId: "isak",
    team: "own",
    opponentLabel: null,
    opponentPlayerId: null,
    eventType: "substitution",
    minute: 1,
    detail: "vidjak",
    loggedByUserId: "u",
    manuallyAdjusted: false,
    createdAt: "2026-08-29T12:00:00.000Z",
    updatedAt: "2026-08-29T12:00:00.000Z",
    athlete: null,
    opponentPlayer: null,
    ...overrides,
  };
}

const duplicated = uniqueTimelineEvents([
  sub({ id: "optimistic-1", createdAt: "2026-08-29T12:00:00.000Z" }),
  sub({ id: "server-1", createdAt: "2026-08-29T12:00:00.080Z" }),
]);
const duplicatedSubs = duplicated.filter((event) => event.eventType === "substitution");
assert.equal(duplicatedSubs.length, 1);
assert.equal(duplicatedSubs[0].id, "optimistic-1");

const distinct = uniqueTimelineEvents([
  sub({ id: "s1", athleteId: "isak", detail: "vidjak", minute: 1 }),
  sub({
    id: "s2",
    athleteId: null,
    team: "opponent",
    opponentPlayerId: "opp9",
    opponentLabel: "Opponent #9",
    detail: "opp5",
    minute: 2,
  }),
]);
assert.equal(distinct.filter((event) => event.eventType === "substitution").length, 2);

const sameId = uniqueTimelineEvents([
  sub({ id: "dup-id" }),
  sub({ id: "dup-id" }),
]);
assert.equal(sameId.length, 1);

const twoGoals = uniqueTimelineEvents([
  {
    ...sub({ id: "g1", eventType: "goal", detail: null, minute: 20 }),
    eventType: "goal",
  },
  {
    ...sub({ id: "g2", eventType: "goal", detail: null, minute: 20 }),
    eventType: "goal",
  },
]);
assert.equal(twoGoals.filter((event) => event.eventType === "goal").length, 2);

const goal = {
  ...sub({ id: "goal-1", eventType: "goal", detail: null, minute: 20 }),
  eventType: "goal",
};
const linked = {
  ...sub({
    id: "assist-1",
    athleteId: "vidjak",
    eventType: "assist",
    detail: "goal-1",
    minute: 20,
  }),
  eventType: "assist",
};
const other = {
  ...sub({
    id: "assist-2",
    athleteId: "other",
    eventType: "assist",
    detail: "goal-other",
    minute: 20,
  }),
  eventType: "assist",
};
const cascade = linkedAssistsForGoal([goal, linked, other], goal);
assert.equal(cascade.length, 1);
assert.equal(cascade[0].id, "assist-1");
assert.equal(linkedAssistsForGoal([goal, linked], other).length, 0);

const playerEvents = [
  { athleteId: "isak", eventType: "goal" },
  { athleteId: "isak", eventType: "assist" },
  { athleteId: "isak", eventType: "goal" },
  { athleteId: "vidjak", eventType: "goal" },
];
function goalsFor(athleteId, events) {
  return events.filter(
    (event) => event.athleteId === athleteId && event.eventType === "goal",
  ).length;
}
assert.equal(goalsFor("isak", playerEvents), 2);
assert.equal(
  goalsFor(
    "isak",
    playerEvents.filter((event) => event !== playerEvents[0]),
  ),
  1,
);

console.log("[event-visuals:uniqueTimelineEvents] passed", {
  collapsedDuplicateSub: duplicatedSubs.length,
  keptDistinctSubs: distinct.length,
  collapsedSameId: sameId.length,
  keptTwoGoalsSameMinute: twoGoals.length,
  linkedAssistCascade: cascade.length,
});

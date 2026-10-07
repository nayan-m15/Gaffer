import assert from "node:assert/strict";

import {
  effectiveGamePlan,
  placeOwnPlayers,
} from "./live-match-model.ts";

const basePlan = {
  name: "Matchday",
  formationId: "4-3-3",
  assignments: {},
  customPositions: null,
  substituteIds: [],
  defensiveStyle: "balanced",
  defensiveWidth: 5,
  defensiveDepth: 5,
  offensiveStyle: "balanced",
  offensiveWidth: 5,
  playersInBox: 4,
  cornersCommitment: 3,
  freeKicksCommitment: 3,
  captainId: "a1",
  freeKickTakerId: null,
  longFreeKickTakerId: null,
  penaltyTakerId: null,
  cornerTakerId: null,
  rightCornerTakerId: null,
};

let seq = 0;
function change(minute, tacticalChange, overrides = {}) {
  seq += 1;
  return {
    id: `e${seq}`,
    team: "own",
    eventType: "tactical_change",
    minute,
    detail: null,
    athleteId: null,
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    tacticalChange,
    ...overrides,
  };
}

function otherEvent(minute, eventType, extra = {}) {
  seq += 1;
  return {
    id: `o${seq}`,
    team: "own",
    eventType,
    minute,
    detail: null,
    athleteId: null,
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    ...extra,
  };
}

/* ─── No changes ─────────────────────────────────────────────────────────── */

assert.equal(
  effectiveGamePlan(basePlan, []),
  basePlan,
  "with no tactical changes the starting plan is returned untouched",
);
assert.equal(
  effectiveGamePlan(basePlan, [otherEvent(10, "goal")]),
  basePlan,
  "unrelated events do not fold",
);
assert.equal(effectiveGamePlan(undefined, []), undefined);

/* ─── Folding in order ───────────────────────────────────────────────────── */

const folded = effectiveGamePlan(basePlan, [
  change(62, { formationId: "4-4-2", defensiveDepth: 3 }),
  change(30, { defensiveWidth: 8 }),
]);

assert.equal(folded.formationId, "4-4-2", "the later formation wins");
assert.equal(folded.defensiveWidth, 8, "an earlier change still applies");
assert.equal(folded.defensiveDepth, 3);
assert.equal(
  folded.offensiveWidth,
  5,
  "settings nobody changed keep their starting value",
);
assert.equal(basePlan.formationId, "4-3-3", "the starting plan is not mutated");

// Later changes to the same field win regardless of the order they arrive in.
const overwritten = effectiveGamePlan(basePlan, [
  change(80, { formationId: "5-3-2" }),
  change(20, { formationId: "4-4-2" }),
  change(50, { formationId: "4-2-3-1" }),
]);
assert.equal(overwritten.formationId, "5-3-2");

/* ─── Reading the shape at a point in the match ──────────────────────────── */

const timeline = [
  change(25, { formationId: "4-4-2" }),
  change(70, { formationId: "5-3-2" }),
];

assert.equal(effectiveGamePlan(basePlan, timeline, 10).formationId, "4-3-3");
assert.equal(effectiveGamePlan(basePlan, timeline, 25).formationId, "4-4-2");
assert.equal(effectiveGamePlan(basePlan, timeline, 60).formationId, "4-4-2");
assert.equal(effectiveGamePlan(basePlan, timeline, 90).formationId, "5-3-2");

/* ─── Only our own, well-formed tactical changes count ───────────────────── */

assert.equal(
  effectiveGamePlan(basePlan, [
    change(30, { formationId: "4-4-2" }, { team: "opponent" }),
  ]).formationId,
  "4-3-3",
  "an opponent-team row never changes our shape",
);
assert.equal(
  effectiveGamePlan(basePlan, [change(30, null)]).formationId,
  "4-3-3",
  "a tactical_change with no delta is ignored",
);

/* ─── Roles move with no ceremony ────────────────────────────────────────── */

const reassigned = effectiveGamePlan(basePlan, [
  change(55, { captainId: "a7" }),
]);
assert.equal(reassigned.captainId, "a7");
assert.equal(
  reassigned.formationId,
  "4-3-3",
  "handing over the armband changes nothing else",
);

/* ─── A match with no saved plan still folds its changes ─────────────────── */

const planless = effectiveGamePlan(undefined, [
  change(12, { formationId: "4-4-2" }),
]);
assert.equal(planless.formationId, "4-4-2");

/* ─── The folded plan drives the pitch, short-handed included ────────────── */

const squad = [
  { id: "p1", firstName: "A", lastName: "One", position: "GK", squadNumber: 1 },
  { id: "p2", firstName: "B", lastName: "Two", position: "CB", squadNumber: 2 },
  { id: "p3", firstName: "C", lastName: "Three", position: "CB", squadNumber: 3 },
  { id: "p4", firstName: "D", lastName: "Four", position: "CM", squadNumber: 4 },
  { id: "p5", firstName: "E", lastName: "Five", position: "CM", squadNumber: 5 },
  { id: "p6", firstName: "F", lastName: "Six", position: "ST", squadNumber: 6 },
];

// The starting plan names players who are not on the pitch; the shape still
// resolves around whoever is actually out there.
const planWithAbsentees = {
  ...basePlan,
  formationId: "4-3-3",
  assignments: { "433-gk": "p1", "433-cb1": "benched", "433-st": "p6" },
};

const beforeSwitch = placeOwnPlayers(
  squad,
  effectiveGamePlan(planWithAbsentees, []),
  "left",
  [],
);
assert.equal(
  beforeSwitch.length,
  squad.length,
  "every player on the pitch is placed, even with absentees in the plan",
);

const afterSwitch = placeOwnPlayers(
  squad,
  effectiveGamePlan(planWithAbsentees, [change(60, { formationId: "4-4-2" })]),
  "left",
  [],
);
assert.equal(
  afterSwitch.length,
  squad.length,
  "switching formation short-handed places everyone still on the pitch",
);
assert.notDeepEqual(
  afterSwitch.map((p) => [p.athlete.id, p.x, p.y]),
  beforeSwitch.map((p) => [p.athlete.id, p.x, p.y]),
  "the new formation actually moves players",
);
for (const placed of afterSwitch) {
  assert.ok(
    Number.isFinite(placed.x) && Number.isFinite(placed.y),
    `${placed.athlete.id} has a real position`,
  );
}

console.log("effective-game-plan: ok");

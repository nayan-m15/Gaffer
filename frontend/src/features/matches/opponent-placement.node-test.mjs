import assert from "node:assert/strict";
import {
  FORMATIONS,
  getDefaultFormationIdForPlayerCount,
  getFormationOptionsForPlayerCount,
  inferFormationIdFromPositions,
  remapPlayers,
} from "../team-management/formations.ts";

assert.equal(inferFormationIdFromPositions([]), "4-3-3");
assert.equal(
  inferFormationIdFromPositions([
    "GK",
    "LB",
    "CB",
    "CB",
    "RB",
    "LM",
    "CM",
    "CM",
    "RM",
    "ST",
    "ST",
  ]),
  "4-4-2",
);

assert.equal(getDefaultFormationIdForPlayerCount(5), "5v5-1-2-1");
assert.equal(getDefaultFormationIdForPlayerCount(7), "7v7-2-3-1");
assert.equal(getDefaultFormationIdForPlayerCount(11), "4-3-3");
assert.equal(getFormationOptionsForPlayerCount(5).length, 3);
assert.equal(getFormationOptionsForPlayerCount(7).length, 3);
assert.equal(getFormationOptionsForPlayerCount(11).length, 8);

for (const formation of Object.values(FORMATIONS)) {
  assert.equal(
    formation.positions.length,
    formation.playerCount,
    `${formation.id} should expose exactly ${formation.playerCount} pitch slots`,
  );
  assert.equal(
    formation.positions.filter((position) => position.role === "GK").length,
    1,
    `${formation.id} should contain exactly one goalkeeper slot`,
  );
}

assert.equal(
  inferFormationIdFromPositions(["GK", "CB", "LM", "RM", "ST"]),
  "5v5-1-2-1",
);
assert.equal(
  inferFormationIdFromPositions(["GK", "CB", "CB", "LM", "CM", "RM", "ST"]),
  "7v7-2-3-1",
);

const elevenAssignments = Object.fromEntries(
  FORMATIONS["4-3-3"].positions.map((position, index) => [
    position.id,
    `eleven-${index}`,
  ]),
);
const fiveFromEleven = remapPlayers(
  "4-3-3",
  "5v5-1-2-1",
  elevenAssignments,
);
assert.equal(Object.values(fiveFromEleven.assignments).filter(Boolean).length, 5);
assert.equal(fiveFromEleven.overflowToSubs.length, 6);

const stSlot = FORMATIONS["4-3-3"].positions.find((slot) => slot.label === "ST");
assert.equal(stSlot?.x, 50);
assert.equal(stSlot?.y, 14);

const gkSlot = FORMATIONS["4-3-3"].positions.find((slot) => slot.label === "GK");
assert.equal(gkSlot?.x, 50);
assert.equal(gkSlot?.y, 94);

console.log("opponent placement tests passed");

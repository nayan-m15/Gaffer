import assert from "node:assert/strict";
import {
  FORMATIONS,
  inferFormationIdFromPositions,
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

const stSlot = FORMATIONS["4-3-3"].positions.find((slot) => slot.label === "ST");
assert.equal(stSlot?.x, 50);
assert.equal(stSlot?.y, 14);

const gkSlot = FORMATIONS["4-3-3"].positions.find((slot) => slot.label === "GK");
assert.equal(gkSlot?.x, 50);
assert.equal(gkSlot?.y, 94);

console.log("opponent placement tests passed");

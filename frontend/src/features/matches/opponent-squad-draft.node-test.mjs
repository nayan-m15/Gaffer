import assert from "node:assert/strict";
import {
  FORMATIONS,
  remapPlayers,
} from "../team-management/formations.ts";

const fromId = "4-3-3";
const toId = "4-4-2";
const start = {};
FORMATIONS[fromId].positions.forEach((pos, i) => {
  start[pos.id] = String(10 + i);
});
const players = FORMATIONS[fromId].positions.map((pos, i) => ({
  shirtNumber: 10 + i,
  name: `P${10 + i}`,
  position: pos.label,
}));

const { assignments, overflowToSubs } = remapPlayers(fromId, toId, start);
const taken = new Set(
  Object.values(assignments)
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10)),
);
const bench = players.filter((player) => !taken.has(player.shirtNumber));
const emptySlots = FORMATIONS[toId].positions.filter(
  (pos) => !assignments[pos.id],
);

assert.equal(players.length, 11, "squad list is unchanged");
assert.equal(overflowToSubs.length, 1, "one overflow shirt");
assert.equal(bench.length, 1, "overflow is unassigned, not deleted");
assert.equal(emptySlots.length, 1, "gained-role slot stays empty");
assert.equal(emptySlots[0].label, "RM");
assert.equal(Object.values(assignments).filter(Boolean).length, 10);
assert.ok(
  !taken.has(Number.parseInt(overflowToSubs[0], 10)),
  "overflow shirt is not placed in another role",
);

console.log("[opponent-squad-draft:remap] passed", {
  remainingOnPitch: 10,
  benchShirts: bench.map((player) => player.shirtNumber),
  emptySlot: emptySlots[0].label,
});

import assert from "node:assert/strict";
import {
  FORMATIONS,
  createCustomPositionsFromFormation,
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
assert.equal(getFormationOptionsForPlayerCount(5).length, 4);
assert.equal(getFormationOptionsForPlayerCount(7).length, 4);
assert.equal(getFormationOptionsForPlayerCount(11).length, 9);

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


const fourFourTwoAssignments = Object.fromEntries(
  FORMATIONS["4-4-2"].positions.map((position, index) => [
    position.id,
    `custom-${index}`,
  ]),
);
const editableFourFourTwo = createCustomPositionsFromFormation(
  FORMATIONS["4-4-2"],
);
const customFromFourFourTwo = remapPlayers(
  "4-4-2",
  "custom-11",
  fourFourTwoAssignments,
  null,
  editableFourFourTwo,
);
assert.equal(
  Object.values(customFromFourFourTwo.assignments).filter(Boolean).length,
  11,
);
assert.deepEqual(customFromFourFourTwo.overflowToSubs, []);
assert.deepEqual(
  editableFourFourTwo.find((position) => position.role === "GK"),
  { id: "custom-11-gk", label: "GK", role: "GK", x: 50, y: 94 },
);

const stSlot = FORMATIONS["4-3-3"].positions.find((slot) => slot.label === "ST");
assert.equal(stSlot?.x, 50);
assert.equal(stSlot?.y, 14);

const gkSlot = FORMATIONS["4-3-3"].positions.find((slot) => slot.label === "GK");
assert.equal(gkSlot?.x, 50);
assert.equal(gkSlot?.y, 94);

console.log("opponent placement tests passed");

const { friendlyLineupPlayers, publicOpponentTimeline, opponentPitchState } = await import("./live-match-model.ts");
const publicPlayers = friendlyLineupPlayers({ available: true, source: "confirmed", formation: "4-3-3", starters: [{ name: "Public Starter", shirtNumber: 9, slotId: "ST" }], bench: [{ name: "Public Sub", shirtNumber: null }] });
const publicTimeline = publicOpponentTimeline([{ team: "opponent", eventType: "substitution", opponentPlayerId: null, opponentLabel: "#9 Public Starter", detail: "Public Sub", minute: 10, createdAt: "now" }], publicPlayers);
const publicState = opponentPitchState(publicPlayers, publicTimeline, new Set([publicPlayers[0].id]));
assert.equal(publicState.onPitch[0].name, "Public Sub");
assert.equal(publicState.bench[0].name, "Public Starter");

const { opponentEventAttribution, opponentSubstitutionDetail } = await import("./live-match-model.ts");
assert.deepEqual(opponentEventAttribution(publicPlayers[0]), { opponentPlayerId: undefined, opponentLabel: "#9 Public Starter" });
assert.equal(opponentSubstitutionDetail(publicPlayers[1]), "Public Sub");
assert.equal(opponentEventAttribution({ id: "manual-row", name: "Manual", shirtNumber: 4 }).opponentPlayerId, "manual-row");
assert.equal(publicState.onPitch[0].publicLineup.slotId, "ST");

import assert from "node:assert/strict";
import {
  DEFAULT_FORMATION_ID,
  FORMATIONS,
  autoFillFormation,
  getDefaultFormationIdForPlayerCount,
  getFormationOptionsForPlayerCount,
  getFormationPlayerCount,
  getPositionRole,
  inferFormationIdFromPositions,
  isCustomFormationId,
  previewAssignmentsForStarters,
  remapPlayers,
  resolveFormation,
} from "./formations.ts";

/* ─── getPositionRole ────────────────────────────────────────────────── */

assert.equal(getPositionRole("cb"), "DEF", "lookup is case-insensitive");
assert.equal(getPositionRole("CAM"), "MID");
assert.equal(getPositionRole("ST"), "FWD");
assert.equal(getPositionRole("GK"), "GK");
assert.equal(getPositionRole("not-a-position"), null);
assert.equal(getPositionRole(null), null);
assert.equal(getPositionRole(undefined), null);

/* ─── formation lookup helpers ───────────────────────────────────────── */

assert.equal(getFormationPlayerCount("4-3-3"), 11);
assert.equal(getFormationPlayerCount("7v7-2-3-1"), 7);
assert.equal(
  getFormationPlayerCount("unknown-formation"),
  11,
  "unknown ids default to 11-a-side",
);

assert.equal(getDefaultFormationIdForPlayerCount(5), "5v5-1-2-1");
assert.equal(getDefaultFormationIdForPlayerCount(7), "7v7-2-3-1");
assert.equal(getDefaultFormationIdForPlayerCount(11), "4-3-3");

const sevenASideOptions = getFormationOptionsForPlayerCount(7);
assert.ok(sevenASideOptions.every((option) => option.playerCount === 7));
assert.ok(sevenASideOptions.some((option) => option.value === "custom-7"));

/* ─── isCustomFormationId ────────────────────────────────────────────── */

assert.equal(isCustomFormationId("custom-11"), true);
assert.equal(isCustomFormationId("4-3-3"), false);
assert.equal(isCustomFormationId(null), false);
assert.equal(isCustomFormationId(undefined), false);

/* ─── resolveFormation ───────────────────────────────────────────────── */

assert.equal(
  resolveFormation("4-3-3").id,
  "4-3-3",
  "a built-in formation resolves to itself",
);
assert.equal(
  resolveFormation(null).id,
  DEFAULT_FORMATION_ID,
  "a missing id falls back to the default formation",
);
assert.equal(
  resolveFormation("does-not-exist").id,
  DEFAULT_FORMATION_ID,
  "an unknown id falls back to the default formation",
);

const baseCustom11 = FORMATIONS["custom-11"];
const validCustomPositions = baseCustom11.positions.map((position) => ({
  ...position,
  // Nudge every outfield slot two percentage points right; still valid
  // (same ids, same count) so the resolver should honour these coordinates.
  x: position.role === "GK" ? position.x : position.x + 2,
}));
const resolvedCustom = resolveFormation("custom-11", validCustomPositions);
assert.deepEqual(
  resolvedCustom.positions.find((p) => p.role !== "GK").x,
  validCustomPositions.find((p) => p.role !== "GK").x,
  "valid saved coordinates are applied to non-GK slots",
);
const resolvedGk = resolvedCustom.positions.find((p) => p.role === "GK");
assert.equal(resolvedGk.x, 50);
assert.equal(resolvedGk.y, 94, "the goalkeeper slot is always pinned to its default spot");

assert.equal(
  resolveFormation("custom-11", []).id,
  "custom-11",
  "an empty/mismatched custom array falls back to the neutral custom shape",
);
assert.deepEqual(
  resolveFormation("custom-11", []).positions,
  baseCustom11.positions,
);

const mismatchedIds = baseCustom11.positions.map((position, index) => ({
  ...position,
  id: `unrelated-${index}`,
}));
assert.deepEqual(
  resolveFormation("custom-11", mismatchedIds).positions,
  baseCustom11.positions,
  "custom positions with foreign ids are rejected",
);

/* ─── inferFormationIdFromPositions ──────────────────────────────────── */

assert.equal(
  inferFormationIdFromPositions([]),
  DEFAULT_FORMATION_ID,
  "no labels at all falls back to the overall default",
);

const fourFourTwoLabels = FORMATIONS["4-4-2"].positions.map((p) => p.label);
assert.equal(inferFormationIdFromPositions(fourFourTwoLabels), "4-4-2");

assert.equal(
  inferFormationIdFromPositions(["gk", "lb", "cb", "cb", "rb", "lm", "cm", "cm", "rm", "st", "st"]),
  "4-4-2",
  "matching is case-insensitive",
);

const fiveASideLabels = FORMATIONS["5v5-2-1-1"].positions.map((p) => p.label);
assert.equal(
  inferFormationIdFromPositions(fiveASideLabels),
  "5v5-2-1-1",
  "a 5-player list is only matched against 5-a-side formations",
);

/* ─── remapPlayers ────────────────────────────────────────────────────── */

const fourThreeThreeAssignments = {};
for (const position of FORMATIONS["4-3-3"].positions) {
  fourThreeThreeAssignments[position.id] = `athlete-${position.id}`;
}

const { assignments: remapped, overflowToSubs } = remapPlayers(
  "4-3-3",
  "4-4-2",
  fourThreeThreeAssignments,
);
// 4-3-3 has 3 FWDs, 4-4-2 only has 2 FWD slots -> exactly one FWD overflows.
assert.equal(overflowToSubs.length, 1);
const gkSlot = FORMATIONS["4-4-2"].positions.find((p) => p.role === "GK");
assert.equal(
  remapped[gkSlot.id],
  fourThreeThreeAssignments[FORMATIONS["4-3-3"].positions.find((p) => p.role === "GK").id],
  "the goalkeeper is preserved across the formation change",
);
const filledSlots = Object.values(remapped).filter(Boolean).length;
assert.equal(filledSlots, FORMATIONS["4-4-2"].positions.length - 1);

const { overflowToSubs: emptyOverflow } = remapPlayers("4-3-3", "4-4-2", {});
assert.deepEqual(emptyOverflow, [], "remapping an empty lineup overflows nobody");

/* ─── autoFillFormation ───────────────────────────────────────────────── */

const positionById = {
  gk1: "GK",
  cb1: "CB",
  cb2: "CB",
  lb1: "LB",
  st1: "ST",
  // 4-3-3 has no slot literally labelled "DM" — this only lands via the
  // role-fallback pass (DM maps to MID in POSITION_ROLE_MAP).
  dm1: "DM",
  // Matches no label and no known role at all, so it can only end up
  // on the bench.
  unmatched1: "ZZ",
};
const athleteIds = Object.keys(positionById);
const filled = autoFillFormation("4-3-3", athleteIds, (id) => positionById[id] ?? null);

const gkPositionId = FORMATIONS["4-3-3"].positions.find((p) => p.role === "GK").id;
assert.equal(filled.assignments[gkPositionId], "gk1", "exact GK label matches first");

const lbPositionId = FORMATIONS["4-3-3"].positions.find((p) => p.label === "LB").id;
assert.equal(filled.assignments[lbPositionId], "lb1", "exact position label wins pass 1");

const filledAthletes = new Set(Object.values(filled.assignments).filter(Boolean));
assert.ok(filledAthletes.has("dm1"), "role fallback (pass 2) places the DM into a MID slot");
assert.deepEqual(
  filled.substituteIds,
  ["unmatched1"],
  "an athlete matching no label and no role lands on the bench",
);
assert.equal(
  filled.substituteIds.length + filledAthletes.size,
  athleteIds.length,
);

const unrankedFill = autoFillFormation("4-3-3", ["ghost"], () => "UNKNOWN-ROLE");
assert.deepEqual(
  unrankedFill.substituteIds,
  ["ghost"],
  "an athlete whose position matches no slot or role stays on the bench",
);

/* ─── previewAssignmentsForStarters ──────────────────────────────────── */

const starterIds = FORMATIONS["4-3-3"].positions.map((p) => `s-${p.id}`);
const preferred = {};
for (const position of FORMATIONS["4-3-3"].positions) {
  preferred[position.id] = `s-${position.id}`;
}
const preview = previewAssignmentsForStarters(
  "4-3-3",
  starterIds,
  () => null,
  preferred,
);
assert.deepEqual(
  preview,
  preferred,
  "saved slots are reused verbatim when every starter is still a starter",
);

const previewNoSavedSlots = previewAssignmentsForStarters(
  "4-3-3",
  starterIds,
  (id) => {
    const positionId = id.replace(/^s-/, "");
    return FORMATIONS["4-3-3"].positions.find((p) => p.id === positionId)?.label ?? null;
  },
);
assert.deepEqual(
  new Set(Object.values(previewNoSavedSlots)),
  new Set(starterIds),
  "with no saved plan, every starter still lands on the pitch via label matching",
);

console.log("[formations:node-test] passed");

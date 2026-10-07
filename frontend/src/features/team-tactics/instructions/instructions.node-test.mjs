import assert from "node:assert/strict";
import test from "node:test";

import { FORMATIONS } from "../../team-management/formations.ts";
import {
  categoriesForSlot,
  customCount,
  defaultOptionId,
  optionsForGroup,
  reconcilePlayerInstructions,
  resolveInstructions,
  withInstruction,
  withPlayerInstructions,
} from "./instructionDefaults.ts";
import { PLAYER_INSTRUCTION_DEFINITIONS } from "./instructionDefinitions.ts";
import { detectConflicts } from "./instructionCompatibility.ts";
import { instructionSummaryPhrases } from "./instructionSummary.ts";
import { positionGroupForSlot, slotContext } from "./positionGroups.ts";

/** The slot carrying `label` in a formation, plus its context. */
function contextFor(formationId, label, index = 0) {
  const formation = FORMATIONS[formationId];
  const matches = formation.positions.filter((slot) => slot.label === label);
  assert.ok(matches[index], `${formationId} has no ${label}#${index}`);
  return slotContext(matches[index], formation);
}

function categoryIds(context) {
  return categoriesForSlot(context).map((category) => category.id);
}

/* ─── Position → categories ─────────────────────────────────────────────── */

test("each position is offered the cards the plan specifies", () => {
  assert.deepEqual(categoryIds(contextFor("4-3-3", "GK")), [
    "starting_position",
    "distribution",
    "crosses",
  ]);

  assert.deepEqual(categoryIds(contextFor("4-2-3-1", "CAM")), [
    "defensive_support",
    "attacking_movement",
    "positioning_freedom",
    "chance_creation",
    "defensive_positioning",
    "box_presence",
  ]);

  assert.deepEqual(categoryIds(contextFor("4-3-3", "LB")), [
    "attacking_support",
    "run_type",
    "defensive_approach",
    "width",
    "crossing_position",
  ]);

  assert.deepEqual(categoryIds(contextFor("4-3-3", "ST")), [
    "attacking_runs",
    "positioning",
    "defensive_support",
    "link_up_play",
    "penalty_area_behaviour",
  ]);

  assert.deepEqual(categoryIds(contextFor("4-3-3", "LW")), [
    "defensive_support",
    "width",
    "attacking_runs",
    "final_third_movement",
    "box_presence",
    "pressing",
  ]);
});

test("card counts stay inside the plan's recommended range", () => {
  const expected = {
    GK: [3, 3],
    CB: [3, 4],
    FB: [5, 5],
    WB: [5, 5],
    DM: [5, 5],
    CM: [5, 5],
    AM: [6, 6],
    WIDE: [6, 6],
    ST: [5, 5],
  };

  for (const formation of Object.values(FORMATIONS)) {
    for (const slot of formation.positions) {
      const context = slotContext(slot, formation);
      const count = categoriesForSlot(context).length;
      const [min, max] = expected[context.group];
      assert.ok(
        count >= min && count <= max,
        `${formation.id} ${slot.label} (${context.group}) offered ${count} cards`,
      );
    }
  }
});

test("wide cover is only offered to the outside defenders of a back three", () => {
  // 3-5-2 plays a back three: its outside centre-backs cover the channel.
  const backThree = FORMATIONS["3-5-2"].positions.filter(
    (slot) => positionGroupForSlot(slot) === "CB",
  );
  assert.equal(backThree.length, 3);

  const sorted = [...backThree].sort((a, b) => a.x - b.x);
  const wide = slotContext(sorted[0], FORMATIONS["3-5-2"]);
  const middle = slotContext(sorted[1], FORMATIONS["3-5-2"]);

  assert.ok(categoryIds(wide).includes("wide_cover"));
  assert.ok(!categoryIds(middle).includes("wide_cover"));

  // A back four never gets the card at all.
  assert.ok(!categoryIds(contextFor("4-3-3", "CB")).includes("wide_cover"));
});

test("a custom formation's slot is read from where it sits on the pitch", () => {
  const custom = {
    id: "custom-11",
    name: "Custom",
    playerCount: 11,
    positions: [
      { id: "custom-11-gk", label: "GK", role: "GK", x: 50, y: 94 },
      { id: "custom-11-1", label: "DEF", role: "DEF", x: 10, y: 74 },
      { id: "custom-11-2", label: "DEF", role: "DEF", x: 50, y: 78 },
      { id: "custom-11-3", label: "MID", role: "MID", x: 50, y: 62 },
      { id: "custom-11-4", label: "MID", role: "MID", x: 50, y: 30 },
      { id: "custom-11-5", label: "FWD", role: "FWD", x: 88, y: 20 },
      { id: "custom-11-6", label: "FWD", role: "FWD", x: 50, y: 14 },
    ],
  };

  const group = (index) => positionGroupForSlot(custom.positions[index]);
  assert.equal(group(0), "GK");
  assert.equal(group(1), "FB", "a defender on the touchline is a full-back");
  assert.equal(group(2), "CB");
  assert.equal(group(3), "DM", "a midfielder in front of his own box holds");
  assert.equal(group(4), "AM");
  assert.equal(group(5), "WIDE");
  assert.equal(group(6), "ST");
});

/* ─── Position → defaults ───────────────────────────────────────────────── */

test("defaults follow the position, not the category", () => {
  const attackingSupport = PLAYER_INSTRUCTION_DEFINITIONS.attacking_support;
  assert.equal(defaultOptionId(attackingSupport, "FB"), "balanced");
  assert.equal(defaultOptionId(attackingSupport, "WB"), "join_attack");
  assert.equal(defaultOptionId(attackingSupport, "CM"), "balanced");

  const defensiveSupport = PLAYER_INSTRUCTION_DEFINITIONS.defensive_support;
  assert.equal(defaultOptionId(defensiveSupport, "AM"), "balanced");
  assert.equal(defaultOptionId(defensiveSupport, "ST"), "stay_forward");
});

test("every default is an option the position is actually offered", () => {
  for (const category of Object.values(PLAYER_INSTRUCTION_DEFINITIONS)) {
    for (const group of category.groups) {
      const options = optionsForGroup(category, group).map((o) => o.id);
      assert.ok(
        options.includes(defaultOptionId(category, group)),
        `${category.id} has no valid default for ${group}`,
      );
      assert.ok(options.length >= 2, `${category.id}/${group} has one option`);
    }
  }
});

test("option IDs are unique within a category and groups are declared", () => {
  for (const [id, category] of Object.entries(PLAYER_INSTRUCTION_DEFINITIONS)) {
    assert.equal(category.id, id, "registry key must match the category ID");
    const ids = category.options.map((option) => option.id);
    assert.equal(new Set(ids).size, ids.length, `${id} repeats an option ID`);
    for (const option of category.options) {
      for (const group of option.groups ?? []) {
        assert.ok(
          category.groups.includes(group),
          `${id}/${option.id} is scoped to ${group}, which the category excludes`,
        );
      }
    }
  }
});

test("a player left alone reads as all defaults", () => {
  const context = contextFor("4-2-3-1", "CAM");
  const resolved = resolveInstructions(context, undefined);
  assert.ok(resolved.every((entry) => entry.source === "default"));
  assert.equal(customCount(context, undefined), 0);
});

/* ─── Choosing and clearing ─────────────────────────────────────────────── */

test("choosing an option marks the card custom", () => {
  const context = contextFor("4-2-3-1", "CAM");
  const stored = withInstruction(
    undefined,
    context,
    "positioning_freedom",
    "free_roam",
  );
  assert.deepEqual(stored, { positioning_freedom: "free_roam" });

  const resolved = resolveInstructions(context, stored);
  const card = resolved.find((e) => e.category.id === "positioning_freedom");
  assert.equal(card.selected.label, "Free Roam");
  assert.equal(card.source, "custom");
  assert.equal(customCount(context, stored), 1);
});

test("choosing the option that was already the default stores nothing", () => {
  const context = contextFor("4-2-3-1", "CAM");
  const stored = withInstruction(
    { positioning_freedom: "free_roam" },
    context,
    "positioning_freedom",
    "stick_to_position",
  );
  assert.deepEqual(stored, {}, "the default is an absence, not an entry");
});

test("resetting a player drops them from the plan entirely", () => {
  const all = { a: { positioning_freedom: "free_roam" }, b: { crosses: "claim_crosses" } };
  assert.deepEqual(withPlayerInstructions(all, "a", {}), {
    b: { crosses: "claim_crosses" },
  });
});

/* ─── Reconciliation ────────────────────────────────────────────────────── */

const WINGER_PLAN = {
  formationId: "4-3-3",
  slot: "433-lw",
  instructions: {
    p1: {
      final_third_movement: "cut_inside",
      width: "come_inside",
      pressing: "aggressive_press",
    },
  },
};

test("moving a player keeps the instructions that still apply", () => {
  // Right wing in a 4-3-3 becomes a left wing-back in a 3-5-2: `width` still
  // exists for a wing-back, but `come_inside` is a winger's option, and
  // `pressing` and `final_third_movement` are not asked of a wing-back.
  const formation = FORMATIONS["3-5-2"];
  const wingBack = formation.positions.find((slot) => slot.label === "LWB");
  const result = reconcilePlayerInstructions({
    instructions: {
      p1: {
        ...WINGER_PLAN.instructions.p1,
        defensive_support: "come_back",
      },
    },
    formation,
    assignments: { [wingBack.id]: "p1" },
    knownAthleteIds: new Set(["p1"]),
  });

  assert.ok(result.changed);
  assert.deepEqual(result.changedAthleteIds, ["p1"]);
  assert.deepEqual(result.instructions, {}, "nothing a wing-back is asked survives");
});

test("an instruction the new position still asks about is kept", () => {
  const formation = FORMATIONS["3-5-2"];
  const wingBack = formation.positions.find((slot) => slot.label === "LWB");
  const result = reconcilePlayerInstructions({
    instructions: { p1: { width: "hold_width", pressing: "aggressive_press" } },
    formation,
    assignments: { [wingBack.id]: "p1" },
    knownAthleteIds: new Set(["p1"]),
  });

  assert.deepEqual(result.instructions, { p1: { width: "hold_width" } });
});

test("a settled lineup reconciles to itself", () => {
  const formation = FORMATIONS["4-3-3"];
  const instructions = { p1: { final_third_movement: "cut_inside" } };
  const result = reconcilePlayerInstructions({
    instructions,
    formation,
    assignments: { [WINGER_PLAN.slot]: "p1" },
    knownAthleteIds: new Set(["p1"]),
  });

  assert.equal(result.changed, false);
  assert.equal(result.instructions, instructions, "the same object, not a copy");
});

test("a substitute keeps their instructions until they start again", () => {
  const formation = FORMATIONS["4-3-3"];
  const result = reconcilePlayerInstructions({
    instructions: { p1: { final_third_movement: "cut_inside" } },
    formation,
    assignments: {},
    knownAthleteIds: new Set(["p1"]),
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.instructions.p1, { final_third_movement: "cut_inside" });
});

test("a player who has left the roster is dropped", () => {
  const result = reconcilePlayerInstructions({
    instructions: { gone: { crosses: "claim_crosses" } },
    formation: FORMATIONS["4-3-3"],
    assignments: {},
    knownAthleteIds: new Set(["someone-else"]),
  });

  assert.ok(result.changed);
  assert.deepEqual(result.instructions, {});
});

/* ─── Conflicts ─────────────────────────────────────────────────────────── */

test("a player on their defaults is never warned", () => {
  for (const formation of Object.values(FORMATIONS)) {
    for (const slot of formation.positions) {
      const context = slotContext(slot, formation);
      const conflicts = detectConflicts(
        context.group,
        resolveInstructions(context, undefined),
      );
      assert.deepEqual(
        conflicts,
        [],
        `${formation.id} ${slot.label} warns about its own defaults`,
      );
    }
  }
});

test("contradictory instructions raise a warning on both cards", () => {
  const context = contextFor("4-3-3", "LW");
  const stored = { width: "hold_width", final_third_movement: "cut_inside" };
  const conflicts = detectConflicts(
    context.group,
    resolveInstructions(context, stored),
  );

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].severity, "strong_warning");
  assert.deepEqual(conflicts[0].categoryIds.sort(), [
    "final_third_movement",
    "width",
  ]);
});

test("a conflict rule does not fire outside its own position", () => {
  // `stay_back` + `reach_byline` is a full-back's conflict; a centre-back is
  // never offered either card, so nothing fires.
  const context = contextFor("4-3-3", "CB");
  const conflicts = detectConflicts(
    context.group,
    resolveInstructions(context, {
      defensive_aggression: "step_up",
      marking: "tight_mark",
    }),
  );
  assert.deepEqual(conflicts, []);
});

test("the plan's full-back example is flagged", () => {
  const context = contextFor("4-3-3", "LB");
  const conflicts = detectConflicts(
    context.group,
    resolveInstructions(context, {
      attacking_support: "stay_back",
      crossing_position: "reach_byline",
    }),
  );
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].message, /byline/i);
});

/* ─── Summary ───────────────────────────────────────────────────────────── */

test("the summary leads with what the coach chose", () => {
  const context = contextFor("4-2-3-1", "CAM");
  const phrases = instructionSummaryPhrases(
    resolveInstructions(context, {
      positioning_freedom: "free_roam",
      chance_creation: "creative_playmaker",
      defensive_support: "stay_forward",
    }),
  );

  assert.deepEqual(phrases, ["Stays high", "Free-roaming", "Creator"]);
});

test("a player on every default has little or nothing to summarise", () => {
  const context = contextFor("4-2-3-1", "CAM");
  assert.deepEqual(instructionSummaryPhrases(resolveInstructions(context, undefined)), []);
});

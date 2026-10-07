/**
 * Instruction combinations that pull a player in two directions at once.
 *
 * These are warnings, not rules: a coach who wants a full-back who stays home
 * but still gets to the byline on the counter is allowed to ask for it. The
 * screen says what the tension is and leaves the decision alone.
 *
 * Kept deliberately short. A warning on every other card teaches coaches to
 * ignore warnings, so only genuine contradictions earn one.
 */

import type { PositionGroup, ResolvedInstruction } from "./instructionTypes";

export type ConflictSeverity = "info" | "warning" | "strong_warning";

interface ConflictRule {
  id: string;
  /** Limits the rule to certain kinds of player; omitted means all of them. */
  groups?: PositionGroup[];
  /** Every category/option pair that must be in force for the rule to fire. */
  when: Record<string, string>;
  severity: ConflictSeverity;
  message: string;
}

export interface InstructionConflict {
  id: string;
  severity: ConflictSeverity;
  message: string;
  /** The cards involved, so each can show the warning. */
  categoryIds: string[];
}

const CONFLICT_RULES: ConflictRule[] = [
  {
    id: "stay_back_reach_byline",
    groups: ["FB", "WB"],
    when: { attacking_support: "stay_back", crossing_position: "reach_byline" },
    severity: "warning",
    message:
      "Reaching the byline conflicts with the instruction to stay behind the ball.",
  },
  {
    id: "stay_back_overlap",
    groups: ["FB", "WB"],
    when: { attacking_support: "stay_back", run_type: "overlap" },
    severity: "warning",
    message:
      "He cannot overlap the winger while he is being asked to stay behind the ball.",
  },
  {
    id: "hold_width_cut_inside",
    groups: ["WIDE"],
    when: { width: "hold_width", final_third_movement: "cut_inside" },
    severity: "strong_warning",
    message:
      "Holding the touchline and cutting inside are opposite instructions — pick the one that matters more.",
  },
  {
    id: "come_inside_attack_byline",
    groups: ["WIDE"],
    when: { width: "come_inside", final_third_movement: "attack_byline" },
    severity: "strong_warning",
    message:
      "He is being asked to start in the half-space and finish on the byline; one of the two will not happen.",
  },
  {
    id: "run_behind_hold_up",
    groups: ["ST"],
    when: { attacking_runs: "run_in_behind", link_up_play: "hold_up_ball" },
    severity: "warning",
    message:
      "Running in behind leaves nobody to hold the ball up — the team will play past him, not into him.",
  },
  {
    id: "come_short_far_post",
    groups: ["ST"],
    when: {
      attacking_runs: "come_short",
      penalty_area_behaviour: "attack_far_post",
    },
    severity: "info",
    message:
      "Dropping toward the ball means he will often be outside the box when the cross comes in.",
  },
  {
    id: "stay_back_attack_box",
    groups: ["CM"],
    when: { attacking_support: "stay_back", box_support: "attack_box" },
    severity: "warning",
    message:
      "He cannot get into the penalty area while he is being held behind the ball.",
  },
  {
    id: "drop_between_join_late",
    groups: ["DM"],
    when: {
      defensive_duty: "drop_between_centre_backs",
      counter_attack: "join_late",
    },
    severity: "warning",
    message:
      "A player who drops into the back line will be too deep to join the counter.",
  },
  {
    id: "sweeper_stay_on_line",
    groups: ["GK"],
    when: { starting_position: "sweeper_keeper", crosses: "stay_on_line" },
    severity: "warning",
    message:
      "A sweeper keeper who will not leave his line gives up the main advantage of starting high.",
  },
  {
    id: "hold_position_track_forward",
    groups: ["CB"],
    when: { defensive_aggression: "hold_position", marking: "track_forward" },
    severity: "warning",
    message:
      "Tracking his forward out of the line is exactly what holding position is meant to prevent.",
  },
  {
    id: "press_front_screen_lanes",
    groups: ["AM"],
    when: {
      defensive_support: "press_from_front",
      defensive_positioning: "screen_passing_lanes",
    },
    severity: "warning",
    message:
      "Pressing the first pass and standing in the passing lane ask for opposite behaviour.",
  },
];

/**
 * The conflicts in force for one player.
 *
 * Measured against what the player will actually do, defaults included, rather
 * than only the cards the coach has touched — a default can sit just as badly
 * against a choice as two choices can against each other.
 */
export function detectConflicts(
  group: PositionGroup,
  resolved: ResolvedInstruction[],
): InstructionConflict[] {
  const inForce = new Map(
    resolved.map((entry) => [entry.category.id, entry.selected.id]),
  );

  const conflicts: InstructionConflict[] = [];
  for (const rule of CONFLICT_RULES) {
    if (rule.groups && !rule.groups.includes(group)) continue;

    const pairs = Object.entries(rule.when);
    const applies = pairs.every(
      ([categoryId, optionId]) => inForce.get(categoryId) === optionId,
    );
    if (!applies) continue;

    conflicts.push({
      id: rule.id,
      severity: rule.severity,
      message: rule.message,
      categoryIds: pairs.map(([categoryId]) => categoryId),
    });
  }

  return conflicts;
}

/** The conflicts touching one card, for the warning shown on it. */
export function conflictsForCategory(
  conflicts: InstructionConflict[],
  categoryId: string,
): InstructionConflict[] {
  return conflicts.filter((conflict) =>
    conflict.categoryIds.includes(categoryId),
  );
}

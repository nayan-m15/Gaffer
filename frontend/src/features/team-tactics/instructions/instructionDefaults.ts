/**
 * Reading the registry for one player: which cards they are offered, which
 * option each card is currently showing, and what happens when their position
 * changes under them.
 *
 * Only overrides are stored. A category missing from a player's map means they
 * are on the default for their position, so a saved game plan carries the
 * coach's decisions and nothing else — and resetting a player is a delete, not
 * a rewrite. Choosing the option that is already the default therefore clears
 * the entry rather than storing it, which keeps "Custom" meaning what it says.
 */

import type { Formation } from "@/features/team-management/types";
import {
  GROUP_CARD_ORDER,
  PLAYER_INSTRUCTION_DEFINITIONS,
} from "./instructionDefinitions.ts";
import type {
  InstructionCategory,
  InstructionOption,
  PlayerInstructions,
  PlayerInstructionsByAthlete,
  PositionGroup,
  ResolvedInstruction,
} from "./instructionTypes";
import { slotContext, type SlotContext } from "./positionGroups.ts";

/** The categories a player in this slot is asked about, in display order. */
export function categoriesForSlot(context: SlotContext): InstructionCategory[] {
  return GROUP_CARD_ORDER[context.group]
    .map((id) => PLAYER_INSTRUCTION_DEFINITIONS[id])
    .filter((category): category is InstructionCategory => {
      if (!category) return false;
      if (!category.groups.includes(context.group)) return false;
      if (category.only === "wide_centre_back" && !context.wideCentreBack) {
        return false;
      }
      return true;
    });
}

/** True when this category is one the given slot may carry at all. */
export function categoryAppliesToSlot(
  categoryId: string,
  context: SlotContext,
): boolean {
  return categoriesForSlot(context).some(
    (category) => category.id === categoryId,
  );
}

/** The options a given kind of player may pick from, in registry order. */
export function optionsForGroup(
  category: InstructionCategory,
  group: PositionGroup,
): InstructionOption[] {
  return category.options.filter(
    (option) => !option.groups || option.groups.includes(group),
  );
}

/** The option a player falls back to when the coach has not chosen one. */
export function defaultOptionId(
  category: InstructionCategory,
  group: PositionGroup,
): string {
  return category.groupDefaults?.[group] ?? category.defaultOptionId;
}

/**
 * Everything one player's cards need: the category, the options open to them,
 * the option in force, and whether that is the coach's choice or the default.
 */
export function resolveInstructions(
  context: SlotContext,
  stored: PlayerInstructions | undefined,
): ResolvedInstruction[] {
  return categoriesForSlot(context).map((category) => {
    const options = optionsForGroup(category, context.group);
    const fallbackId = defaultOptionId(category, context.group);
    const chosenId = stored?.[category.id];
    const chosen = chosenId
      ? options.find((option) => option.id === chosenId)
      : undefined;
    const fallback =
      options.find((option) => option.id === fallbackId) ?? options[0];

    return {
      category,
      options,
      selected: chosen ?? fallback,
      source: chosen && chosen.id !== fallback.id ? "custom" : "default",
    };
  });
}

/**
 * The player's map after choosing an option. Picking what they were already
 * doing by default removes the entry instead of storing it.
 */
export function withInstruction(
  stored: PlayerInstructions | undefined,
  context: SlotContext,
  categoryId: string,
  optionId: string,
): PlayerInstructions {
  const category = PLAYER_INSTRUCTION_DEFINITIONS[categoryId];
  const next = { ...(stored ?? {}) };

  if (category && optionId === defaultOptionId(category, context.group)) {
    delete next[categoryId];
  } else {
    next[categoryId] = optionId;
  }

  return next;
}

/** Writes one player's map back into the plan, dropping it when it is empty. */
export function withPlayerInstructions(
  all: PlayerInstructionsByAthlete,
  athleteId: string,
  instructions: PlayerInstructions,
): PlayerInstructionsByAthlete {
  const next = { ...all };
  if (Object.keys(instructions).length === 0) {
    delete next[athleteId];
  } else {
    next[athleteId] = instructions;
  }
  return next;
}

/** How many of a player's cards the coach has moved off the default. */
export function customCount(
  context: SlotContext,
  stored: PlayerInstructions | undefined,
): number {
  return resolveInstructions(context, stored).filter(
    (resolved) => resolved.source === "custom",
  ).length;
}

/* ─── Reconciliation ────────────────────────────────────────────────────── */

export interface ReconcileInput {
  instructions: PlayerInstructionsByAthlete;
  formation: Formation;
  assignments: Record<string, string | null>;
  /** Everyone still on the team's roster. */
  knownAthleteIds: Set<string>;
}

export interface ReconcileResult {
  instructions: PlayerInstructionsByAthlete;
  /** Athletes whose instructions were pruned, for the notice in the UI. */
  changedAthleteIds: string[];
  changed: boolean;
}

/**
 * Brings stored instructions back in line with the lineup.
 *
 * A player who moves — right wing to right wing-back, say — keeps the
 * instructions that still mean something and loses the ones that no longer
 * apply; the defaults for their new position take over from there. Players who
 * have left the roster are dropped entirely, because the backend only accepts
 * instructions for athletes it can still find on the team.
 *
 * A player on the bench is left untouched. Benching someone for one plan should
 * not throw away how a coach wants them to play when they come back on.
 */
export function reconcilePlayerInstructions({
  instructions,
  formation,
  assignments,
  knownAthleteIds,
}: ReconcileInput): ReconcileResult {
  const contextByAthlete = new Map<string, SlotContext>();
  for (const slot of formation.positions) {
    const athleteId = assignments[slot.id];
    if (athleteId) contextByAthlete.set(athleteId, slotContext(slot, formation));
  }

  const next: PlayerInstructionsByAthlete = {};
  const changedAthleteIds: string[] = [];
  let changed = false;

  for (const [athleteId, stored] of Object.entries(instructions)) {
    if (!knownAthleteIds.has(athleteId)) {
      changed = true;
      continue;
    }

    const context = contextByAthlete.get(athleteId);
    if (!context) {
      // Not in the starting lineup — nothing to measure their cards against.
      next[athleteId] = stored;
      continue;
    }

    const kept: PlayerInstructions = {};
    let pruned = false;
    for (const [categoryId, optionId] of Object.entries(stored)) {
      const category = PLAYER_INSTRUCTION_DEFINITIONS[categoryId];
      const applies = category && categoryAppliesToSlot(categoryId, context);
      const optionExists =
        applies &&
        optionsForGroup(category, context.group).some(
          (option) => option.id === optionId,
        );
      const isDefault =
        applies && optionId === defaultOptionId(category, context.group);

      if (!optionExists || isDefault) {
        pruned = true;
        continue;
      }
      kept[categoryId] = optionId;
    }

    if (pruned) {
      changed = true;
      changedAthleteIds.push(athleteId);
    }
    if (Object.keys(kept).length > 0) next[athleteId] = kept;
  }

  return {
    instructions: changed ? next : instructions,
    changedAthleteIds,
    changed,
  };
}

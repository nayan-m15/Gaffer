/**
 * Turning a formation slot into the kind of player a coach is instructing.
 *
 * Preset formations label their slots precisely ("LWB", "CAM"), so a lookup
 * does the job. Coach-defined shapes only label a slot by its band — DEF, MID
 * or FWD — so those fall back to where the slot actually sits: a defender on
 * the touchline is a full-back, a midfielder in front of his own box is a
 * holding midfielder. The thresholds match the ones the backend already uses
 * to infer a custom slot's band from its height.
 *
 * Nothing here duplicates formation coordinates; it only reads the slot the
 * squad board already produced.
 */

import type { Formation, FormationPosition } from "@/features/team-management/types";
import type { PositionGroup } from "./instructionTypes";

/** Slot labels used by the preset formations, and the group each maps to. */
const LABEL_GROUPS: Record<string, PositionGroup> = {
  GK: "GK",
  CB: "CB",
  LB: "FB",
  RB: "FB",
  LWB: "WB",
  RWB: "WB",
  DM: "DM",
  CDM: "DM",
  CM: "CM",
  LCM: "CM",
  RCM: "CM",
  CAM: "AM",
  AM: "AM",
  LM: "WIDE",
  RM: "WIDE",
  LW: "WIDE",
  RW: "WIDE",
  // The wide points of an attacking three play as wingers, not as a second
  // number ten, so they get the winger's questions.
  LAM: "WIDE",
  RAM: "WIDE",
  ST: "ST",
  CF: "ST",
};

/** Outside this band of the pitch a player is working the touchline. */
const WIDE_X = 24;

/** The kind of player occupying a formation slot. */
export function positionGroupForSlot(slot: FormationPosition): PositionGroup {
  const known = LABEL_GROUPS[slot.label.trim().toUpperCase()];
  if (known) return known;

  const isWide = slot.x < WIDE_X || slot.x > 100 - WIDE_X;

  switch (slot.role) {
    case "GK":
      return "GK";
    case "DEF":
      return isWide ? "FB" : "CB";
    case "MID":
      if (isWide) return "WIDE";
      if (slot.y >= 55) return "DM";
      return slot.y <= 34 ? "AM" : "CM";
    case "FWD":
      return isWide ? "WIDE" : "ST";
  }
}

/**
 * True for the outside centre-backs of a back three or five — the only ones
 * asked to cover the channel outside them.
 */
export function isWideCentreBack(
  slot: FormationPosition,
  formation: Formation,
): boolean {
  if (positionGroupForSlot(slot) !== "CB") return false;

  const centreBacks = formation.positions.filter(
    (position) => positionGroupForSlot(position) === "CB",
  );
  if (centreBacks.length < 3) return false;

  const xs = centreBacks.map((position) => position.x);
  return slot.x === Math.min(...xs) || slot.x === Math.max(...xs);
}

/** Everything the registry needs to decide which cards a player is offered. */
export interface SlotContext {
  slot: FormationPosition;
  group: PositionGroup;
  wideCentreBack: boolean;
}

export function slotContext(
  slot: FormationPosition,
  formation: Formation,
): SlotContext {
  return {
    slot,
    group: positionGroupForSlot(slot),
    wideCentreBack: isWideCentreBack(slot, formation),
  };
}

/** The slot an athlete occupies in the starting lineup, if they are in it. */
export function slotForAthlete(
  athleteId: string,
  formation: Formation,
  assignments: Record<string, string | null>,
): FormationPosition | null {
  for (const slot of formation.positions) {
    if (assignments[slot.id] === athleteId) return slot;
  }
  return null;
}

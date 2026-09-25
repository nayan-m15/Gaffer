import {
  assignShirtToSlot,
  clearSlot,
} from "@/features/matches/opponent-squad-draft";
import type {
  DragItem,
  PitchAssignments,
} from "@/features/team-management/types";

function shirtFromId(athleteId: string) {
  const shirt = Number.parseInt(athleteId, 10);
  return Number.isInteger(shirt) ? shirt : null;
}

export function applyOpponentShirtDrop(
  assignments: PitchAssignments,
  source: DragItem,
  target: { type: "pitch"; positionId: string } | { type: "subs" },
): PitchAssignments | null {
  const shirt = shirtFromId(source.athleteId);
  if (shirt == null) {
    return null;
  }
  if (target.type === "pitch") {
    return assignShirtToSlot(assignments, target.positionId, shirt);
  }
  if (source.source === "pitch" && source.positionId) {
    return clearSlot(assignments, source.positionId);
  }
  return null;
}

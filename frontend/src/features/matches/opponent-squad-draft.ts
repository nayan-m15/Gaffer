import {
  DEFAULT_FORMATION_ID,
  FORMATIONS,
  remapPlayers,
} from "@/features/team-management/formations";
import type { OpponentSquadVisibility } from "@/features/events/types";
import type { PitchAssignments } from "@/features/team-management/types";

export interface DraftOpponentPlayer {
  shirtNumber: number;
  name?: string;
  position?: string | null;
}

export interface OpponentSquadSetupContext {
  visibility: OpponentSquadVisibility;
  players: DraftOpponentPlayer[];
  formationId: string;
  opponentColor: string;
  onSave: (next: {
    visibility: OpponentSquadVisibility;
    players: DraftOpponentPlayer[];
    formationId: string;
  }) => void;
}

export const MAX_OPPONENT_PLAYERS = 30;

export function emptySlotAssignments(formationId: string): PitchAssignments {
  const formation = FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const assignments: PitchAssignments = {};
  if (!formation) {
    return assignments;
  }
  for (const pos of formation.positions) {
    assignments[pos.id] = null;
  }
  return assignments;
}

export function assignmentsFromPlayers(
  formationId: string,
  players: DraftOpponentPlayer[],
): PitchAssignments {
  const formation = FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const assignments = emptySlotAssignments(formation?.id ?? formationId);
  if (!formation) {
    return assignments;
  }
  const used = new Set<number>();
  for (const pos of formation.positions) {
    const player = players.find((entry) => {
      if (used.has(entry.shirtNumber)) {
        return false;
      }
      return (
        (entry.position ?? "").trim().toUpperCase() ===
        pos.label.trim().toUpperCase()
      );
    });
    if (player) {
      assignments[pos.id] = String(player.shirtNumber);
      used.add(player.shirtNumber);
    }
  }
  return assignments;
}

export function applyAssignmentsToPlayers(
  players: DraftOpponentPlayer[],
  formationId: string,
  assignments: PitchAssignments,
): DraftOpponentPlayer[] {
  const formation = FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const positionByShirt = new Map<number, string>();
  if (formation) {
    for (const pos of formation.positions) {
      const raw = assignments[pos.id];
      if (!raw) {
        continue;
      }
      const shirt = Number.parseInt(raw, 10);
      if (Number.isInteger(shirt)) {
        positionByShirt.set(shirt, pos.label);
      }
    }
  }
  return players.map((player) => ({
    ...player,
    position: positionByShirt.get(player.shirtNumber) ?? null,
  }));
}

export function slotIdForShirt(
  assignments: PitchAssignments,
  shirtNumber: number,
) {
  const key = String(shirtNumber);
  return (
    Object.keys(assignments).find((slotId) => assignments[slotId] === key) ??
    null
  );
}

export function assignShirtToSlot(
  assignments: PitchAssignments,
  slotId: string,
  shirtNumber: number,
): PitchAssignments {
  const next = { ...assignments };
  const incoming = String(shirtNumber);
  const previousSlot = slotIdForShirt(next, shirtNumber);
  const occupant = next[slotId] ?? null;

  if (previousSlot && occupant && previousSlot !== slotId) {
    next[slotId] = incoming;
    next[previousSlot] = occupant;
    return next;
  }

  if (previousSlot) {
    next[previousSlot] = null;
  }
  next[slotId] = incoming;
  return next;
}

export function clearSlot(
  assignments: PitchAssignments,
  slotId: string,
): PitchAssignments {
  return { ...assignments, [slotId]: null };
}

export function remapOpponentAssignments(
  oldFormationId: string,
  newFormationId: string,
  assignments: PitchAssignments,
) {
  return remapPlayers(oldFormationId, newFormationId, assignments).assignments;
}

export function assignedShirtNumbers(assignments: PitchAssignments) {
  const numbers = new Set<number>();
  for (const value of Object.values(assignments)) {
    if (!value) {
      continue;
    }
    const shirt = Number.parseInt(value, 10);
    if (Number.isInteger(shirt)) {
      numbers.add(shirt);
    }
  }
  return numbers;
}

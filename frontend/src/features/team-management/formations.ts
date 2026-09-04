/**
 * Formation definitions for common football systems.
 *
 * Each formation contains exactly 11 positions with percentage-based
 * coordinates relative to the pitch (0–100 on both axes).
 *
 * The pitch is oriented with the opponent's goal at the top (y = 0) and
 * the own goal at the bottom (y = 100), so the goalkeeper sits near y ≈ 94.
 */

import type {
  Formation,
  FormationPosition,
  PitchAssignments,
  PositionRole,
} from "./types";

/* ─── Helper to build a position quickly ────────────────────────────────── */
function pos(
  formationId: string,
  label: string,
  role: PositionRole,
  x: number,
  y: number,
  suffix = "",
): FormationPosition {
  const tag = label.toLowerCase().replace(/\s+/g, "");
  return {
    id: `${formationId}-${tag}${suffix}`,
    label,
    role,
    x,
    y,
  };
}

/* ─── 4-3-3 ─────────────────────────────────────────────────────────────── */
const fourThreeThree: Formation = {
  id: "4-3-3",
  name: "4-3-3",
  positions: [
    pos("433", "GK", "GK", 50, 94),
    pos("433", "LB", "DEF", 14, 72),
    pos("433", "CB", "DEF", 37, 76, "1"),
    pos("433", "CB", "DEF", 63, 76, "2"),
    pos("433", "RB", "DEF", 86, 72),
    pos("433", "CM", "MID", 28, 52, "1"),
    pos("433", "CM", "MID", 50, 46, "2"),
    pos("433", "CM", "MID", 72, 52, "3"),
    pos("433", "LW", "FWD", 18, 22),
    pos("433", "ST", "FWD", 50, 14),
    pos("433", "RW", "FWD", 82, 22),
  ],
};

/* ─── 4-4-2 ─────────────────────────────────────────────────────────────── */
const fourFourTwo: Formation = {
  id: "4-4-2",
  name: "4-4-2",
  positions: [
    pos("442", "GK", "GK", 50, 94),
    pos("442", "LB", "DEF", 14, 72),
    pos("442", "CB", "DEF", 37, 76, "1"),
    pos("442", "CB", "DEF", 63, 76, "2"),
    pos("442", "RB", "DEF", 86, 72),
    pos("442", "LM", "MID", 14, 48),
    pos("442", "CM", "MID", 38, 50, "1"),
    pos("442", "CM", "MID", 62, 50, "2"),
    pos("442", "RM", "MID", 86, 48),
    pos("442", "ST", "FWD", 38, 16, "1"),
    pos("442", "ST", "FWD", 62, 16, "2"),
  ],
};

/* ─── 4-2-3-1 ───────────────────────────────────────────────────────────── */
const fourTwoThreeOne: Formation = {
  id: "4-2-3-1",
  name: "4-2-3-1",
  positions: [
    pos("4231", "GK", "GK", 50, 94),
    pos("4231", "LB", "DEF", 14, 72),
    pos("4231", "CB", "DEF", 37, 76, "1"),
    pos("4231", "CB", "DEF", 63, 76, "2"),
    pos("4231", "RB", "DEF", 86, 72),
    pos("4231", "CDM", "MID", 38, 60, "1"),
    pos("4231", "CDM", "MID", 62, 60, "2"),
    pos("4231", "LAM", "MID", 18, 38),
    pos("4231", "CAM", "MID", 50, 34),
    pos("4231", "RAM", "MID", 82, 38),
    pos("4231", "ST", "FWD", 50, 14),
  ],
};

/* ─── 4-1-4-1 ───────────────────────────────────────────────────────────── */
const fourOneFourOne: Formation = {
  id: "4-1-4-1",
  name: "4-1-4-1",
  positions: [
    pos("4141", "GK", "GK", 50, 94),
    pos("4141", "LB", "DEF", 14, 72),
    pos("4141", "CB", "DEF", 37, 76, "1"),
    pos("4141", "CB", "DEF", 63, 76, "2"),
    pos("4141", "RB", "DEF", 86, 72),
    pos("4141", "CDM", "MID", 50, 60),
    pos("4141", "LM", "MID", 14, 42),
    pos("4141", "CM", "MID", 38, 44, "1"),
    pos("4141", "CM", "MID", 62, 44, "2"),
    pos("4141", "RM", "MID", 86, 42),
    pos("4141", "ST", "FWD", 50, 14),
  ],
};

/* ─── 3-5-2 ─────────────────────────────────────────────────────────────── */
const threeFiveTwo: Formation = {
  id: "3-5-2",
  name: "3-5-2",
  positions: [
    pos("352", "GK", "GK", 50, 94),
    pos("352", "CB", "DEF", 28, 76, "1"),
    pos("352", "CB", "DEF", 50, 78, "2"),
    pos("352", "CB", "DEF", 72, 76, "3"),
    pos("352", "LWB", "MID", 10, 52),
    pos("352", "CM", "MID", 32, 50, "1"),
    pos("352", "CM", "MID", 50, 44, "2"),
    pos("352", "CM", "MID", 68, 50, "3"),
    pos("352", "RWB", "MID", 90, 52),
    pos("352", "ST", "FWD", 38, 16, "1"),
    pos("352", "ST", "FWD", 62, 16, "2"),
  ],
};

/* ─── 3-4-3 ─────────────────────────────────────────────────────────────── */
const threeFourThree: Formation = {
  id: "3-4-3",
  name: "3-4-3",
  positions: [
    pos("343", "GK", "GK", 50, 94),
    pos("343", "CB", "DEF", 28, 76, "1"),
    pos("343", "CB", "DEF", 50, 78, "2"),
    pos("343", "CB", "DEF", 72, 76, "3"),
    pos("343", "LM", "MID", 14, 50),
    pos("343", "CM", "MID", 38, 52, "1"),
    pos("343", "CM", "MID", 62, 52, "2"),
    pos("343", "RM", "MID", 86, 50),
    pos("343", "LW", "FWD", 20, 22),
    pos("343", "ST", "FWD", 50, 14),
    pos("343", "RW", "FWD", 80, 22),
  ],
};

/* ─── 5-3-2 ─────────────────────────────────────────────────────────────── */
const fiveThreeTwo: Formation = {
  id: "5-3-2",
  name: "5-3-2",
  positions: [
    pos("532", "GK", "GK", 50, 94),
    pos("532", "LWB", "DEF", 10, 68),
    pos("532", "CB", "DEF", 30, 76, "1"),
    pos("532", "CB", "DEF", 50, 78, "2"),
    pos("532", "CB", "DEF", 70, 76, "3"),
    pos("532", "RWB", "DEF", 90, 68),
    pos("532", "CM", "MID", 28, 50, "1"),
    pos("532", "CM", "MID", 50, 44, "2"),
    pos("532", "CM", "MID", 72, 50, "3"),
    pos("532", "ST", "FWD", 38, 16, "1"),
    pos("532", "ST", "FWD", 62, 16, "2"),
  ],
};

/* ─── 5-4-1 ─────────────────────────────────────────────────────────────── */
const fiveFourOne: Formation = {
  id: "5-4-1",
  name: "5-4-1",
  positions: [
    pos("541", "GK", "GK", 50, 94),
    pos("541", "LWB", "DEF", 10, 68),
    pos("541", "CB", "DEF", 30, 76, "1"),
    pos("541", "CB", "DEF", 50, 78, "2"),
    pos("541", "CB", "DEF", 70, 76, "3"),
    pos("541", "RWB", "DEF", 90, 68),
    pos("541", "LM", "MID", 14, 48),
    pos("541", "CM", "MID", 38, 50, "1"),
    pos("541", "CM", "MID", 62, 50, "2"),
    pos("541", "RM", "MID", 86, 48),
    pos("541", "ST", "FWD", 50, 14),
  ],
};

/* ─── Public API ─────────────────────────────────────────────────────────── */

/** All supported formations, keyed by ID. */
export const FORMATIONS: Record<string, Formation> = {
  "4-3-3": fourThreeThree,
  "4-4-2": fourFourTwo,
  "4-2-3-1": fourTwoThreeOne,
  "4-1-4-1": fourOneFourOne,
  "3-5-2": threeFiveTwo,
  "3-4-3": threeFourThree,
  "5-3-2": fiveThreeTwo,
  "5-4-1": fiveFourOne,
};

/** Ordered list for the formation selector dropdown. */
export const FORMATION_OPTIONS: { value: string; label: string }[] =
  Object.values(FORMATIONS).map((f) => ({ value: f.id, label: f.name }));

/** Default formation used when the page first loads. */
export const DEFAULT_FORMATION_ID = "4-3-3";

/* ─── Formation change remapping ─────────────────────────────────────────── */

/**
 * Remap player assignments from one formation to another.
 *
 * Strategy:
 * 1. The goalkeeper always stays in the GK position.
 * 2. Remaining players are grouped by their current role (DEF / MID / FWD).
 * 3. Players are assigned to matching-role positions in the new formation first.
 * 4. Any leftover players (when the new formation has fewer slots for a role)
 *    are moved to the substitutes bench.
 * 5. Empty position slots in the new formation are left as `null`.
 *
 * Returns the new PitchAssignments and an array of athlete IDs that were
 * moved to substitutes because their role slots were full.
 */
export function remapPlayers(
  oldFormationId: string,
  newFormationId: string,
  currentAssignments: PitchAssignments,
): { assignments: PitchAssignments; overflowToSubs: string[] } {
  const oldFormation = FORMATIONS[oldFormationId];
  const newFormation = FORMATIONS[newFormationId];

  if (!oldFormation || !newFormation) {
    return { assignments: {}, overflowToSubs: [] };
  }

  // Collect currently assigned players grouped by role
  const playersByRole: Record<PositionRole, { athleteId: string; label: string }[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };

  for (const oldPos of oldFormation.positions) {
    const athleteId = currentAssignments[oldPos.id];
    if (athleteId) {
      playersByRole[oldPos.role].push({ athleteId, label: oldPos.label });
    }
  }

  // Build new assignments
  const newAssignments: PitchAssignments = {};
  const overflowToSubs: string[] = [];

  // Initialize all new positions as empty
  for (const newPos of newFormation.positions) {
    newAssignments[newPos.id] = null;
  }

  // 1. Assign goalkeeper first
  const newGkPos = newFormation.positions.find((p) => p.role === "GK");
  if (newGkPos && playersByRole.GK.length > 0) {
    newAssignments[newGkPos.id] = playersByRole.GK[0].athleteId;
    playersByRole.GK = playersByRole.GK.slice(1);
  }

  // Any extra GKs go to overflow
  for (const extra of playersByRole.GK) {
    overflowToSubs.push(extra.athleteId);
  }

  // 2. Assign outfield players by role match
  const outfieldRoles: PositionRole[] = ["DEF", "MID", "FWD"];

  for (const role of outfieldRoles) {
    const newSlots = newFormation.positions.filter(
      (p) => p.role === role && newAssignments[p.id] === null,
    );
    const players = playersByRole[role];

    const assignCount = Math.min(newSlots.length, players.length);

    for (let i = 0; i < assignCount; i++) {
      newAssignments[newSlots[i].id] = players[i].athleteId;
    }

    // Overflow: players who couldn't fit in their role slots
    for (let i = assignCount; i < players.length; i++) {
      overflowToSubs.push(players[i].athleteId);
    }
  }

  return { assignments: newAssignments, overflowToSubs };
}

/* ─── Auto-fill utility ──────────────────────────────────────────────────── */

/**
 * Automatically assign athletes to formation positions based on their
 * recorded position string.
 *
 * Priority mapping:
 * - "GK" → GK positions
 * - "CB", "LB", "RB", "LWB", "RWB" → DEF positions
 * - "CDM", "CM", "CAM", "DM", "LM", "RM", "LAM", "RAM", "AM" → MID positions
 * - "ST", "LW", "RW", "CF" → FWD positions
 *
 * Athletes whose position doesn't match or who are left over go to subs.
 */

const POSITION_ROLE_MAP: Record<string, PositionRole> = {
    GK: "GK",
    CB: "DEF",
    LB: "DEF",
    RB: "DEF",
    LWB: "DEF",
    RWB: "DEF",
    CDM: "MID",
    CM: "MID",
    CAM: "MID",
    DM: "MID",
    LM: "MID",
    RM: "MID",
    LAM: "MID",
    RAM: "MID",
    AM: "MID",
    ST: "FWD",
    LW: "FWD",
    RW: "FWD",
    CF: "FWD",
  };

export function getPositionRole(position: string | null | undefined): PositionRole | null {
  if (!position) return null;
  return POSITION_ROLE_MAP[position.toUpperCase()] ?? null;
}

export function autoFillFormation(
  formationId: string,
  athleteIds: string[],
  getPosition: (athleteId: string) => string | null,
): { assignments: PitchAssignments; substituteIds: string[] } {
  const formation = FORMATIONS[formationId];
  if (!formation) return { assignments: {}, substituteIds: [...athleteIds] };

  // Classify athletes by their position role
  const byRole: Record<PositionRole, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const id of athleteIds) {
    const role = getPositionRole(getPosition(id));
    if (role) byRole[role].push(id);
  }

  const assignments: PitchAssignments = {};
  const assigned = new Set<string>();

  // Assign by role priority: GK → DEF → MID → FWD
  for (const pos of formation.positions) {
    const candidate = byRole[pos.role].find((id) => !assigned.has(id));
    if (candidate) {
      assignments[pos.id] = candidate;
      assigned.add(candidate);
    } else {
      assignments[pos.id] = null;
    }
  }

  // Everyone not assigned goes to substitutes
  const substituteIds = athleteIds.filter((id) => !assigned.has(id));

  return { assignments, substituteIds };
}

/**
 * Formation definitions for common football systems.
 *
 * Formations support 5-, 7-, and 11-a-side football. Position coordinates
 * are percentage-based relative to the pitch (0–100 on both axes).
 *
 * The pitch is oriented with the opponent's goal at the top (y = 0) and
 * the own goal at the bottom (y = 100), so the goalkeeper sits near y ≈ 94.
 */

import type {
  CustomFormationId,
  Formation,
  FormationPlayerCount,
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
  playerCount: 11,
  positions: [
    pos("433", "GK", "GK", 50, 94),
    pos("433", "LB", "DEF", 12, 72),
    pos("433", "CB", "DEF", 32, 78, "1"),
    pos("433", "CB", "DEF", 68, 78, "2"),
    pos("433", "RB", "DEF", 88, 72),
    pos("433", "CM", "MID", 24, 52, "1"),
    pos("433", "CM", "MID", 50, 44, "2"),
    pos("433", "CM", "MID", 76, 52, "3"),
    pos("433", "LW", "FWD", 16, 22),
    pos("433", "ST", "FWD", 50, 14),
    pos("433", "RW", "FWD", 84, 22),
  ],
};

/* ─── 4-4-2 ─────────────────────────────────────────────────────────────── */
const fourFourTwo: Formation = {
  id: "4-4-2",
  name: "4-4-2",
  playerCount: 11,
  positions: [
    pos("442", "GK", "GK", 50, 94),
    pos("442", "LB", "DEF", 12, 72),
    pos("442", "CB", "DEF", 32, 78, "1"),
    pos("442", "CB", "DEF", 68, 78, "2"),
    pos("442", "RB", "DEF", 88, 72),
    pos("442", "LM", "MID", 12, 48),
    pos("442", "CM", "MID", 32, 50, "1"),
    pos("442", "CM", "MID", 68, 50, "2"),
    pos("442", "RM", "MID", 88, 48),
    pos("442", "ST", "FWD", 36, 16, "1"),
    pos("442", "ST", "FWD", 64, 16, "2"),
  ],
};

/* ─── 4-2-3-1 ───────────────────────────────────────────────────────────── */
const fourTwoThreeOne: Formation = {
  id: "4-2-3-1",
  name: "4-2-3-1",
  playerCount: 11,
  positions: [
    pos("4231", "GK", "GK", 50, 94),
    pos("4231", "LB", "DEF", 12, 72),
    pos("4231", "CB", "DEF", 32, 78, "1"),
    pos("4231", "CB", "DEF", 68, 78, "2"),
    pos("4231", "RB", "DEF", 88, 72),
    pos("4231", "CDM", "MID", 32, 58, "1"),
    pos("4231", "CDM", "MID", 68, 58, "2"),
    pos("4231", "LAM", "MID", 16, 38),
    pos("4231", "CAM", "MID", 50, 32),
    pos("4231", "RAM", "MID", 84, 38),
    pos("4231", "ST", "FWD", 50, 14),
  ],
};

/* ─── 4-1-4-1 ───────────────────────────────────────────────────────────── */
const fourOneFourOne: Formation = {
  id: "4-1-4-1",
  name: "4-1-4-1",
  playerCount: 11,
  positions: [
    pos("4141", "GK", "GK", 50, 94),
    pos("4141", "LB", "DEF", 12, 72),
    pos("4141", "CB", "DEF", 32, 78, "1"),
    pos("4141", "CB", "DEF", 68, 78, "2"),
    pos("4141", "RB", "DEF", 88, 72),
    pos("4141", "CDM", "MID", 50, 58),
    pos("4141", "LM", "MID", 12, 42),
    pos("4141", "CM", "MID", 32, 44, "1"),
    pos("4141", "CM", "MID", 68, 44, "2"),
    pos("4141", "RM", "MID", 88, 42),
    pos("4141", "ST", "FWD", 50, 14),
  ],
};

/* ─── 3-5-2 ─────────────────────────────────────────────────────────────── */
const threeFiveTwo: Formation = {
  id: "3-5-2",
  name: "3-5-2",
  playerCount: 11,
  positions: [
    pos("352", "GK", "GK", 50, 94),
    pos("352", "CB", "DEF", 26, 76, "1"),
    pos("352", "CB", "DEF", 50, 80, "2"),
    pos("352", "CB", "DEF", 74, 76, "3"),
    pos("352", "LWB", "MID", 8, 52),
    pos("352", "CM", "MID", 30, 50, "1"),
    pos("352", "CM", "MID", 50, 42, "2"),
    pos("352", "CM", "MID", 70, 50, "3"),
    pos("352", "RWB", "MID", 92, 52),
    pos("352", "ST", "FWD", 36, 16, "1"),
    pos("352", "ST", "FWD", 64, 16, "2"),
  ],
};

/* ─── 3-4-3 ─────────────────────────────────────────────────────────────── */
const threeFourThree: Formation = {
  id: "3-4-3",
  name: "3-4-3",
  playerCount: 11,
  positions: [
    pos("343", "GK", "GK", 50, 94),
    pos("343", "CB", "DEF", 26, 76, "1"),
    pos("343", "CB", "DEF", 50, 80, "2"),
    pos("343", "CB", "DEF", 74, 76, "3"),
    pos("343", "LM", "MID", 12, 50),
    pos("343", "CM", "MID", 32, 52, "1"),
    pos("343", "CM", "MID", 68, 52, "2"),
    pos("343", "RM", "MID", 88, 50),
    pos("343", "LW", "FWD", 18, 22),
    pos("343", "ST", "FWD", 50, 14),
    pos("343", "RW", "FWD", 82, 22),
  ],
};

/* ─── 5-3-2 ─────────────────────────────────────────────────────────────── */
const fiveThreeTwo: Formation = {
  id: "5-3-2",
  name: "5-3-2",
  playerCount: 11,
  positions: [
    pos("532", "GK", "GK", 50, 94),
    pos("532", "LWB", "DEF", 8, 68),
    pos("532", "CB", "DEF", 28, 76, "1"),
    pos("532", "CB", "DEF", 50, 80, "2"),
    pos("532", "CB", "DEF", 72, 76, "3"),
    pos("532", "RWB", "DEF", 92, 68),
    pos("532", "CM", "MID", 26, 50, "1"),
    pos("532", "CM", "MID", 50, 42, "2"),
    pos("532", "CM", "MID", 74, 50, "3"),
    pos("532", "ST", "FWD", 36, 16, "1"),
    pos("532", "ST", "FWD", 64, 16, "2"),
  ],
};

/* ─── 5-4-1 ─────────────────────────────────────────────────────────────── */
const fiveFourOne: Formation = {
  id: "5-4-1",
  name: "5-4-1",
  playerCount: 11,
  positions: [
    pos("541", "GK", "GK", 50, 94),
    pos("541", "LWB", "DEF", 8, 68),
    pos("541", "CB", "DEF", 28, 76, "1"),
    pos("541", "CB", "DEF", 50, 80, "2"),
    pos("541", "CB", "DEF", 72, 76, "3"),
    pos("541", "RWB", "DEF", 92, 68),
    pos("541", "LM", "MID", 12, 48),
    pos("541", "CM", "MID", 32, 50, "1"),
    pos("541", "CM", "MID", 68, 50, "2"),
    pos("541", "RM", "MID", 88, 48),
    pos("541", "ST", "FWD", 50, 14),
  ],
};



/* ─── 5-a-side: 1-2-1 ──────────────────────────────────────────────────── */
const fiveVFiveOneTwoOne: Formation = {
  id: "5v5-1-2-1",
  name: "1-2-1",
  playerCount: 5,
  positions: [
    pos("5v5-121", "GK", "GK", 50, 94),
    pos("5v5-121", "CB", "DEF", 50, 72),
    pos("5v5-121", "LM", "MID", 25, 47),
    pos("5v5-121", "RM", "MID", 75, 47),
    pos("5v5-121", "ST", "FWD", 50, 18),
  ],
};

/* ─── 5-a-side: 2-1-1 ──────────────────────────────────────────────────── */
const fiveVFiveTwoOneOne: Formation = {
  id: "5v5-2-1-1",
  name: "2-1-1",
  playerCount: 5,
  positions: [
    pos("5v5-211", "GK", "GK", 50, 94),
    pos("5v5-211", "CB", "DEF", 30, 72, "1"),
    pos("5v5-211", "CB", "DEF", 70, 72, "2"),
    pos("5v5-211", "CM", "MID", 50, 46),
    pos("5v5-211", "ST", "FWD", 50, 18),
  ],
};

/* ─── 5-a-side: 1-1-2 ──────────────────────────────────────────────────── */
const fiveVFiveOneOneTwo: Formation = {
  id: "5v5-1-1-2",
  name: "1-1-2",
  playerCount: 5,
  positions: [
    pos("5v5-112", "GK", "GK", 50, 94),
    pos("5v5-112", "CB", "DEF", 50, 72),
    pos("5v5-112", "CM", "MID", 50, 48),
    pos("5v5-112", "ST", "FWD", 34, 18, "1"),
    pos("5v5-112", "ST", "FWD", 66, 18, "2"),
  ],
};

/* ─── 7-a-side: 2-3-1 ──────────────────────────────────────────────────── */
const sevenVSevenTwoThreeOne: Formation = {
  id: "7v7-2-3-1",
  name: "2-3-1",
  playerCount: 7,
  positions: [
    pos("7v7-231", "GK", "GK", 50, 94),
    pos("7v7-231", "CB", "DEF", 30, 74, "1"),
    pos("7v7-231", "CB", "DEF", 70, 74, "2"),
    pos("7v7-231", "LM", "MID", 18, 48),
    pos("7v7-231", "CM", "MID", 50, 44),
    pos("7v7-231", "RM", "MID", 82, 48),
    pos("7v7-231", "ST", "FWD", 50, 17),
  ],
};

/* ─── 7-a-side: 3-2-1 ──────────────────────────────────────────────────── */
const sevenVSevenThreeTwoOne: Formation = {
  id: "7v7-3-2-1",
  name: "3-2-1",
  playerCount: 7,
  positions: [
    pos("7v7-321", "GK", "GK", 50, 94),
    pos("7v7-321", "LB", "DEF", 18, 72),
    pos("7v7-321", "CB", "DEF", 50, 78),
    pos("7v7-321", "RB", "DEF", 82, 72),
    pos("7v7-321", "CM", "MID", 34, 47, "1"),
    pos("7v7-321", "CM", "MID", 66, 47, "2"),
    pos("7v7-321", "ST", "FWD", 50, 17),
  ],
};

/* ─── 7-a-side: 2-2-2 ──────────────────────────────────────────────────── */
const sevenVSevenTwoTwoTwo: Formation = {
  id: "7v7-2-2-2",
  name: "2-2-2",
  playerCount: 7,
  positions: [
    pos("7v7-222", "GK", "GK", 50, 94),
    pos("7v7-222", "CB", "DEF", 30, 74, "1"),
    pos("7v7-222", "CB", "DEF", 70, 74, "2"),
    pos("7v7-222", "CM", "MID", 32, 48, "1"),
    pos("7v7-222", "CM", "MID", 68, 48, "2"),
    pos("7v7-222", "ST", "FWD", 34, 18, "1"),
    pos("7v7-222", "ST", "FWD", 66, 18, "2"),
  ],
};

/* ─── Coach-defined custom formations ───────────────────────────────────── */

export const CUSTOM_FORMATION_BY_PLAYER_COUNT: Record<
  FormationPlayerCount,
  CustomFormationId
> = {
  5: "custom-5",
  7: "custom-7",
  11: "custom-11",
};

const CUSTOM_FORMATION_IDS = new Set<string>(
  Object.values(CUSTOM_FORMATION_BY_PLAYER_COUNT),
);

/** Broad role inferred from a custom slot's vertical location. */
export function inferCustomPositionRole(y: number): Exclude<PositionRole, "GK"> {
  if (y >= 63) return "DEF";
  if (y >= 34) return "MID";
  return "FWD";
}

function customSlotLabel(role: PositionRole): string {
  return role;
}

export function createCustomPositionsFromFormation(
  source: Formation,
): FormationPosition[] {
  let outfieldIndex = 0;
  return source.positions.map((position) => {
    if (position.role === "GK") {
      return {
        id: `custom-${source.playerCount}-gk`,
        label: "GK",
        role: "GK" as const,
        x: 50,
        y: 94,
      };
    }
    outfieldIndex += 1;
    return {
      id: `custom-${source.playerCount}-${outfieldIndex}`,
      label: customSlotLabel(position.role),
      role: position.role,
      x: position.x,
      y: position.y,
    };
  });
}

function buildDefaultCustomFormation(
  playerCount: FormationPlayerCount,
  source: Formation,
): Formation {
  return {
    id: CUSTOM_FORMATION_BY_PLAYER_COUNT[playerCount],
    name: "Custom",
    playerCount,
    positions: createCustomPositionsFromFormation(source),
  };
}

const fiveCustom = buildDefaultCustomFormation(5, fiveVFiveOneTwoOne);
const sevenCustom = buildDefaultCustomFormation(7, sevenVSevenTwoThreeOne);
const elevenCustom = buildDefaultCustomFormation(11, fourThreeThree);

export function isCustomFormationId(
  formationId: string | null | undefined,
): formationId is CustomFormationId {
  return Boolean(formationId && CUSTOM_FORMATION_IDS.has(formationId));
}

export function getCustomFormationIdForPlayerCount(
  playerCount: FormationPlayerCount,
): CustomFormationId {
  return CUSTOM_FORMATION_BY_PLAYER_COUNT[playerCount];
}

export function getDefaultCustomPositions(
  playerCount: FormationPlayerCount,
): FormationPosition[] {
  const formation =
    playerCount === 5 ? fiveCustom : playerCount === 7 ? sevenCustom : elevenCustom;
  return formation.positions.map((position) => ({ ...position }));
}

/**
 * Resolve a formation, applying saved custom coordinates when the selected
 * formation is coach-defined. Invalid/missing custom coordinates fall back to
 * that format's neutral custom shape so old or partial data stays renderable.
 */
export function resolveFormation(
  formationId: string | null | undefined,
  customPositions?: FormationPosition[] | null,
): Formation {
  const base = FORMATIONS[formationId ?? ""] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  if (!isCustomFormationId(base.id)) {
    return base;
  }

  const expectedCount = base.playerCount;
  if (!customPositions || customPositions.length !== expectedCount) {
    return base;
  }

  const baseIds = new Set(base.positions.map((position) => position.id));
  const suppliedIds = new Set(customPositions.map((position) => position.id));
  if (
    suppliedIds.size !== expectedCount ||
    [...baseIds].some((id) => !suppliedIds.has(id))
  ) {
    return base;
  }

  const normalized = customPositions.map((position) => {
    const isGoalkeeper = position.id === `custom-${expectedCount}-gk`;
    if (isGoalkeeper) {
      return { ...position, label: "GK", role: "GK" as const, x: 50, y: 94 };
    }
    const role = inferCustomPositionRole(position.y);
    return {
      ...position,
      label: customSlotLabel(role),
      role,
      x: Math.min(93, Math.max(7, position.x)),
      y: Math.min(86, Math.max(8, position.y)),
    };
  });

  return { ...base, positions: normalized };
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

/** All supported formations, keyed by ID. */
export const FORMATIONS: Record<string, Formation> = {
  "5v5-1-2-1": fiveVFiveOneTwoOne,
  "5v5-2-1-1": fiveVFiveTwoOneOne,
  "5v5-1-1-2": fiveVFiveOneOneTwo,
  "custom-5": fiveCustom,
  "7v7-2-3-1": sevenVSevenTwoThreeOne,
  "7v7-3-2-1": sevenVSevenThreeTwoOne,
  "7v7-2-2-2": sevenVSevenTwoTwoTwo,
  "custom-7": sevenCustom,
  "4-3-3": fourThreeThree,
  "4-4-2": fourFourTwo,
  "4-2-3-1": fourTwoThreeOne,
  "4-1-4-1": fourOneFourOne,
  "3-5-2": threeFiveTwo,
  "3-4-3": threeFourThree,
  "5-3-2": fiveThreeTwo,
  "5-4-1": fiveFourOne,
  "custom-11": elevenCustom,
};

/** Ordered format choices shown to coaches. */
export const FORMAT_OPTIONS: {
  value: FormationPlayerCount;
  label: string;
}[] = [
  { value: 5, label: "5-a-side" },
  { value: 7, label: "7-a-side" },
  { value: 11, label: "11-a-side" },
];

export const DEFAULT_FORMATION_BY_PLAYER_COUNT: Record<
  FormationPlayerCount,
  string
> = {
  5: "5v5-1-2-1",
  7: "7v7-2-3-1",
  11: "4-3-3",
};

/** Ordered list for formation selectors. */
export const FORMATION_OPTIONS: {
  value: string;
  label: string;
  playerCount: FormationPlayerCount;
}[] = Object.values(FORMATIONS).map((f) => ({
  value: f.id,
  label: f.name,
  playerCount: f.playerCount,
}));

/** Default formation used when the page first loads. */
export const DEFAULT_FORMATION_ID = DEFAULT_FORMATION_BY_PLAYER_COUNT[11];

export function getFormationPlayerCount(
  formationId: string | null | undefined,
): FormationPlayerCount {
  return FORMATIONS[formationId ?? ""]?.playerCount ?? 11;
}

export function getDefaultFormationIdForPlayerCount(
  playerCount: FormationPlayerCount,
): string {
  return DEFAULT_FORMATION_BY_PLAYER_COUNT[playerCount];
}

export function getFormationOptionsForPlayerCount(
  playerCount: FormationPlayerCount,
) {
  return FORMATION_OPTIONS.filter((option) => option.playerCount === playerCount);
}

/**
 * Pick the formation whose slot labels best match a set of recorded
 * positions (own athletes or opponent players). Ties keep 4-3-3.
 */
export function inferFormationIdFromPositions(
  positions: Array<string | null | undefined>,
): string {
  const labels = positions
    .map((value) => (value ?? "").trim().toUpperCase())
    .filter(Boolean);
  const hintedPlayerCount =
    positions.length === 5 || positions.length === 7 || positions.length === 11
      ? (positions.length as FormationPlayerCount)
      : null;
  const candidates = hintedPlayerCount
    ? Object.values(FORMATIONS).filter(
        (formation) =>
          formation.playerCount === hintedPlayerCount &&
          !isCustomFormationId(formation.id),
      )
    : Object.values(FORMATIONS).filter(
        (formation) => !isCustomFormationId(formation.id),
      );

  if (labels.length === 0) {
    return hintedPlayerCount
      ? getDefaultFormationIdForPlayerCount(hintedPlayerCount)
      : DEFAULT_FORMATION_ID;
  }

  let bestId = hintedPlayerCount
    ? getDefaultFormationIdForPlayerCount(hintedPlayerCount)
    : DEFAULT_FORMATION_ID;
  let bestScore = -1;
  for (const formation of candidates) {
    const remaining = formation.positions.map((pos) =>
      pos.label.trim().toUpperCase(),
    );
    let score = 0;
    for (const label of labels) {
      const index = remaining.indexOf(label);
      if (index >= 0) {
        remaining.splice(index, 1);
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = formation.id;
    }
  }
  return bestId;
}

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
  oldCustomPositions?: FormationPosition[] | null,
  newCustomPositions?: FormationPosition[] | null,
): { assignments: PitchAssignments; overflowToSubs: string[] } {
  const oldFormation = resolveFormation(oldFormationId, oldCustomPositions);
  const newFormation = resolveFormation(newFormationId, newCustomPositions);

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
  customPositions?: FormationPosition[] | null,
): { assignments: PitchAssignments; substituteIds: string[] } {
  const formation = resolveFormation(formationId, customPositions);

  const assignments: PitchAssignments = {};
  const assigned = new Set<string>();

  // Start with every formation position empty.
  for (const pos of formation.positions) {
    assignments[pos.id] = null;
  }

  /**
   * PASS 1:
   * Fill formation slots using EXACT player positions only.
   *
   * Examples:
   * LB  -> LB
   * CB  -> CB
   * CM  -> CM
   * CAM -> CAM
   * RW  -> RW
   *
   * A CB will NOT be placed at RB/LB here even though they are all defenders.
   */
  for (const pos of formation.positions) {
    const slotPosition = pos.label.trim().toUpperCase();

    const candidate = athleteIds.find((id) => {
      if (assigned.has(id)) return false;

      const athletePosition = (getPosition(id) ?? "")
        .trim()
        .toUpperCase();

      return athletePosition === slotPosition;
    });

    if (candidate) {
      assignments[pos.id] = candidate;
      assigned.add(candidate);
    }
  }

  /**
   * PASS 2:
   * Look at the remaining substitutes again.
   *
   * If formation slots are still empty, allow remaining players to fill
   * a slot belonging to their GENERAL role:
   *
   * DEF -> any remaining DEF slot
   * MID -> any remaining MID slot
   * FWD -> any remaining FWD slot
   *
   * GK still only matches GK.
   */
  for (const pos of formation.positions) {
    // Exact-position pass already filled this slot.
    if (assignments[pos.id] !== null) continue;

    const candidate = athleteIds.find((id) => {
      if (assigned.has(id)) return false;

      const athleteRole = getPositionRole(getPosition(id));

      return athleteRole === pos.role;
    });

    if (candidate) {
      assignments[pos.id] = candidate;
      assigned.add(candidate);
    }
  }

  // Anyone who could not be placed remains on the substitutes bench.
  const substituteIds = athleteIds.filter((id) => !assigned.has(id));

  return {
    assignments,
    substituteIds,
  };
}

/**
 * Place the current starting lineup onto a formation for a live preview.
 *
 * Prefers saved game-plan slots when those athletes are still starters, then
 * fills remaining slots (exact position, then role, then any leftover) so a
 * starter/bench swap always shows up on the pitch instead of a frozen plan.
 */
export function previewAssignmentsForStarters(
  formationId: string,
  starterIds: string[],
  getPosition: (athleteId: string) => string | null,
  preferredAssignments?: PitchAssignments,
  customPositions?: FormationPosition[] | null,
): PitchAssignments {
  const formation = resolveFormation(formationId, customPositions);
  const starterSet = new Set(starterIds);
  const assignments: PitchAssignments = {};
  const used = new Set<string>();

  for (const pos of formation.positions) {
    assignments[pos.id] = null;
  }

  assignPreferredStarters(formation.positions, preferredAssignments, starterSet, used, assignments);
  const remaining = starterIds.filter((id) => !used.has(id));
  assignStartersByPosition(formation.positions, remaining, getPosition, used, assignments);
  assignStartersByRole(formation.positions, remaining, getPosition, used, assignments);
  assignRemainingStarters(formation.positions, remaining, used, assignments);

  return assignments;
}

function assignPreferredStarters(
  positions: Formation["positions"],
  preferred: PitchAssignments | undefined,
  starters: ReadonlySet<string>,
  used: Set<string>,
  assignments: PitchAssignments,
): void {
  if (!preferred) return;
  for (const position of positions) {
    const athleteId = preferred[position.id];
    if (!athleteId || !starters.has(athleteId) || used.has(athleteId)) continue;
    assignments[position.id] = athleteId;
    used.add(athleteId);
  }
}

function assignStartersByPosition(
  positions: Formation["positions"],
  remaining: string[],
  getPosition: (athleteId: string) => string | null,
  used: Set<string>,
  assignments: PitchAssignments,
): void {
  for (const position of positions) {
    if (assignments[position.id]) continue;
    const candidate = remaining.find(
      (id) =>
        !used.has(id) &&
        (getPosition(id) ?? "").trim().toUpperCase() ===
          position.label.trim().toUpperCase(),
    );
    if (candidate) assignStarter(position.id, candidate, used, assignments);
  }
}

function assignStartersByRole(
  positions: Formation["positions"],
  remaining: string[],
  getPosition: (athleteId: string) => string | null,
  used: Set<string>,
  assignments: PitchAssignments,
): void {
  for (const position of positions) {
    if (assignments[position.id]) continue;
    const candidate = remaining.find(
      (id) => !used.has(id) && getPositionRole(getPosition(id)) === position.role,
    );
    if (candidate) assignStarter(position.id, candidate, used, assignments);
  }
}

function assignRemainingStarters(
  positions: Formation["positions"],
  remaining: string[],
  used: Set<string>,
  assignments: PitchAssignments,
): void {
  for (const position of positions) {
    if (assignments[position.id]) continue;
    const candidate = remaining.find((id) => !used.has(id));
    if (candidate) assignStarter(position.id, candidate, used, assignments);
  }
}

function assignStarter(
  positionId: string,
  athleteId: string,
  used: Set<string>,
  assignments: PitchAssignments,
): void {
  assignments[positionId] = athleteId;
  used.add(athleteId);
}

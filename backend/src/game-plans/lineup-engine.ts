/**
 * Server-side port of the formation/ranking engine used by the Team
 * Management tactical board, so the Gaffer AI lineup assistant (which runs
 * requests through the backend) can produce the exact same kind of
 * explainable starting XI as the board's own "Auto-fill" and the "Suggest
 * XI" button on the Confirm Squad page.
 *
 * Mirrors, and must be kept in sync with:
 * - `frontend/src/features/team-management/formations.ts`
 *   (`FORMATIONS`, `getPositionRole`, `autoFillFormation`)
 * - `frontend/src/features/team-management/suggestions.ts`
 *   (`suggestStartingXi`)
 *
 * Differences from the frontend version:
 * - No RSVP ranking factor — the Team page has no event/fixture in context
 *   (RSVP-aware suggestions remain the Confirm Squad page's job).
 * - Adds `excludeAthleteIds` and `preferredAthleteIdBySlotLabel` so the
 *   lineup assistant's conversational edits ("exclude Smith", "put Daniels
 *   at striker") can be expressed as constraints on the same ranking pass.
 */

export type PositionRole = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface FormationPosition {
  id: string;
  label: string;
  role: PositionRole;
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  name: string;
  positions: FormationPosition[];
}

export type PitchAssignments = Record<string, string | null>;

function pos(
  formationId: string,
  label: string,
  role: PositionRole,
  x: number,
  y: number,
  suffix = '',
): FormationPosition {
  const tag = label.toLowerCase().replace(/\s+/g, '');
  return { id: `${formationId}-${tag}${suffix}`, label, role, x, y };
}

const fourThreeThree: Formation = {
  id: '4-3-3',
  name: '4-3-3',
  positions: [
    pos('433', 'GK', 'GK', 50, 94),
    pos('433', 'LB', 'DEF', 12, 72),
    pos('433', 'CB', 'DEF', 32, 78, '1'),
    pos('433', 'CB', 'DEF', 68, 78, '2'),
    pos('433', 'RB', 'DEF', 88, 72),
    pos('433', 'CM', 'MID', 24, 52, '1'),
    pos('433', 'CM', 'MID', 50, 44, '2'),
    pos('433', 'CM', 'MID', 76, 52, '3'),
    pos('433', 'LW', 'FWD', 16, 22),
    pos('433', 'ST', 'FWD', 50, 14),
    pos('433', 'RW', 'FWD', 84, 22),
  ],
};

const fourFourTwo: Formation = {
  id: '4-4-2',
  name: '4-4-2',
  positions: [
    pos('442', 'GK', 'GK', 50, 94),
    pos('442', 'LB', 'DEF', 12, 72),
    pos('442', 'CB', 'DEF', 32, 78, '1'),
    pos('442', 'CB', 'DEF', 68, 78, '2'),
    pos('442', 'RB', 'DEF', 88, 72),
    pos('442', 'LM', 'MID', 12, 48),
    pos('442', 'CM', 'MID', 32, 50, '1'),
    pos('442', 'CM', 'MID', 68, 50, '2'),
    pos('442', 'RM', 'MID', 88, 48),
    pos('442', 'ST', 'FWD', 36, 16, '1'),
    pos('442', 'ST', 'FWD', 64, 16, '2'),
  ],
};

const fourTwoThreeOne: Formation = {
  id: '4-2-3-1',
  name: '4-2-3-1',
  positions: [
    pos('4231', 'GK', 'GK', 50, 94),
    pos('4231', 'LB', 'DEF', 12, 72),
    pos('4231', 'CB', 'DEF', 32, 78, '1'),
    pos('4231', 'CB', 'DEF', 68, 78, '2'),
    pos('4231', 'RB', 'DEF', 88, 72),
    pos('4231', 'CDM', 'MID', 32, 58, '1'),
    pos('4231', 'CDM', 'MID', 68, 58, '2'),
    pos('4231', 'LAM', 'MID', 16, 38),
    pos('4231', 'CAM', 'MID', 50, 32),
    pos('4231', 'RAM', 'MID', 84, 38),
    pos('4231', 'ST', 'FWD', 50, 14),
  ],
};

const fourOneFourOne: Formation = {
  id: '4-1-4-1',
  name: '4-1-4-1',
  positions: [
    pos('4141', 'GK', 'GK', 50, 94),
    pos('4141', 'LB', 'DEF', 12, 72),
    pos('4141', 'CB', 'DEF', 32, 78, '1'),
    pos('4141', 'CB', 'DEF', 68, 78, '2'),
    pos('4141', 'RB', 'DEF', 88, 72),
    pos('4141', 'CDM', 'MID', 50, 58),
    pos('4141', 'LM', 'MID', 12, 42),
    pos('4141', 'CM', 'MID', 32, 44, '1'),
    pos('4141', 'CM', 'MID', 68, 44, '2'),
    pos('4141', 'RM', 'MID', 88, 42),
    pos('4141', 'ST', 'FWD', 50, 14),
  ],
};

const threeFiveTwo: Formation = {
  id: '3-5-2',
  name: '3-5-2',
  positions: [
    pos('352', 'GK', 'GK', 50, 94),
    pos('352', 'CB', 'DEF', 26, 76, '1'),
    pos('352', 'CB', 'DEF', 50, 80, '2'),
    pos('352', 'CB', 'DEF', 74, 76, '3'),
    pos('352', 'LWB', 'MID', 8, 52),
    pos('352', 'CM', 'MID', 30, 50, '1'),
    pos('352', 'CM', 'MID', 50, 42, '2'),
    pos('352', 'CM', 'MID', 70, 50, '3'),
    pos('352', 'RWB', 'MID', 92, 52),
    pos('352', 'ST', 'FWD', 36, 16, '1'),
    pos('352', 'ST', 'FWD', 64, 16, '2'),
  ],
};

const threeFourThree: Formation = {
  id: '3-4-3',
  name: '3-4-3',
  positions: [
    pos('343', 'GK', 'GK', 50, 94),
    pos('343', 'CB', 'DEF', 26, 76, '1'),
    pos('343', 'CB', 'DEF', 50, 80, '2'),
    pos('343', 'CB', 'DEF', 74, 76, '3'),
    pos('343', 'LM', 'MID', 12, 50),
    pos('343', 'CM', 'MID', 32, 52, '1'),
    pos('343', 'CM', 'MID', 68, 52, '2'),
    pos('343', 'RM', 'MID', 88, 50),
    pos('343', 'LW', 'FWD', 18, 22),
    pos('343', 'ST', 'FWD', 50, 14),
    pos('343', 'RW', 'FWD', 82, 22),
  ],
};

const fiveThreeTwo: Formation = {
  id: '5-3-2',
  name: '5-3-2',
  positions: [
    pos('532', 'GK', 'GK', 50, 94),
    pos('532', 'LWB', 'DEF', 8, 68),
    pos('532', 'CB', 'DEF', 28, 76, '1'),
    pos('532', 'CB', 'DEF', 50, 80, '2'),
    pos('532', 'CB', 'DEF', 72, 76, '3'),
    pos('532', 'RWB', 'DEF', 92, 68),
    pos('532', 'CM', 'MID', 26, 50, '1'),
    pos('532', 'CM', 'MID', 50, 42, '2'),
    pos('532', 'CM', 'MID', 74, 50, '3'),
    pos('532', 'ST', 'FWD', 36, 16, '1'),
    pos('532', 'ST', 'FWD', 64, 16, '2'),
  ],
};

const fiveFourOne: Formation = {
  id: '5-4-1',
  name: '5-4-1',
  positions: [
    pos('541', 'GK', 'GK', 50, 94),
    pos('541', 'LWB', 'DEF', 8, 68),
    pos('541', 'CB', 'DEF', 28, 76, '1'),
    pos('541', 'CB', 'DEF', 50, 80, '2'),
    pos('541', 'CB', 'DEF', 72, 76, '3'),
    pos('541', 'RWB', 'DEF', 92, 68),
    pos('541', 'LM', 'MID', 12, 48),
    pos('541', 'CM', 'MID', 32, 50, '1'),
    pos('541', 'CM', 'MID', 68, 50, '2'),
    pos('541', 'RM', 'MID', 88, 48),
    pos('541', 'ST', 'FWD', 50, 14),
  ],
};

/** All supported formations, keyed by ID — matches `FORMATION_IDS` in `game-plans.schemas.ts`. */
export const FORMATIONS: Record<string, Formation> = {
  '4-3-3': fourThreeThree,
  '4-4-2': fourFourTwo,
  '4-2-3-1': fourTwoThreeOne,
  '4-1-4-1': fourOneFourOne,
  '3-5-2': threeFiveTwo,
  '3-4-3': threeFourThree,
  '5-3-2': fiveThreeTwo,
  '5-4-1': fiveFourOne,
};

export const DEFAULT_FORMATION_ID = '4-3-3';

const POSITION_ROLE_MAP: Record<string, PositionRole> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  LWB: 'DEF',
  RWB: 'DEF',
  CDM: 'MID',
  CM: 'MID',
  CAM: 'MID',
  DM: 'MID',
  LM: 'MID',
  RM: 'MID',
  LAM: 'MID',
  RAM: 'MID',
  AM: 'MID',
  ST: 'FWD',
  LW: 'FWD',
  RW: 'FWD',
  CF: 'FWD',
};

export function getPositionRole(
  position: string | null | undefined,
): PositionRole | null {
  if (!position) return null;
  return POSITION_ROLE_MAP[position.toUpperCase()] ?? null;
}

export function autoFillFormation(
  formationId: string,
  athleteIds: string[],
  getPosition: (athleteId: string) => string | null,
): { assignments: PitchAssignments; substituteIds: string[] } {
  const formation = FORMATIONS[formationId];
  if (!formation) {
    return { assignments: {}, substituteIds: [...athleteIds] };
  }

  const assignments: PitchAssignments = {};
  const assigned = new Set<string>();

  for (const slot of formation.positions) {
    assignments[slot.id] = null;
  }

  // Pass 1: exact position label match.
  for (const slot of formation.positions) {
    const slotPosition = slot.label.trim().toUpperCase();
    const candidate = athleteIds.find((id) => {
      if (assigned.has(id)) return false;
      return (getPosition(id) ?? '').trim().toUpperCase() === slotPosition;
    });
    if (candidate) {
      assignments[slot.id] = candidate;
      assigned.add(candidate);
    }
  }

  // Pass 2: general role match (GK still only matches GK).
  for (const slot of formation.positions) {
    if (assignments[slot.id] !== null) continue;
    const candidate = athleteIds.find((id) => {
      if (assigned.has(id)) return false;
      return getPositionRole(getPosition(id)) === slot.role;
    });
    if (candidate) {
      assignments[slot.id] = candidate;
      assigned.add(candidate);
    }
  }

  const substituteIds = athleteIds.filter((id) => !assigned.has(id));
  return { assignments, substituteIds };
}

/** The athlete fields the suggestion logic reads (subset of the athletes.findAll row shape). */
export interface SuggestionAthlete {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  status: string;
  squadNumber: number | null;
  appearances?: number;
  goals?: number;
  assists?: number;
}

export interface StartingXiSuggestionOptions {
  formationId: string | null | undefined;
  athletes: SuggestionAthlete[];
  /** Athletes already placed in the most recent saved game plan, preferred within their slot for continuity. */
  gamePlanAssignments?: PitchAssignments;
  gamePlanSubstituteIds?: string[];
  /** Athlete ids to leave out entirely (a coach's "exclude Smith"). */
  excludeAthleteIds?: string[];
  /** Force a specific athlete into a specific slot label (e.g. "ST"), when eligible. */
  preferredAthleteIdBySlotLabel?: Record<string, string>;
}

export interface StartingXiSuggestion {
  formationId: string;
  /** Suggested starters in formation slot order (goalkeeper first). */
  startingIds: string[];
  assignments: PitchAssignments;
  substituteIds: string[];
  /** Concise explanation per suggested starter, keyed by athlete id. */
  reasons: Record<string, string>;
  /** Problems the coach should know about (e.g. no available goalkeeper). */
  warnings: string[];
}

function normalizePosition(position: string | null | undefined): string {
  return (position ?? '').trim().toUpperCase();
}

function isEligible(athlete: SuggestionAthlete): boolean {
  return athlete.status === 'available';
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function buildReason(
  athlete: SuggestionAthlete,
  slot: FormationPosition,
): string {
  const parts: string[] = [];
  const position = normalizePosition(athlete.position);

  if (position === normalizePosition(slot.label)) {
    parts.push(`Natural ${slot.label}`);
  } else if (getPositionRole(position) === slot.role) {
    parts.push(`Fits ${slot.label}`);
  } else {
    parts.push(`Fills in at ${slot.label}`);
  }

  const appearances = athlete.appearances ?? 0;
  const goals = athlete.goals ?? 0;
  const assists = athlete.assists ?? 0;
  if (slot.role === 'GK' || slot.role === 'DEF') {
    if (appearances > 0) parts.push(pluralize(appearances, 'appearance'));
    else if (goals > 0) parts.push(pluralize(goals, 'goal'));
    else if (assists > 0) parts.push(pluralize(assists, 'assist'));
  } else {
    if (goals > 0) parts.push(pluralize(goals, 'goal'));
    if (assists > 0) parts.push(pluralize(assists, 'assist'));
    if (goals === 0 && assists === 0 && appearances > 0) {
      parts.push(pluralize(appearances, 'appearance'));
    }
  }

  return parts.join(' · ');
}

export function suggestStartingXi(
  options: StartingXiSuggestionOptions,
): StartingXiSuggestion {
  const formation =
    FORMATIONS[options.formationId ?? ''] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const excluded = new Set(options.excludeAthleteIds ?? []);
  const athleteById = new Map(
    options.athletes.map((athlete) => [athlete.id, athlete]),
  );

  const planEngaged = new Set<string>();
  for (const athleteId of Object.values(options.gamePlanAssignments ?? {})) {
    if (athleteId) planEngaged.add(athleteId);
  }
  for (const athleteId of options.gamePlanSubstituteIds ?? []) {
    planEngaged.add(athleteId);
  }

  const compare = (a: SuggestionAthlete, b: SuggestionAthlete): number => {
    const byPlan =
      (planEngaged.has(a.id) ? 0 : 1) - (planEngaged.has(b.id) ? 0 : 1);
    if (byPlan !== 0) return byPlan;

    const aNumber = a.squadNumber ?? Number.POSITIVE_INFINITY;
    const bNumber = b.squadNumber ?? Number.POSITIVE_INFINITY;
    if (aNumber !== bNumber) return aNumber - bNumber;

    return `${a.lastName} ${a.firstName}`.localeCompare(
      `${b.lastName} ${b.firstName}`,
    );
  };

  const eligible = options.athletes
    .filter(isEligible)
    .filter((athlete) => !excluded.has(athlete.id))
    .sort(compare);

  const { assignments, substituteIds } = autoFillFormation(
    formation.id,
    eligible.map((athlete) => athlete.id),
    (athleteId) => athleteById.get(athleteId)?.position ?? null,
  );

  // Apply preferred-slot overrides: force a named athlete into a named slot
  // label when they are eligible, bumping whoever autofill placed there
  // (unassigned, not dropped) to the substitutes bench.
  const warnings: string[] = [];
  const preferred = options.preferredAthleteIdBySlotLabel ?? {};
  for (const [slotLabel, athleteId] of Object.entries(preferred)) {
    const athlete = athleteById.get(athleteId);
    if (!athlete) {
      warnings.push(`${athleteId} is not on the current squad.`);
      continue;
    }
    if (excluded.has(athleteId) || !isEligible(athlete)) {
      warnings.push(
        `${athlete.firstName} ${athlete.lastName} is not available, so they couldn't be placed at ${slotLabel}.`,
      );
      continue;
    }
    const slot = formation.positions.find(
      (candidate) =>
        candidate.label.trim().toUpperCase() === slotLabel.trim().toUpperCase(),
    );
    if (!slot) {
      warnings.push(`${slotLabel} is not a position in this formation.`);
      continue;
    }

    // Remove the athlete from wherever autofill placed them.
    for (const s of formation.positions) {
      if (assignments[s.id] === athleteId) assignments[s.id] = null;
    }
    const subIndex = substituteIds.indexOf(athleteId);
    if (subIndex >= 0) substituteIds.splice(subIndex, 1);

    const displaced = assignments[slot.id];
    assignments[slot.id] = athleteId;
    if (displaced && displaced !== athleteId) {
      substituteIds.push(displaced);
    }
  }

  const startingIds: string[] = [];
  const reasons: Record<string, string> = {};
  for (const slot of formation.positions) {
    const athleteId = assignments[slot.id];
    const athlete = athleteId ? athleteById.get(athleteId) : undefined;
    if (!athleteId || !athlete) continue;
    startingIds.push(athleteId);
    reasons[athleteId] = buildReason(athlete, slot);
  }

  const gkSlot = formation.positions.find((slot) => slot.role === 'GK');
  if (gkSlot && !assignments[gkSlot.id]) {
    warnings.push(
      'There is currently no available player registered as a goalkeeper.',
    );
  }
  const filledCount = formation.positions.filter(
    (slot) => assignments[slot.id],
  ).length;
  if (filledCount < formation.positions.length) {
    warnings.push(
      `Only ${filledCount} of ${formation.positions.length} positions could be filled with currently available players.`,
    );
  }

  return {
    formationId: formation.id,
    startingIds,
    assignments,
    substituteIds,
    reasons,
    warnings,
  };
}

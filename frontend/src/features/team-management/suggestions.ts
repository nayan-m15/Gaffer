/**
 * Player Selection Suggestions — build an explainable starting XI from data
 * the project already stores.
 *
 * Ranking rules (deliberately NOT a global goals/assists formula):
 * 1. Position fit first. Slots are filled with the same exact-label then
 *    general-role passes `autoFillFormation` already uses, so a candidate is
 *    only ever compared against other players suitable for that slot.
 * 2. RSVP from `GET /events/:id/rsvps`: `going` beats no response, which
 *    beats `maybe`; `not_going` players are skipped unless the XI cannot be
 *    completed any other way (last resort, flagged in the reason line).
 * 3. Game-plan continuity: athletes already placed in the selected plan's
 *    assignments or on its bench are preferred within their slot.
 * 4. Squad number, then name, keep the order stable and deterministic.
 *
 * Appearance/goal/assist totals never rank players — they only appear in the
 * human-readable reason line ("Natural CB · Going · 12 appearances").
 *
 * The module is pure and import-light so it can be exercised with
 * `node --test` (see suggestions.node-test.mjs).
 */

import {
  DEFAULT_FORMATION_ID,
  FORMATIONS,
  autoFillFormation,
  getPositionRole,
} from "./formations.ts";
import type { FormationPosition, PitchAssignments } from "./types";

/** RSVP response read from `GET /events/:id/rsvps` (`null` = no response). */
export type SuggestionRsvpStatus = "going" | "maybe" | "not_going" | null;

/** The athlete fields the suggestion logic reads (subset of BackendAthlete). */
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
  /** Formation to fill; unknown ids fall back to the default formation. */
  formationId: string | null | undefined;
  athletes: SuggestionAthlete[];
  /**
   * Athlete id → RSVP response. Omit entirely when RSVP data is unavailable
   * (e.g. assistants cannot read the coach-only RSVP endpoint); suggestions
   * still work and the reason line simply drops the RSVP part.
   */
  rsvpByAthleteId?: Record<string, SuggestionRsvpStatus>;
  /** Saved game plan the coach selected, used for continuity preference. */
  gamePlanAssignments?: PitchAssignments;
  gamePlanSubstituteIds?: string[];
}

export interface StartingXiSuggestion {
  /** Suggested starters in formation slot order (goalkeeper first). */
  startingIds: string[];
  /** Concise explanation per suggested starter, keyed by athlete id. */
  reasons: Record<string, string>;
}

function normalizePosition(position: string | null | undefined): string {
  return (position ?? "").trim().toUpperCase();
}

/** going < no response < maybe < not_going (the last is filtered upstream). */
function rsvpRank(status: SuggestionRsvpStatus | undefined): number {
  if (status === "going") return 0;
  if (status === "maybe") return 2;
  if (status === "not_going") return 3;
  return 1;
}

/**
 * Same eligibility rule the tactics auto-fill uses: only `available`
 * athletes are ever picked, so injured and suspended players stay out of
 * suggestions (the coach can still select them by hand).
 */
function isEligible(athlete: SuggestionAthlete): boolean {
  return athlete.status === "available";
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function rsvpLabel(status: SuggestionRsvpStatus | undefined): string {
  if (status === "going") return "Going";
  if (status === "maybe") return "Maybe";
  if (status === "not_going") return "Not going";
  return "No RSVP";
}

/**
 * "Natural CB · Going · 12 appearances" style explanation built only from
 * stored data: position fit, RSVP, matches squad-listed, goals, assists.
 */
function buildReason(
  athlete: SuggestionAthlete,
  slot: FormationPosition,
  rsvpByAthleteId: Record<string, SuggestionRsvpStatus> | undefined,
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

  if (rsvpByAthleteId !== undefined) {
    parts.push(rsvpLabel(rsvpByAthleteId[athlete.id]));
  }

  appendMatchContribution(parts, athlete, slot.role);

  return parts.join(" · ");
}

function appendMatchContribution(
  parts: string[],
  athlete: SuggestionAthlete,
  role: string,
): void {
  const appearances = athlete.appearances ?? 0;
  const goals = athlete.goals ?? 0;
  const assists = athlete.assists ?? 0;
  if (role === "GK" || role === "DEF") {
    if (appearances > 0) parts.push(pluralize(appearances, "appearance"));
    else if (goals > 0) parts.push(pluralize(goals, "goal"));
    else if (assists > 0) parts.push(pluralize(assists, "assist"));
  } else {
    if (goals > 0) parts.push(pluralize(goals, "goal"));
    if (assists > 0) parts.push(pluralize(assists, "assist"));
    if (goals === 0 && assists === 0 && appearances > 0) {
      parts.push(pluralize(appearances, "appearance"));
    }
  }

}

export function suggestStartingXi(
  options: StartingXiSuggestionOptions,
): StartingXiSuggestion {
  const formation =
    FORMATIONS[options.formationId ?? ""] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const athleteById = new Map(
    options.athletes.map((athlete) => [athlete.id, athlete]),
  );

  const planEngaged = collectPlanAthleteIds(options);

  const compare = (a: SuggestionAthlete, b: SuggestionAthlete): number => {
    const byRsvp =
      rsvpRank(options.rsvpByAthleteId?.[a.id]) -
      rsvpRank(options.rsvpByAthleteId?.[b.id]);
    if (byRsvp !== 0) return byRsvp;

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

  const eligible = options.athletes.filter(isEligible);
  const primaryPool = eligible
    .filter((athlete) => options.rsvpByAthleteId?.[athlete.id] !== "not_going")
    .sort(compare);
  const lastResortPool = eligible
    .filter((athlete) => options.rsvpByAthleteId?.[athlete.id] === "not_going")
    .sort(compare);

  // Exact position labels first, then general roles — the shared tactic
  // formation logic; the ranked pool order decides between equal-fit players.
  const { assignments, substituteIds } = autoFillFormation(
    formation.id,
    primaryPool.map((athlete) => athlete.id),
    (athleteId) => athleteById.get(athleteId)?.position ?? null,
  );

  const selectedBySlotId = new Map<string, string>();
  for (const slot of formation.positions) {
    const athleteId = assignments[slot.id];
    if (athleteId) selectedBySlotId.set(slot.id, athleteId);
  }

  // Slots no suitable candidate could cover (e.g. a squad without a
  // goalkeeper) are filled last: best leftover candidates first, and
  // `not_going` players only if the XI cannot be completed without them.
  const fillQueue = [
    ...substituteIds,
    ...lastResortPool.map((athlete) => athlete.id),
  ];
  let fillIndex = 0;
  for (const slot of formation.positions) {
    if (selectedBySlotId.has(slot.id)) continue;
    const athleteId = fillQueue[fillIndex];
    if (!athleteId) break;
    fillIndex += 1;
    selectedBySlotId.set(slot.id, athleteId);
  }

  const startingIds: string[] = [];
  const reasons: Record<string, string> = {};
  for (const slot of formation.positions) {
    const athleteId = selectedBySlotId.get(slot.id);
    const athlete = athleteId ? athleteById.get(athleteId) : undefined;
    if (!athleteId || !athlete) continue;
    startingIds.push(athleteId);
    reasons[athleteId] = buildReason(athlete, slot, options.rsvpByAthleteId);
  }

  return { startingIds, reasons };
}

function collectPlanAthleteIds(
  options: StartingXiSuggestionOptions,
): Set<string> {
  const ids = new Set<string>();
  Object.values(options.gamePlanAssignments ?? {}).forEach((id) => {
    if (id) ids.add(id);
  });
  (options.gamePlanSubstituteIds ?? []).forEach((id) => ids.add(id));
  return ids;
}

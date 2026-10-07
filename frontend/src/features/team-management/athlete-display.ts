/**
 * How an athlete's name is written in the squad UI — shared so a player reads
 * the same on the formation preview, the tactical pitch and the role pickers.
 */

import type { BackendAthlete } from "@/services/athletes";

export function athleteFullName(athlete: BackendAthlete): string {
  return `${athlete.firstName} ${athlete.lastName}`.trim();
}

/** "7 · Jane Doe" — the label used in athlete dropdowns. */
export function athleteOptionLabel(athlete: BackendAthlete): string {
  const name = athleteFullName(athlete);
  return athlete.squadNumber != null ? `${athlete.squadNumber} · ${name}` : name;
}

/**
 * The short name printed under a pitch marker: the surname, or "J. Smith-Jones"
 * shortened to "J. Jones" when it would not fit beside its neighbours.
 */
export function athleteShortName(athlete: BackendAthlete): string {
  const last = athlete.lastName.trim();
  const first = athlete.firstName.trim();
  if (!last) return first;

  const needsShort = last.length > 9 || last.includes("-");
  if (!needsShort) return last;

  const tail = last.split(/[\s-]+/).filter(Boolean).at(-1) ?? last;
  const initial = first.charAt(0).toUpperCase();
  return initial ? `${initial}. ${tail}` : tail;
}

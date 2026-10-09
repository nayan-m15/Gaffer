import type { AthleteMatchBreakdown } from "./types";

/** Number of matches shown in the roster panel's recent match log. */
export const RECENT_MATCH_LIMIT = 5;

/**
 * Newest-first selection for the roster panel's recent match log: sorts a
 * copy of the athlete's completed matches by date (descending) and keeps
 * only the most recent entries. The caller's array is never mutated.
 */
export function selectRecentMatches(
  matches: AthleteMatchBreakdown[],
): AthleteMatchBreakdown[] {
  return [...matches]
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
    .slice(0, RECENT_MATCH_LIMIT);
}

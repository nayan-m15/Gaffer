import type { TeamEvent } from "./types";

/** Additional filter applied to match events only; other event types retain their toggles. */
export type MatchCompetitionFilter = "all" | "friendly" | string;

export interface CalendarCompetition {
  id: string;
  name: string;
  type?: string;
  season?: string | null;
}

/** Matches not linked to a league or cup are friendlies (including legacy friendly competitions). */
export function isFriendlyMatch(
  event: Pick<TeamEvent, "competitionId">,
  competitions: readonly CalendarCompetition[],
): boolean {
  if (!event.competitionId) return true;
  return competitions.some(
    (competition) => competition.id === event.competitionId && competition.type === "friendly",
  );
}

export function matchesCompetitionFilter(
  event: Pick<TeamEvent, "type" | "competitionId">,
  filter: MatchCompetitionFilter,
  competitions: readonly CalendarCompetition[],
): boolean {
  if (event.type !== "match" || filter === "all") return true;
  if (filter === "friendly") return isFriendlyMatch(event, competitions);
  return event.competitionId === filter && !isFriendlyMatch(event, competitions);
}

export function getCalendarCompetitionOptions(
  events: readonly Pick<TeamEvent, "type" | "competitionId">[],
  competitions: readonly CalendarCompetition[],
): { value: string; label: string }[] {
  const byId = new Map(competitions.map((competition) => [competition.id, competition]));
  return [...new Set(events
    .filter((event) => event.type === "match" && event.competitionId)
    .map((event) => event.competitionId!))]
    .filter((id) => byId.get(id)?.type !== "friendly")
    .map((id) => {
      const competition = byId.get(id);
      const name = competition?.name.trim() || `Competition (${id.slice(0, 8)})`;
      return {
        value: id,
        label: competition?.season ? `${name} (${competition.season})` : name,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

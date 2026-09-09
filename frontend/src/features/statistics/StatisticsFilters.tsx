import type { CompetitionWithStandings, Season } from "./types";

/**
 * Season and competition filters for the page header.
 *
 * Both write to the URL, so a filtered view can be shared or bookmarked.
 * Native selects, matching the competition filter these replaced and the rest
 * of the statistics forms.
 */
export function StatisticsFilters({
  seasons,
  competitions,
  seasonId,
  competitionId,
  onSeasonChange,
  onCompetitionChange,
}: {
  seasons: Season[];
  competitions: CompetitionWithStandings[];
  seasonId?: string;
  competitionId?: string;
  onSeasonChange: (id: string | undefined) => void;
  onCompetitionChange: (id: string | undefined) => void;
}) {
  if (seasons.length === 0 && competitions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {seasons.length > 0 && (
        <select
          value={seasonId ?? ""}
          onChange={(e) => onSeasonChange(e.target.value || undefined)}
          aria-label="Season"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
        >
          <option value="">All Time</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
              {season.isCurrent ? " (current)" : ""}
            </option>
          ))}
        </select>
      )}

      {competitions.length > 0 && (
        <select
          value={competitionId ?? ""}
          onChange={(e) => onCompetitionChange(e.target.value || undefined)}
          aria-label="Competition"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
        >
          <option value="">All Competitions</option>
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.season ? ` — ${c.season}` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

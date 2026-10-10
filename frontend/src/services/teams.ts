import { apiFetch } from "@/lib/api";

/** One Gaffer team returned by `GET /teams/search`. */
export interface GafferTeamSearchResult {
  id: string;
  name: string;
  primaryColor: string | null;
  coachName?: string | null;
}

/**
 * GET /teams/search?q= — finds other Gaffer teams by team name or the
 * team's coach account name for the friendly-fixture opponent picker. The
 * caller's own team is excluded server-side, so an empty list after a
 * search means no other team matched.
 */
export async function searchGafferTeams(
  query: string,
): Promise<GafferTeamSearchResult[]> {
  const results = await apiFetch<GafferTeamSearchResult[]>(
    `/teams/search?q=${encodeURIComponent(query)}`,
  );
  return [...new Map(results.map((team) => [team.id, team])).values()];
}

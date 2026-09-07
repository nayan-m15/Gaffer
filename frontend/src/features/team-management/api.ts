/**
 * TanStack Query hooks for the Team Management tactical board.
 *
 * The board's squad selection is saved as part of a game plan (see
 * `@/features/team-tactics/api`), so the only data this module fetches is the
 * roster the board places on the pitch.
 */

import { useQuery } from "@tanstack/react-query";
import { getAthletes, type BackendAthlete } from "@/services/athletes";

/**
 * Same key the Athlete Roster uses for its active-athletes query
 * (`["athletes", "active"]`), so roster edits (e.g. changing a player's
 * status) invalidate this cache too and Team Management always reflects
 * the persisted status.
 */
const athletesQueryKey = ["athletes", "active"] as const;

export function useAthletes() {
  return useQuery<BackendAthlete[]>({
    queryKey: athletesQueryKey,
    queryFn: getAthletes,
    staleTime: 30_000,
  });
}

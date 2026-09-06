/**
 * TanStack Query hooks for the Team Management tactical board.
 *
 * The board's squad selection is saved as part of a game plan (see
 * `@/features/team-tactics/api`), so the only data this module fetches is the
 * roster the board places on the pitch.
 */

import { useQuery } from "@tanstack/react-query";
import { getAthletes, type BackendAthlete } from "@/services/athletes";

export function useAthletes() {
  return useQuery<BackendAthlete[]>({
    queryKey: ["athletes"],
    queryFn: getAthletes,
    staleTime: 30_000,
  });
}

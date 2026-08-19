/**
 * TanStack Query hook for fetching active athletes.
 *
 * Reuses the existing `getAthletes` service and shares the `["athletes"]`
 * query key with the Athletes page so data is cached across features.
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

import { queryOptions } from "@tanstack/react-query";
import { fetchCompetitionMatchCentre } from "./api";

/** Completed fixtures rarely change, so keep report data reusable across modal opens. */
export const competitionMatchCentreQueryOptions = (competitionId: string, fixtureId: string) =>
  queryOptions({
    queryKey: ["competition-match-centre", competitionId, fixtureId] as const,
    queryFn: () => fetchCompetitionMatchCentre(competitionId, fixtureId),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
  });

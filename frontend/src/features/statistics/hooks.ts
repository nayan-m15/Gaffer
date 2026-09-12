import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  compareAthletes,
  createCompetition,
  createStanding,
  deleteCompetition,
  deleteStanding,
  getAthleteStatistics,
  getCompetitions,
  getStatistics,
  toUiAthleteComparison,
  toUiAthleteStatistics,
  toUiCompetitions,
  toUiOverview,
  updateCompetition,
  updateStanding,
  type StatisticsFilters,
} from "@/services/statistics";
import {
  createSeason,
  deleteSeason,
  getSeasons,
  toUiSeasons,
  updateSeason,
} from "@/services/seasons";
import type {
  CreateSeasonInput,
  CreateStandingInput,
  UpdateCompetitionInput,
  UpdateSeasonInput,
  UpdateStandingInput,
} from "./types";

/* ── Query keys ───────────────────────────────────────────────────────────── */

/**
 * Every key stays under the "statistics" prefix so the broad
 * `invalidateQueries({ queryKey: ["statistics"] })` calls below still match.
 */
export const statisticsQueryKey = (filters: StatisticsFilters = {}) =>
  [
    "statistics",
    "overview",
    filters.seasonId ?? "all-seasons",
    filters.competitionId ?? "all-competitions",
  ] as const;

export const seasonsQueryKey = ["statistics", "seasons"] as const;

export const athleteComparisonQueryKey = (
  athleteIds: string[],
  seasonId?: string,
) =>
  [
    "statistics",
    "compare",
    [...athleteIds].sort().join(","),
    seasonId ?? "all-seasons",
  ] as const;

export const athleteStatisticsQueryKey = (athleteId: string) =>
  ["statistics", "athlete", athleteId] as const;

export const competitionsQueryKey = ["statistics", "competitions"] as const;

/* ── Read hooks ──────────────────────────────────────────────────────────── */

export function useStatistics(filters: StatisticsFilters = {}) {
  return useQuery({
    queryKey: statisticsQueryKey(filters),
    queryFn: () => getStatistics(filters).then(toUiOverview),
  });
}

export function useSeasons() {
  return useQuery({
    queryKey: seasonsQueryKey,
    queryFn: () => getSeasons().then(toUiSeasons),
  });
}

/** Idle until at least two athletes are selected — the backend rejects fewer. */
export function useAthleteComparison(athleteIds: string[], seasonId?: string) {
  return useQuery({
    queryKey: athleteComparisonQueryKey(athleteIds, seasonId),
    queryFn: () => compareAthletes(athleteIds, seasonId).then(toUiAthleteComparison),
    enabled: athleteIds.length >= 2,
  });
}

export function useAthleteStatistics(athleteId: string | null) {
  return useQuery({
    queryKey: athleteStatisticsQueryKey(athleteId ?? ""),
    queryFn: () => getAthleteStatistics(athleteId!).then(toUiAthleteStatistics),
    enabled: !!athleteId,
  });
}

export function useCompetitions() {
  return useQuery({
    queryKey: competitionsQueryKey,
    queryFn: () => getCompetitions().then(toUiCompetitions),
  });
}

/* ── Season mutations ─────────────────────────────────────────────────────── */

/**
 * Season edits change which matches every aggregate covers, so they invalidate
 * the whole "statistics" tree rather than just the season list.
 */
function useSeasonMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["statistics"] });
    },
  });
}

export function useCreateSeason() {
  return useSeasonMutation((input: CreateSeasonInput) => createSeason(input));
}

export function useUpdateSeason() {
  return useSeasonMutation(({ id, input }: { id: string; input: UpdateSeasonInput }) =>
    updateSeason(id, input),
  );
}

export function useDeleteSeason() {
  return useSeasonMutation((id: string) => deleteSeason(id));
}

/* ── Competition mutations ───────────────────────────────────────────────── */

export function useCreateCompetition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCompetition,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: competitionsQueryKey });
    },
  });
}

export function useUpdateCompetition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCompetitionInput }) =>
      updateCompetition(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: competitionsQueryKey });
    },
  });
}

export function useDeleteCompetition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCompetition,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: competitionsQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["statistics"] });
    },
  });
}

/* ── Standing mutations ───────────────────────────────────────────────────── */

export function useCreateStanding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      competitionId,
      input,
    }: {
      competitionId: string;
      input: CreateStandingInput;
    }) => createStanding(competitionId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: competitionsQueryKey });
    },
  });
}

export function useUpdateStanding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStandingInput }) =>
      updateStanding(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: competitionsQueryKey });
    },
  });
}

export function useDeleteStanding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteStanding,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: competitionsQueryKey });
    },
  });
}

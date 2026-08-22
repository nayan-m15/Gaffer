import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompetition,
  createStanding,
  deleteCompetition,
  deleteStanding,
  getAthleteStatistics,
  getCompetitions,
  getStatistics,
  toUiAthleteStatistics,
  toUiCompetitions,
  toUiOverview,
  updateCompetition,
  updateStanding,
} from "@/services/statistics";
import type {
  CreateStandingInput,
  UpdateCompetitionInput,
  UpdateStandingInput,
} from "./types";

/* ── Query keys ───────────────────────────────────────────────────────────── */

export const statisticsQueryKey = (competitionId?: string) =>
  competitionId
    ? (["statistics", competitionId] as const)
    : (["statistics", "all"] as const);

export const athleteStatisticsQueryKey = (athleteId: string) =>
  ["statistics", "athlete", athleteId] as const;

export const competitionsQueryKey = ["statistics", "competitions"] as const;

/* ── Read hooks ──────────────────────────────────────────────────────────── */

export function useStatistics(competitionId?: string) {
  return useQuery({
    queryKey: statisticsQueryKey(competitionId),
    queryFn: () => getStatistics(competitionId).then(toUiOverview),
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

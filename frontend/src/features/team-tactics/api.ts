/**
 * TanStack Query hooks for the Team Tactics screen.
 *
 * `useGamePlans` lists a team's saved game plans (squad selection + FIFA-style
 * tactical profile in one record); the mutation hooks persist changes so a
 * coach can keep several named plans and switch between them per fixture.
 *
 * Athletes are not queried here — the Team Management board owns the roster
 * query (`useAthletes` in `@/features/team-management/api`, keyed
 * `["athletes", "active"]` to share the Athlete Roster's cache) and passes
 * the data down.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGamePlan,
  deleteGamePlan,
  getGamePlan,
  getGamePlans,
  updateGamePlan,
  type BackendGamePlan,
  type CreateGamePlanInput,
  type UpdateGamePlanInput,
} from "@/services/gamePlans";

export const gamePlansQueryKey = ["game-plans"] as const;

export function useGamePlans() {
  return useQuery<BackendGamePlan[]>({
    queryKey: gamePlansQueryKey,
    queryFn: getGamePlans,
    staleTime: 30_000,
  });
}

export function useGamePlan(id: string | undefined) {
  return useQuery<BackendGamePlan>({
    queryKey: [...gamePlansQueryKey, id],
    queryFn: () => getGamePlan(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export function useCreateGamePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateGamePlanInput) => createGamePlan(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: gamePlansQueryKey });
    },
  });
}

export function useUpdateGamePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGamePlanInput }) =>
      updateGamePlan(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: gamePlansQueryKey });
    },
  });
}

export function useDeleteGamePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteGamePlan(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: gamePlansQueryKey });
    },
  });
}

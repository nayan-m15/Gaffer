/**
 * TanStack Query hooks for the Team Tactics screen.
 *
 * `useGamePlans` lists a team's saved game plans (FIFA-style tactical
 * profiles); the mutation hooks persist changes so a coach can keep several
 * named plans and switch between them per fixture.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAthletes, type BackendAthlete } from "@/services/athletes";
import {
  createGamePlan,
  deleteGamePlan,
  getGamePlans,
  updateGamePlan,
  type BackendGamePlan,
  type CreateGamePlanInput,
  type UpdateGamePlanInput,
} from "@/services/gamePlans";

/** Active athletes for the current team — shares the roster query cache. */
export function useAthletes() {
  return useQuery<BackendAthlete[]>({
    queryKey: ["athletes"],
    queryFn: getAthletes,
    staleTime: 30_000,
  });
}

export const gamePlansQueryKey = ["game-plans"] as const;

export function useGamePlans() {
  return useQuery<BackendGamePlan[]>({
    queryKey: gamePlansQueryKey,
    queryFn: getGamePlans,
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

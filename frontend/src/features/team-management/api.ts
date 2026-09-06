/**
 * TanStack Query hooks for the Team Management tactical board.
 *
 * `useAthletes` fetches active athletes. `useLineups` lists a team's saved
 * lineups; `useCreateLineup` / `useUpdateLineup` / `useDeleteLineup` persist
 * changes so a coach can save multiple named lineups and switch between them.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAthletes, type BackendAthlete } from "@/services/athletes";
import {
  createLineup,
  deleteLineup,
  getLineups,
  updateLineup,
  type BackendLineup,
  type CreateLineupInput,
  type UpdateLineupInput,
} from "@/services/lineups";

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

export const lineupsQueryKey = ["lineups"] as const;

export function useLineups() {
  return useQuery<BackendLineup[]>({
    queryKey: lineupsQueryKey,
    queryFn: getLineups,
    staleTime: 30_000,
  });
}

export function useCreateLineup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLineupInput) => createLineup(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: lineupsQueryKey });
    },
  });
}

export function useUpdateLineup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLineupInput }) =>
      updateLineup(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: lineupsQueryKey });
    },
  });
}

export function useDeleteLineup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteLineup(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: lineupsQueryKey });
    },
  });
}

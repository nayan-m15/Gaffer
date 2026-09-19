import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import * as api from "./api";

function useCompetitionKey() {
  const { user } = useAuth();
  return ["shared-competitions", user?.id] as const;
}

export function useMyCompetitions() {
  return useQuery({ queryKey: [...useCompetitionKey(), "mine"], queryFn: api.fetchMyCompetitions });
}

export function useCompetitionSearch(term: string) {
  return useQuery({
    queryKey: [...useCompetitionKey(), "search", term],
    queryFn: () => api.searchCompetitions(term),
    enabled: term.trim().length >= 2,
  });
}

export function useCompetition(id: string) {
  return useQuery({ queryKey: [...useCompetitionKey(), "detail", id], queryFn: () => api.fetchCompetition(id) });
}

export function useCompetitionInvites(id: string, isAdmin: boolean) {
  return useQuery({
    queryKey: [...useCompetitionKey(), "invites", id],
    queryFn: () => api.fetchInvites(id),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });
}

export function useCompetitionMutation<T, R>(mutationFn: (input: T) => Promise<R>) {
  const client = useQueryClient();
  const queryKey = useCompetitionKey();
  return useMutation({
    mutationFn,
    // An email delivery failure can revoke the previous pending invite too.
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
}

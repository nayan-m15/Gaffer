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

export function useCompetition(id: string | null | undefined) {
  return useQuery({
    queryKey: [...useCompetitionKey(), "detail", id ?? ""],
    queryFn: () => api.fetchCompetition(id!),
    enabled: Boolean(id),
  });
}

export function useCompetitionFixtures(id: string | null | undefined) {
  return useQuery({
    queryKey: [...useCompetitionKey(), "fixtures", id ?? ""],
    queryFn: () => api.fetchCompetitionFixtures(id!),
    enabled: Boolean(id),
    // Fixture confirmations can come from the opposing coach in another
    // session. Poll lightly while this page is open so agreements and
    // counter-proposals appear without requiring a manual refresh.
    refetchInterval: 30_000,
  });
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
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey }),
        client.invalidateQueries({ queryKey: ["statistics"] }),
        // Fixture schedule negotiation can move generated calendar events, so
        // keep every calendar/dashboard consumer in sync with the database
        // trigger that mirrors competition fixture dates into Events.
        client.invalidateQueries({ queryKey: ["events"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
        client.invalidateQueries({ queryKey: ["player"] }),
      ]);
    },
  });
}

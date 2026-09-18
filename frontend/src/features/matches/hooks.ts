import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  createMatchLogEvent,
  deleteMatchLogEvent,
  fetchMatch,
  fetchMatchEvents,
  fetchMatchOpponentSquad,
  fetchMatchSquad,
  finishMatch,
  updateMatchLogEvent,
  updateMatchClock,
} from "./api";
import { subscribeToSyncedMatchEventChanges } from "@/offline/match-store";
import type {
  CreateMatchLogEventInput,
  MatchEventTeam,
  MatchEventType,
  MatchLogEvent,
  MatchRecord,
  MatchSquadAthlete,
  UpdateMatchLogEventInput,
} from "./types";

export const matchQueryKey = (matchId: string) =>
  ["matches", matchId] as const;
export const matchSquadQueryKey = (matchId: string) =>
  ["matches", matchId, "squad"] as const;
export const matchEventsQueryKey = (matchId: string) =>
  ["matches", matchId, "events"] as const;
export const matchOpponentSquadQueryKey = (matchId: string) =>
  ["matches", matchId, "opponent-squad"] as const;

const MATCH_QUERY_STALE_MS = 5_000;

export function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: matchQueryKey(matchId ?? ""),
    queryFn: () => fetchMatch(matchId!),
    enabled: Boolean(matchId),
    staleTime: MATCH_QUERY_STALE_MS,
  });
}

export function useMatchSquad(matchId: string | undefined) {
  return useQuery({
    queryKey: matchSquadQueryKey(matchId ?? ""),
    queryFn: () => fetchMatchSquad(matchId!),
    enabled: Boolean(matchId),
    staleTime: MATCH_QUERY_STALE_MS,
  });
}

export function useMatchEvents(matchId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!matchId) return;

    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    void subscribeToSyncedMatchEventChanges(() => {
      void queryClient.invalidateQueries({
        queryKey: matchEventsQueryKey(matchId),
      });
      void queryClient.invalidateQueries({ queryKey: matchQueryKey(matchId) });
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unsubscribe = dispose;
      })
      .catch((error: unknown) => {
        console.warn("Could not subscribe to synced match events.", error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [matchId, queryClient]);

  return useQuery({
    queryKey: matchEventsQueryKey(matchId ?? ""),
    queryFn: () => fetchMatchEvents(matchId!),
    enabled: Boolean(matchId),
    staleTime: MATCH_QUERY_STALE_MS,
  });
}

export function useMatchOpponentSquad(matchId: string | undefined) {
  return useQuery({
    queryKey: matchOpponentSquadQueryKey(matchId ?? ""),
    queryFn: () => fetchMatchOpponentSquad(matchId!),
    enabled: Boolean(matchId),
    staleTime: MATCH_QUERY_STALE_MS,
  });
}

function eventsKey(matchId: string) {
  return matchEventsQueryKey(matchId);
}

function matchKey(matchId: string) {
  return matchQueryKey(matchId);
}

function squadFromCache(queryClient: QueryClient, matchId: string) {
  return queryClient.getQueryData<MatchSquadAthlete[]>(
    matchSquadQueryKey(matchId),
  );
}

function resolveAthlete(
  athleteId: string | null,
  squad: MatchSquadAthlete[] | undefined,
  fallback: MatchSquadAthlete | null = null,
): MatchSquadAthlete | null {
  if (!athleteId) {
    return null;
  }
  return squad?.find((athlete) => athlete.id === athleteId) ?? fallback;
}

function asIso(value: string | Date | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function bumpScore(
  match: MatchRecord,
  team: MatchEventTeam,
  delta: number,
): MatchRecord {
  if (delta === 0) {
    return match;
  }
  if (team === "own") {
    return {
      ...match,
      teamScore: Math.max(0, match.teamScore + delta),
    };
  }
  return {
    ...match,
    opponentScore: Math.max(0, match.opponentScore + delta),
  };
}

function applyScoreDelta(
  queryClient: QueryClient,
  matchId: string,
  team: MatchEventTeam,
  delta: number,
) {
  if (delta === 0) {
    return;
  }
  queryClient.setQueryData<MatchRecord>(matchKey(matchId), (current) =>
    current ? bumpScore(current, team, delta) : current,
  );
}

function scoreDeltaForTypeChange(
  previousType: MatchEventType,
  nextType: MatchEventType | undefined,
): number {
  if (nextType === undefined || nextType === previousType) {
    return 0;
  }
  const wasGoal = previousType === "goal";
  const nowGoal = nextType === "goal";
  if (wasGoal === nowGoal) {
    return 0;
  }
  return nowGoal ? 1 : -1;
}

function mergeServerEvent(
  server: MatchLogEvent,
  previous: MatchLogEvent,
  queryClient: QueryClient,
  matchId: string,
): MatchLogEvent {
  const squad = squadFromCache(queryClient, matchId);
  const athleteId = server.athleteId ?? previous.athleteId;
  return {
    ...previous,
    ...server,
    id: server.id,
    athleteId,
    athlete:
      server.athlete ??
      resolveAthlete(athleteId, squad, previous.athlete),
    pending: server.pending ?? false,
    syncStatus: server.syncStatus ?? "synced",
    syncError: server.syncError ?? null,
    createdAt: asIso(server.createdAt, previous.createdAt),
    updatedAt: asIso(server.updatedAt, previous.updatedAt),
    optimisticKey: previous.optimisticKey,
  };
}

type LogMutateContext = {
  tempId: string;
  scoreTeam: MatchEventTeam | null;
};

type UpdateMutateContext = {
  previousEvent: MatchLogEvent | null;
  scoreTeam: MatchEventTeam | null;
  scoreDelta: number;
};

type DeleteMutateContext = {
  removed: MatchLogEvent | null;
  index: number;
  scoreTeam: MatchEventTeam | null;
};

export function useLogMatchEvent(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    // The mutation function writes to SQLite before attempting HTTP, so it
    // must run while the browser reports offline. TanStack otherwise pauses
    // it before createMatchLogEvent can reach the durable local queue.
    networkMode: "always",
    mutationFn: (input: CreateMatchLogEventInput) =>
      createMatchLogEvent(matchId, input),
    onMutate: async (input) => {
      const affectsScore = input.eventType === "goal";
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      // A request that was already refetching when connectivity disappeared
      // may not settle promptly. Do not let cancelling it block the local
      // optimistic row or the durable SQLite enqueue.
      if (!offline) {
        await queryClient.cancelQueries({ queryKey: eventsKey(matchId) });
        if (affectsScore) {
          await queryClient.cancelQueries({ queryKey: matchKey(matchId) });
        }
      }

      const previousEvents = queryClient.getQueryData<MatchLogEvent[]>(
        eventsKey(matchId),
      );
      const squad = squadFromCache(queryClient, matchId);
      const tempId = `optimistic-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimistic: MatchLogEvent = {
        id: tempId,
        matchId,
        athleteId: input.athleteId ?? null,
        team: input.team,
        opponentLabel: input.opponentLabel ?? null,
        opponentPlayerId: input.opponentPlayerId ?? null,
        eventType: input.eventType,
        minute: input.minute,
        detail: input.detail ?? null,
        loggedByUserId: "",
        manuallyAdjusted: false,
        createdAt: now,
        updatedAt: now,
        athlete: resolveAthlete(input.athleteId ?? null, squad),
        opponentPlayer:
          input.opponentPlayerId
            ? queryClient
                .getQueryData<MatchRecord>(matchKey(matchId))
                ?.opponentSquad.find(
                  (player) => player.id === input.opponentPlayerId,
                ) ?? null
            : null,
        pending: true,
        optimisticKey: tempId,
      };

      queryClient.setQueryData<MatchLogEvent[]>(eventsKey(matchId), [
        optimistic,
        ...(previousEvents ?? []),
      ]);

      if (affectsScore) {
        applyScoreDelta(queryClient, matchId, input.team, 1);
      }

      return {
        tempId,
        scoreTeam: affectsScore ? input.team : null,
      } satisfies LogMutateContext;
    },
    onError: (_error, _input, context) => {
      if (!context) {
        return;
      }
      queryClient.setQueryData<MatchLogEvent[]>(
        eventsKey(matchId),
        (current) => (current ?? []).filter((event) => event.id !== context.tempId),
      );
      if (context.scoreTeam) {
        applyScoreDelta(queryClient, matchId, context.scoreTeam, -1);
      }
    },
    onSuccess: (created, input, context) => {
      queryClient.setQueryData<MatchLogEvent[]>(
        eventsKey(matchId),
        (current) => {
          if (!current) {
            return current;
          }
          return current.map((event) =>
            event.id === context?.tempId
              ? mergeServerEvent(created, event, queryClient, matchId)
              : event,
          );
        },
      );
      if (input.eventType === "goal") {
        void queryClient.invalidateQueries({ queryKey: matchKey(matchId) });
      }
      void queryClient.invalidateQueries({ queryKey: ["statistics"] });
    },
  });
}

export function useUpdateMatchEvent(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: UpdateMatchLogEventInput;
    }) => updateMatchLogEvent(matchId, eventId, input),
    onMutate: async ({ eventId, input }) => {
      await queryClient.cancelQueries({ queryKey: eventsKey(matchId) });

      const previousEvents = queryClient.getQueryData<MatchLogEvent[]>(
        eventsKey(matchId),
      );
      const previousEvent =
        previousEvents?.find((event) => event.id === eventId) ?? null;
      const scoreDelta = previousEvent
        ? scoreDeltaForTypeChange(previousEvent.eventType, input.eventType)
        : 0;
      if (scoreDelta !== 0 && previousEvent) {
        await queryClient.cancelQueries({ queryKey: matchKey(matchId) });
      }

      if (previousEvent) {
        const squad = squadFromCache(queryClient, matchId);
        const nextAthleteId =
          input.athleteId !== undefined
            ? input.athleteId
            : previousEvent.athleteId;
        const optimistic: MatchLogEvent = {
          ...previousEvent,
          athleteId: nextAthleteId,
          opponentLabel:
            input.opponentLabel !== undefined
              ? input.opponentLabel
              : previousEvent.opponentLabel,
          opponentPlayerId:
            input.opponentPlayerId !== undefined
              ? input.opponentPlayerId
              : previousEvent.opponentPlayerId,
          opponentPlayer:
            input.opponentPlayerId === null
              ? null
              : previousEvent.opponentPlayer,
          minute: input.minute ?? previousEvent.minute,
          eventType: input.eventType ?? previousEvent.eventType,
          detail:
            input.detail !== undefined ? input.detail : previousEvent.detail,
          athlete:
            input.athleteId !== undefined
              ? resolveAthlete(input.athleteId, squad)
              : previousEvent.athlete,
          pending: true,
          updatedAt: new Date().toISOString(),
        };
        queryClient.setQueryData<MatchLogEvent[]>(
          eventsKey(matchId),
          (current) =>
            (current ?? []).map((event) =>
              event.id === eventId ? optimistic : event,
            ),
        );
        if (scoreDelta !== 0) {
          applyScoreDelta(queryClient, matchId, previousEvent.team, scoreDelta);
        }
      }

      return {
        previousEvent,
        scoreTeam: scoreDelta !== 0 && previousEvent ? previousEvent.team : null,
        scoreDelta,
      } satisfies UpdateMutateContext;
    },
    onError: (_error, { eventId }, context) => {
      if (!context?.previousEvent) {
        return;
      }
      queryClient.setQueryData<MatchLogEvent[]>(
        eventsKey(matchId),
        (current) =>
          (current ?? []).map((event) =>
            event.id === eventId ? context.previousEvent! : event,
          ),
      );
      if (context.scoreTeam && context.scoreDelta) {
        applyScoreDelta(
          queryClient,
          matchId,
          context.scoreTeam,
          -context.scoreDelta,
        );
      }
    },
    onSuccess: (updated, { eventId, input }, context) => {
      queryClient.setQueryData<MatchLogEvent[]>(
        eventsKey(matchId),
        (current) => {
          if (!current) {
            return current;
          }
          return current.map((event) =>
            event.id === eventId
              ? mergeServerEvent(updated, event, queryClient, matchId)
              : event,
          );
        },
      );
      if (context?.scoreDelta) {
        void queryClient.invalidateQueries({ queryKey: matchKey(matchId) });
      } else if (!context?.previousEvent) {
        void queryClient.invalidateQueries({ queryKey: eventsKey(matchId) });
        if (input.eventType === "goal") {
          void queryClient.invalidateQueries({ queryKey: matchKey(matchId) });
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["statistics"] });
    },
  });
}

export function useDeleteMatchEvent(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => deleteMatchLogEvent(matchId, eventId),
    onMutate: async (eventId) => {
      await queryClient.cancelQueries({ queryKey: eventsKey(matchId) });

      const previousEvents = queryClient.getQueryData<MatchLogEvent[]>(
        eventsKey(matchId),
      );
      const index = previousEvents?.findIndex((event) => event.id === eventId) ?? -1;
      const removed = index >= 0 ? (previousEvents?.[index] ?? null) : null;
      const wasGoal = removed?.eventType === "goal";
      if (wasGoal) {
        await queryClient.cancelQueries({ queryKey: matchKey(matchId) });
      }

      queryClient.setQueryData<MatchLogEvent[]>(
        eventsKey(matchId),
        (current) => (current ?? []).filter((event) => event.id !== eventId),
      );
      if (wasGoal && removed) {
        applyScoreDelta(queryClient, matchId, removed.team, -1);
      }

      return {
        removed,
        index,
        scoreTeam: wasGoal && removed ? removed.team : null,
      } satisfies DeleteMutateContext;
    },
    onError: (_error, _eventId, context) => {
      if (!context?.removed) {
        return;
      }
      queryClient.setQueryData<MatchLogEvent[]>(
        eventsKey(matchId),
        (current) => {
          const next = [...(current ?? [])];
          const insertAt = Math.min(
            Math.max(context.index, 0),
            next.length,
          );
          next.splice(insertAt, 0, context.removed!);
          return next;
        },
      );
      if (context.scoreTeam) {
        applyScoreDelta(queryClient, matchId, context.scoreTeam, 1);
      }
    },
    onSuccess: (_deleted, _eventId, context) => {
      if (context?.scoreTeam) {
        void queryClient.invalidateQueries({ queryKey: matchKey(matchId) });
      }
      void queryClient.invalidateQueries({ queryKey: ["statistics"] });
    },
  });
}

export function useFinishMatch(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => finishMatch(matchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: matchQueryKey(matchId) });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useUpdateMatchClock(matchId: string) {
  return useMutation({
    scope: { id: `match-clock-${matchId}` },
    mutationFn: (input: Parameters<typeof updateMatchClock>[1]) =>
      updateMatchClock(matchId, input),
  });
}

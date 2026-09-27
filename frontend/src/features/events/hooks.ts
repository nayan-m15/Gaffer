import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelEvent,
  createEvent,
  fetchEvent,
  fetchEventWeather,
  fetchEvents,
  startMatch,
  updateEvent,
} from "./api";
import type { StartMatchInput, UpdateEventInput } from "./types";

export const eventsQueryKey = ["events"] as const;

/** Ticks so past `scheduled` events can flip to a completed display status. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}

export function useEvents() {
  return useQuery({
    queryKey: eventsQueryKey,
    queryFn: fetchEvents,
  });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: [...eventsQueryKey, eventId],
    queryFn: () => fetchEvent(eventId!),
    enabled: Boolean(eventId),
  });
}

export function useEventWeather(
  eventId: string | undefined,
  scheduledAt: string | undefined,
  weatherLatitude: number | null | undefined,
  weatherLongitude: number | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      ...eventsQueryKey,
      eventId,
      "weather",
      scheduledAt,
      weatherLatitude,
      weatherLongitude,
    ],
    queryFn: () => fetchEventWeather(eventId!),
    enabled: enabled && Boolean(eventId),
    staleTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 10_000),
    refetchInterval: (query) =>
      query.state.data?.status === "unavailable" ? 60_000 : 30 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
}

async function invalidateEventData(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: eventsQueryKey }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  ]);
}

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createEvent,
    onSuccess: async () => {
      await invalidateEventData(queryClient);
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEventInput }) =>
      updateEvent(id, input),
    onSuccess: async () => {
      await invalidateEventData(queryClient);
    },
  });
}

export function useCancelEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelEvent,
    onSuccess: async () => {
      await invalidateEventData(queryClient);
    },
  });
}

export function useStartMatch(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: StartMatchInput) => startMatch(eventId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: eventsQueryKey });
    },
  });
}

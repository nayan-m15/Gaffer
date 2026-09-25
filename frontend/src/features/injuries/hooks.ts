import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closeInjury,
  createInjury,
  createInjuryTimelineEntry,
  deleteInjury,
  fetchInjuries,
  fetchInjury,
  fetchInjuryProtocol,
  fetchInjuryRecovery,
  updateInjury,
} from "./api";
import type {
  BodyRegion,
  CloseInjuryInput,
  CreateInjuryInput,
  CreateInjuryTimelineEntryInput,
  InjurySeverity,
  InjuryType,
  ListInjuriesQuery,
  UpdateInjuryInput,
} from "./types";

export const injuriesQueryKey = (query: ListInjuriesQuery = {}) =>
  ["injuries", query.status ?? "all", query.athleteId ?? "any"] as const;
export const injuryQueryKey = (injuryId: string) =>
  ["injuries", "detail", injuryId] as const;
export const injuryRecoveryQueryKey = (athleteId: string) =>
  ["injuries", "recovery", athleteId] as const;
export const injuryProtocolQueryKey = (
  bodyRegion: BodyRegion,
  injuryType: InjuryType,
  severity: InjurySeverity,
) => ["injuries", "protocol", bodyRegion, injuryType, severity] as const;

const INJURY_STALE_MS = 30_000;

export function useInjuries(query: ListInjuriesQuery = {}) {
  return useQuery({
    queryKey: injuriesQueryKey(query),
    queryFn: () => fetchInjuries(query),
    staleTime: INJURY_STALE_MS,
  });
}

export function useInjury(injuryId: string | undefined) {
  return useQuery({
    queryKey: injuryQueryKey(injuryId ?? ""),
    queryFn: () => fetchInjury(injuryId!),
    enabled: Boolean(injuryId),
    staleTime: INJURY_STALE_MS,
  });
}

export function useInjuryRecovery(athleteId: string | undefined) {
  return useQuery({
    queryKey: injuryRecoveryQueryKey(athleteId ?? ""),
    queryFn: () => fetchInjuryRecovery(athleteId!),
    enabled: Boolean(athleteId),
    staleTime: INJURY_STALE_MS,
  });
}

/**
 * Return-time guidance for a diagnosis in progress.
 *
 * Guidance is derived from a static table, so it is cached indefinitely —
 * the same three selections always resolve to the same window, and the
 * live-logger wizard re-queries on every tap.
 */
export function useInjuryProtocol(input: {
  bodyRegion: BodyRegion | null;
  injuryType: InjuryType | null;
  severity: InjurySeverity | null;
  occurredOn?: string;
}) {
  const ready = Boolean(input.bodyRegion && input.injuryType && input.severity);

  return useQuery({
    queryKey: injuryProtocolQueryKey(
      input.bodyRegion ?? ("head" as BodyRegion),
      input.injuryType ?? ("other" as InjuryType),
      input.severity ?? ("minor" as InjurySeverity),
    ),
    queryFn: () =>
      fetchInjuryProtocol({
        bodyRegion: input.bodyRegion!,
        injuryType: input.injuryType!,
        severity: input.severity!,
        ...(input.occurredOn ? { occurredOn: input.occurredOn } : {}),
      }),
    enabled: ready,
    staleTime: Infinity,
  });
}

/**
 * Invalidates every injury query plus the roster, because creating or
 * closing a record also moves `athletes.status` between available and
 * injured — a roster left in cache would contradict the page the coach is
 * looking at.
 */
function useInjuryInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: ["injuries"] });
    void queryClient.invalidateQueries({ queryKey: ["athletes"] });
  };
}

export function useCreateInjury() {
  const invalidate = useInjuryInvalidation();

  return useMutation({
    mutationFn: (input: CreateInjuryInput) => createInjury(input),
    onSuccess: invalidate,
  });
}

export function useUpdateInjury() {
  const invalidate = useInjuryInvalidation();

  return useMutation({
    mutationFn: ({
      injuryId,
      input,
    }: {
      injuryId: string;
      input: UpdateInjuryInput;
    }) => updateInjury(injuryId, input),
    onSuccess: invalidate,
  });
}

export function useCloseInjury() {
  const invalidate = useInjuryInvalidation();

  return useMutation({
    mutationFn: ({
      injuryId,
      input,
    }: {
      injuryId: string;
      input: CloseInjuryInput;
    }) => closeInjury(injuryId, input),
    onSuccess: invalidate,
  });
}

export function useAddInjuryTimelineEntry() {
  const invalidate = useInjuryInvalidation();

  return useMutation({
    mutationFn: ({
      injuryId,
      input,
    }: {
      injuryId: string;
      input: CreateInjuryTimelineEntryInput;
    }) => createInjuryTimelineEntry(injuryId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteInjury() {
  const invalidate = useInjuryInvalidation();

  return useMutation({
    mutationFn: (injuryId: string) => deleteInjury(injuryId),
    onSuccess: invalidate,
  });
}

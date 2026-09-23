import { apiFetch } from "@/lib/api";
import type {
  CloseInjuryInput,
  CreateInjuryInput,
  CreateInjuryTimelineEntryInput,
  InjuryDetail,
  InjuryListItem,
  InjuryProtocolPreview,
  InjurySeverity,
  InjuryTimelineEntry,
  InjuryType,
  ListInjuriesQuery,
  RecoveryReading,
  UpdateInjuryInput,
  BodyRegion,
} from "./types";

function injuriesPath(query: ListInjuriesQuery = {}) {
  const params = new URLSearchParams();
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.athleteId) {
    params.set("athleteId", query.athleteId);
  }
  const search = params.toString();

  return search ? `/injuries?${search}` : "/injuries";
}

export function fetchInjuries(query: ListInjuriesQuery = {}) {
  return apiFetch<InjuryListItem[]>(injuriesPath(query));
}

export function fetchInjury(injuryId: string) {
  return apiFetch<InjuryDetail>(`/injuries/${injuryId}`);
}

export function fetchInjuryRecovery(athleteId: string) {
  return apiFetch<RecoveryReading[]>(`/injuries/recovery/${athleteId}`);
}

/**
 * Return-time guidance for a diagnosis that has not been saved yet.
 *
 * The guidance table lives on the backend so the window previewed in the
 * live-logger wizard and the window persisted on the record can never drift
 * apart.
 */
export function fetchInjuryProtocol(input: {
  bodyRegion: BodyRegion;
  injuryType: InjuryType;
  severity: InjurySeverity;
  occurredOn?: string;
}) {
  const params = new URLSearchParams({
    bodyRegion: input.bodyRegion,
    injuryType: input.injuryType,
    severity: input.severity,
  });
  if (input.occurredOn) {
    params.set("occurredOn", input.occurredOn);
  }

  return apiFetch<InjuryProtocolPreview>(`/injuries/protocol?${params}`);
}

export function createInjury(input: CreateInjuryInput) {
  return apiFetch<InjuryDetail>("/injuries", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateInjury(injuryId: string, input: UpdateInjuryInput) {
  return apiFetch<InjuryDetail>(`/injuries/${injuryId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function closeInjury(injuryId: string, input: CloseInjuryInput) {
  return apiFetch<InjuryDetail>(`/injuries/${injuryId}/close`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function createInjuryTimelineEntry(
  injuryId: string,
  input: CreateInjuryTimelineEntryInput,
) {
  return apiFetch<InjuryTimelineEntry>(`/injuries/${injuryId}/timeline`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteInjury(injuryId: string) {
  return apiFetch<{ id: string }>(`/injuries/${injuryId}`, {
    method: "DELETE",
  });
}

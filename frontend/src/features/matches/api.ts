import { apiFetch } from "@/lib/api";
import type {
  CreateMatchLogEventInput,
  MatchLogEvent,
  MatchRecord,
  MatchSquadAthlete,
  UpdateMatchLogEventInput,
} from "./types";

export function fetchMatch(matchId: string) {
  return apiFetch<MatchRecord>(`/matches/${matchId}`);
}

export function fetchMatchSquad(matchId: string) {
  return apiFetch<MatchSquadAthlete[]>(`/matches/${matchId}/squad`);
}

export function fetchMatchEvents(matchId: string) {
  return apiFetch<MatchLogEvent[]>(`/matches/${matchId}/events`);
}

export function createMatchLogEvent(
  matchId: string,
  input: CreateMatchLogEventInput,
) {
  return apiFetch<MatchLogEvent>(`/matches/${matchId}/events`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMatchLogEvent(
  matchId: string,
  eventId: string,
  input: UpdateMatchLogEventInput,
) {
  return apiFetch<MatchLogEvent>(`/matches/${matchId}/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteMatchLogEvent(matchId: string, eventId: string) {
  return apiFetch<MatchLogEvent>(`/matches/${matchId}/events/${eventId}`, {
    method: "DELETE",
  });
}

export function finishMatch(matchId: string) {
  return apiFetch<MatchRecord>(`/matches/${matchId}/finish`, {
    method: "POST",
  });
}

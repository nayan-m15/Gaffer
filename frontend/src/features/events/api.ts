import { apiFetch } from "@/lib/api";
import type {
  CreateEventInput,
  EventWeather,
  LocationSearchResult,
  MatchRecord,
  StartMatchInput,
  TeamEvent,
  UpdateEventInput,
} from "./types";

export function fetchEvents() {
  return apiFetch<TeamEvent[]>("/events");
}

export function fetchEvent(id: string) {
  return apiFetch<TeamEvent>(`/events/${id}`);
}

export function fetchEventWeather(id: string) {
  return apiFetch<EventWeather>(`/events/${id}/weather`);
}

export function searchLocations(query: string) {
  return apiFetch<LocationSearchResult[]>(
    `/locations/search?q=${encodeURIComponent(query)}`,
  );
}

export function createEvent(input: CreateEventInput) {
  return apiFetch<TeamEvent>("/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEvent(id: string, input: UpdateEventInput) {
  return apiFetch<TeamEvent>(`/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function cancelEvent(id: string) {
  return apiFetch<TeamEvent>(`/events/${id}`, {
    method: "DELETE",
  });
}

export function startMatch(eventId: string, input: StartMatchInput) {
  return apiFetch<MatchRecord>(`/events/${eventId}/start-match`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

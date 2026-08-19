import { apiFetch } from "@/lib/api";
import type { CreateEventInput, TeamEvent, UpdateEventInput } from "./types";

export function fetchEvents() {
  return apiFetch<TeamEvent[]>("/events");
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

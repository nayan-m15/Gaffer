import { apiFetch, ApiError } from "@/lib/api";
import { apiUrl } from "@/lib/api-url";
import type { FriendlyOpponentLineup } from "@/features/matches/types";
import type {
  ConfirmLineupInput,
  CreateEventInput,
  EventLineup,
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

/** The opposing Gaffer team's confirmed lineup for an accepted friendly. */
export function fetchFriendlyOpponentLineup(eventId: string) {
  return apiFetch<FriendlyOpponentLineup>(
    `/events/${eventId}/friendly-opponent-lineup`,
  );
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

/**
 * The signed-in team's confirmed pre-match lineup, or null when none is
 * stored yet. The backend serializes a null body as an empty 200, which
 * `apiFetch` rejects, so this uses a raw fetch and treats absence as null.
 */
export async function fetchEventLineup(
  eventId: string,
): Promise<EventLineup | null> {
  const response = await fetch(apiUrl(`/events/${eventId}/lineup`), {
    credentials: "include",
  });

  if (!response.ok) {
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    const body = isJson ? await response.json().catch(() => null) : null;
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : undefined) ?? "Request failed.";
    throw new ApiError(message, response.status);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as EventLineup) : null;
}

/** Confirms (or replaces) the pre-match lineup without starting the match. */
export function confirmEventLineup(
  eventId: string,
  input: ConfirmLineupInput,
) {
  return apiFetch<EventLineup>(`/events/${eventId}/lineup`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

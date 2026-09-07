import { apiFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type RsvpStatus = "going" | "not_going" | "maybe";

export interface CreateRsvpInput {
  status: RsvpStatus;
  note?: string;
}

/** A single RSVP row returned by the backend. */
export interface RsvpRow {
  id: string;
  eventId: string;
  athleteId: string;
  status: RsvpStatus;
  note: string | null;
  respondedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One athlete's RSVP for a given event, as returned by
 * `GET /events/:eventId/rsvps`. Includes the athlete's identity alongside
 * their RSVP response.
 */
export interface AthleteRsvp {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  squadNumber: number | null;
  rsvpStatus: RsvpStatus | null;
  rsvpNote: string | null;
  rsvpRespondedAt: string | null;
}

/* ── API functions ──────────────────────────────────────────────────────────── */

/** POST /events/:eventId/rsvp — record or update a player's RSVP. */
export async function submitRsvp(
  eventId: string,
  input: CreateRsvpInput,
): Promise<RsvpRow> {
  return apiFetch<RsvpRow>(`/events/${eventId}/rsvp`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /events/:eventId/rsvps — coach-only RSVP roster breakdown. */
export async function fetchEventRsvps(
  eventId: string,
): Promise<AthleteRsvp[]> {
  return apiFetch<AthleteRsvp[]>(`/events/${eventId}/rsvps`);
}

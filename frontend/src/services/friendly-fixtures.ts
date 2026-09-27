import { apiFetch } from "@/lib/api";

/** One pending fixture request addressed to the coach's team. */
export interface IncomingFriendlyFixture {
  id: string;
  requesterTeamId: string;
  requesterTeamName: string;
  /** The requester's own calendar event — null once it has been deleted. */
  eventId: string | null;
  scheduledAt: string | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * GET /friendly-fixtures/incoming — coach-only; pending fixture requests
 * from other Gaffer teams, oldest first. While pending, only the requester's
 * event exists, so the proposal's date and location come from it.
 */
export async function getIncomingFriendlyFixtures(): Promise<
  IncomingFriendlyFixture[]
> {
  return apiFetch<IncomingFriendlyFixture[]>("/friendly-fixtures/incoming");
}

/**
 * POST /friendly-fixtures/:id/accept — coach-only; accepts an inbound
 * request and mirrors the match onto the accepting team's calendar.
 */
export async function acceptFriendlyFixture(fixtureId: string): Promise<{
  fixture: { id: string; status: string };
  event: { id: string };
}> {
  return apiFetch(`/friendly-fixtures/${fixtureId}/accept`, {
    method: "POST",
  });
}

/**
 * POST /friendly-fixtures/:id/decline — coach-only; declines an inbound
 * request. The requester keeps their own event; nothing is added here.
 */
export async function declineFriendlyFixture(
  fixtureId: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/friendly-fixtures/${fixtureId}/decline`, {
    method: "POST",
  });
}

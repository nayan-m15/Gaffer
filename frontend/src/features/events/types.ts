export type EventType = "training" | "match" | "meeting";
export type EventStatus = "scheduled" | "cancelled" | "completed";

/** A team event returned by the backend events API. */
export interface TeamEvent {
  id: string;
  teamId: string;
  title: string;
  type: EventType;
  status: EventStatus;
  scheduledAt: string;
  location: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventInput {
  title: string;
  type: EventType;
  scheduledAt: string;
  location: string;
  notes?: string;
}

export interface UpdateEventInput {
  title?: string;
  type?: EventType;
  status?: EventStatus;
  scheduledAt?: string;
  location?: string;
  notes?: string | null;
}

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
  matchId?: string | null;
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

export type OpponentSquadVisibility = "none" | "numbers" | "full";

export interface OpponentMatchPlayer {
  id?: string;
  shirtNumber: number;
  name?: string | null;
  position?: string | null;
}

export interface StartMatchInput {
  opponentName: string;
  isHome: boolean;
  startingAthleteIds: string[];
  benchAthleteIds?: string[];
  gamePlanId?: string;
  opponentSquadVisibility?: OpponentSquadVisibility;
  opponentSquad?: OpponentMatchPlayer[];
  teamColor?: string;
  opponentColor?: string;
}

/** A match row returned by POST /events/:eventId/start-match. */
export interface MatchRecord {
  id: string;
  eventId: string;
  competitionId: string | null;
  opponentName: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  gamePlanId: string | null;
  opponentSquadVisibility: OpponentSquadVisibility;
  teamColor: string | null;
  opponentColor: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MatchEventTeam = "own" | "opponent";

export type MatchEventType =
  | "goal"
  | "assist"
  | "key_pass"
  | "yellow_card"
  | "red_card"
  | "substitution"
  | "penalty"
  | "injury";

export type OpponentSquadVisibility = "none" | "numbers" | "full";

export interface OpponentMatchPlayer {
  id: string;
  shirtNumber: number;
  name: string | null;
  position?: string | null;
}

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
  eventTitle: string;
  eventStatus: "scheduled" | "cancelled" | "completed";
  eventScheduledAt: string;
  eventLocation: string;
  competitionName: string | null;
  opponentSquad: OpponentMatchPlayer[];
}

export interface MatchSquadAthlete {
  id: string;
  firstName: string;
  lastName: string;
  squadNumber: number | null;
  position: string | null;
  started?: boolean;
}

export interface MatchLogEvent {
  id: string;
  matchId: string;
  athleteId: string | null;
  team: MatchEventTeam;
  opponentLabel: string | null;
  opponentPlayerId: string | null;
  eventType: MatchEventType;
  minute: number;
  detail: string | null;
  loggedByUserId: string;
  manuallyAdjusted: boolean;
  createdAt: string;
  updatedAt: string;
  athlete: MatchSquadAthlete | null;
  opponentPlayer: OpponentMatchPlayer | null;
  /** Client-only: true while the POST/PATCH has not yet confirmed. */
  pending?: boolean;
  /** Client-only: stable list key so confirming a log does not remount the row. */
  optimisticKey?: string;
}

export interface CreateMatchLogEventInput {
  team: MatchEventTeam;
  eventType: MatchEventType;
  athleteId?: string;
  opponentLabel?: string;
  opponentPlayerId?: string;
  minute: number;
  detail?: string;
}

export interface UpdateMatchLogEventInput {
  athleteId?: string | null;
  opponentLabel?: string | null;
  opponentPlayerId?: string | null;
  minute?: number;
  eventType?: MatchEventType;
  detail?: string | null;
}

export type MatchEventTeam = "own" | "opponent";

export type MatchEventType =
  | "goal"
  | "assist"
  | "key_pass"
  | "yellow_card"
  | "red_card"
  | "substitution"
  | "penalty"
  | "injury"
  | "goalkeeper_save"
  | "tactical_change";

/**
 * The parts of the game plan a coach switched to mid-match, carried by a
 * `tactical_change` event. Folding these over the match's starting plan gives
 * the shape in force at any minute, so the plan the match kicked off with is
 * never overwritten.
 */
export type MatchTacticalChange = Partial<
  Pick<
    GamePlanSnapshot,
    | "formationId"
    | "customPositions"
    | "defensiveStyle"
    | "defensiveWidth"
    | "defensiveDepth"
    | "offensiveStyle"
    | "offensiveWidth"
    | "playersInBox"
    | "cornersCommitment"
    | "freeKicksCommitment"
    | "captainId"
    | "freeKickTakerId"
    | "longFreeKickTakerId"
    | "penaltyTakerId"
    | "cornerTakerId"
    | "rightCornerTakerId"
  >
>;

export type OpponentSquadVisibility = "none" | "numbers" | "full";
export type MatchClockPeriod =
  "not_started" | "first_half" | "half_time" | "second_half" | "full_time";

export interface OpponentMatchPlayer {
  id: string;
  shirtNumber: number;
  name: string | null;
  position?: string | null;
}

export type MatchInsightStatus =
  | "ready"
  | "failed"
  | "stale"
  | "pending"
  | "unavailable";

export interface MatchInsightHighlights {
  playerOfTheMatch?: { athleteName: string; reason: string } | null;
}

/** LLM-generated narrative summary for a finalised match. See GET /matches/:matchId/insight. */
export interface MatchInsight {
  matchId: string;
  status: MatchInsightStatus;
  narrativeText: string | null;
  highlights: MatchInsightHighlights | null;
  generatedAt: string | null;
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
  gamePlanSnapshot: GamePlanSnapshot | null;
  opponentSquadVisibility: OpponentSquadVisibility;
  teamColor: string | null;
  opponentColor: string | null;
  clockPeriod: MatchClockPeriod;
  clockElapsedMs: number;
  clockStartedAt: string | null;
  clockRevision: number;
  createdAt: string;
  updatedAt: string;
  eventTitle: string;
  eventStatus: "scheduled" | "cancelled" | "completed";
  eventScheduledAt: string;
  eventLocation: string;
  eventNotes?: string | null;
  competitionName: string | null;
  competitionSeason?: string | null;
  opponentSquad: OpponentMatchPlayer[];
  /** Present on GET /matches/:id for linked Gaffer friendlies and competition fixtures. */
  friendlyOpponentLineup?: FriendlyOpponentLineup;
  projection?: {
    revision: number;
    confirmedTeamScore: number;
    confirmedOpponentScore: number;
    provisionalTeamScore: number;
    provisionalOpponentScore: number;
    possibleEffects: {
      teamGoals?: number;
      opponentGoals?: number;
      disciplinaryEvents?: number;
    };
    unresolvedReviewCount: number;
    finalisationState: "open" | "finalised" | "amendment_required";
  };
}

export interface MatchSquadAthlete {
  id: string;
  firstName: string;
  lastName: string;
  squadNumber: number | null;
  position: string | null;
  started?: boolean;
}

/**
 * The opposing Gaffer team's confirmed lineup, shared only for an accepted
 * friendly fixture between two Gaffer teams. `available` stays false while
 * the fixture is pending/declined or the opponent has not confirmed theirs.
 */
export interface FriendlyOpponentLineup {
  available: boolean;
  teamId: string | null;
  teamName: string | null;
  players: MatchSquadAthlete[];
  formationId?: string | null;
  pitchAssignments?: Record<string, string | null> | null;
  customPositions?: import("@/features/team-management/types").FormationPosition[] | null;
  confirmedAt?: string | null;
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
  clientRequestId?: string | null;
  period?: MatchClockPeriod;
  matchElapsedMs?: number | null;
  lifecycleStatus?: "provisional" | "confirmed" | "needs_review" | "voided";
  projectionRevision?: number;
  /** Set only on `tactical_change` events. */
  tacticalChange?: MatchTacticalChange | null;
  createdAt: string;
  updatedAt: string;
  athlete: MatchSquadAthlete | null;
  opponentPlayer: OpponentMatchPlayer | null;
  /** Client-only: true while the POST/PATCH has not yet confirmed. */
  pending?: boolean;
  /** Client-only: stable list key so confirming a log does not remount the row. */
  optimisticKey?: string;
  syncStatus?:
    | "queued"
    | "uploading"
    | "accepted"
    | "reconciled"
    | "dependency_pending"
    | "quarantined"
    | "rejected"
    | "synced";
  syncError?: string | null;
}

export interface CreateMatchLogEventInput {
  clientRequestId: string;
  deviceId?: string;
  clientCreatedAt?: string;
  period?: MatchClockPeriod;
  matchElapsedMs?: number;
  team: MatchEventTeam;
  eventType: MatchEventType;
  athleteId?: string;
  opponentLabel?: string;
  opponentPlayerId?: string;
  minute: number;
  detail?: string;
  /** Required for `tactical_change`, rejected for every other event type. */
  tacticalChange?: MatchTacticalChange;
}

export interface UpdateMatchLogEventInput {
  athleteId?: string | null;
  opponentLabel?: string | null;
  opponentPlayerId?: string | null;
  minute?: number;
  eventType?: MatchEventType;
  detail?: string | null;
}

export interface UpdateMatchClockInput {
  operationId: string;
  baseRevision: number;
  clientCreatedAt: string;
  period: MatchClockPeriod;
  running: boolean;
  elapsedMs: number;
}
import type { GamePlanSnapshot } from "@/services/gamePlans";

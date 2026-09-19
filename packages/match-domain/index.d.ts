export type MatchSide = "own" | "opponent";
export type LifecycleStatus = "provisional" | "confirmed" | "needs_review" | "voided";

export interface DomainObservation {
  id: string;
  matchId: string;
  period: string;
  matchElapsedMs: number;
  eventType: string;
  team: MatchSide;
  athleteId?: string | null;
  opponentPlayerId?: string | null;
  opponentLabel?: string | null;
  payload?: Record<string, unknown>;
}

export interface DomainOperation {
  id: string;
  operationType: "correct" | "void" | "merge" | "separate" | "resolve_conflict";
  targetObservationIds: string[];
  causalParentIds?: string[];
  decision?: Record<string, unknown>;
}

export interface CanonicalDomainEvent extends DomainObservation {
  observationIds: string[];
  lifecycleStatus: LifecycleStatus;
}

export interface DomainProjection {
  confirmedTeamScore: number;
  confirmedOpponentScore: number;
  provisionalTeamScore: number;
  provisionalOpponentScore: number;
  possibleEffects: {
    teamGoals: number;
    opponentGoals: number;
    disciplinaryEvents: number;
  };
  disciplinaryProjection: {
    ownYellowCards: number;
    ownRedCards: number;
    opponentYellowCards: number;
    opponentRedCards: number;
  };
}

export function stableStringify(value: unknown): string;
export function areCandidateObservations(
  left: DomainObservation,
  right: DomainObservation,
  windowMs?: number,
): boolean;
export function projectCanonicalEvents(
  events: Array<{
    team: MatchSide;
    eventType: string;
    lifecycleStatus?: LifecycleStatus | string;
  }>,
): DomainProjection;
export function reconcileMatch(input: {
  observations: DomainObservation[];
  operations?: DomainOperation[];
  candidateWindowMs?: number;
}): {
  events: CanonicalDomainEvent[];
  candidateGroups: string[][];
  conflicts: string[][];
  pendingOperationIds: string[];
  appliedOperationIds: string[];
  projection: DomainProjection;
  digestInput: string;
};

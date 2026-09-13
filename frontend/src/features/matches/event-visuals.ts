import type { MatchEventType, MatchLogEvent } from "./types";

export const EVENT_COLOR: Record<MatchEventType, string> = {
  goal: "#00d99a",
  assist: "#00d99a",
  key_pass: "#5b9fff",
  yellow_card: "#f5c518",
  red_card: "#ff5b5f",
  substitution: "#c084fc",
  penalty: "#20e6a6",
  injury: "#fb923c",
};

export const SECOND_YELLOW_DETAIL = "Second yellow card";
export const PENALTY_SCORED_DETAIL = "Penalty";
export const PENALTY_MISSED_DETAIL = "Penalty missed";

export const EVENT_LABEL: Record<MatchEventType, string> = {
  goal: "Goal",
  assist: "Assist",
  key_pass: "Key Pass",
  yellow_card: "Yellow Card",
  red_card: "Red Card",
  substitution: "Substitution",
  penalty: "Penalty",
  injury: "Injury",
};

export function isSecondYellow(event: {
  eventType: MatchEventType;
  detail: string | null;
}) {
  return (
    event.eventType === "red_card" && event.detail === SECOND_YELLOW_DETAIL
  );
}

export function isScoredPenalty(event: {
  eventType: MatchEventType;
  detail: string | null;
}) {
  return event.eventType === "goal" && event.detail === PENALTY_SCORED_DETAIL;
}

export function isMissedPenalty(event: {
  eventType: MatchEventType;
  detail: string | null;
}) {
  return (
    event.eventType === "penalty" && event.detail === PENALTY_MISSED_DETAIL
  );
}

/** Stored as `penalty`, or as a goal whose detail marks a scored penalty. */
export function isPenaltyLike(event: {
  eventType: MatchEventType;
  detail: string | null;
}) {
  return event.eventType === "penalty" || isScoredPenalty(event);
}

export function eventDisplayLabel(event: {
  eventType: MatchEventType;
  detail: string | null;
}) {
  if (isScoredPenalty(event)) {
    return "Penalty";
  }
  if (isMissedPenalty(event) || event.detail === PENALTY_MISSED_DETAIL) {
    return "Penalty missed";
  }
  if (isSecondYellow(event)) {
    return "Second yellow";
  }
  return EVENT_LABEL[event.eventType];
}

/** Assists persisted with `detail` set to the goal's id — same rule live undo uses. */
export function linkedAssistsForGoal(
  timeline: MatchLogEvent[],
  goal: MatchLogEvent | undefined,
) {
  if (!goal || goal.eventType !== "goal") {
    return [];
  }
  return timeline.filter(
    (event) =>
      event.eventType === "assist" &&
      event.detail === goal.id &&
      !event.pending,
  );
}

export function pairAssistsToGoals(timeline: MatchLogEvent[]) {
  const chronological = [...timeline].sort((a, b) => {
    const byMinute = a.minute - b.minute;
    if (byMinute !== 0) {
      return byMinute;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
  const goals = chronological.filter((event) => event.eventType === "goal");
  const assists = chronological.filter((event) => event.eventType === "assist");
  const used = new Set<string>();
  const byGoalId = new Map<string, MatchLogEvent>();

  for (const goal of goals) {
    const linked = assists.find(
      (event) => !used.has(event.id) && event.detail === goal.id,
    );
    if (linked) {
      used.add(linked.id);
      byGoalId.set(goal.id, linked);
    }
  }

  for (const goal of goals) {
    if (byGoalId.has(goal.id)) {
      continue;
    }
    const fallback = assists.find(
      (event) =>
        !used.has(event.id) &&
        event.team === goal.team &&
        event.minute === goal.minute,
    );
    if (fallback) {
      used.add(fallback.id);
      byGoalId.set(goal.id, fallback);
    }
  }

  return byGoalId;
}

export function isPairedAssistEvent(
  event: MatchLogEvent,
  assistsByGoal: Map<string, MatchLogEvent>,
) {
  if (event.eventType !== "assist") {
    return false;
  }
  for (const assist of assistsByGoal.values()) {
    if (assist.id === event.id) {
      return true;
    }
  }
  return false;
}

/**
 * Collapse duplicate timeline rows before the report renders them.
 *
 * The events query key is shared with the live logger. That cache can keep
 * both the optimistic substitution (temp id) and the confirmed server row
 * (real id) when they describe the same swap. Historical double-POSTs can
 * also leave two persisted rows with the same minute, team, and players.
 * The Substitutions list previously mapped every row, so those showed twice.
 */
export function uniqueTimelineEvents(events: MatchLogEvent[]): MatchLogEvent[] {
  const seenIds = new Set<string>();
  const seenSubstitutions = new Set<string>();
  const unique: MatchLogEvent[] = [];
  const ordered = [...events].sort((left, right) => {
    const byCreated = left.createdAt.localeCompare(right.createdAt);
    if (byCreated !== 0) {
      return byCreated;
    }
    return left.id.localeCompare(right.id);
  });

  for (const event of ordered) {
    if (seenIds.has(event.id)) {
      continue;
    }
    seenIds.add(event.id);
    if (event.eventType === "substitution") {
      const fingerprint = [
        event.minute,
        event.team,
        event.athleteId ?? "",
        event.opponentPlayerId ?? "",
        event.opponentLabel ?? "",
        event.detail ?? "",
      ].join("\0");
      if (seenSubstitutions.has(fingerprint)) {
        continue;
      }
      seenSubstitutions.add(fingerprint);
    }
    unique.push(event);
  }

  return unique;
}

export function hasPriorYellow(
  events: MatchLogEvent[],
  team: "own" | "opponent",
  athleteId?: string,
  opponentLabel?: string,
  opponentPlayerId?: string,
) {
  if (!athleteId && !opponentLabel && !opponentPlayerId) {
    return false;
  }
  return events.some((event) => {
    if (event.eventType !== "yellow_card" || event.team !== team) {
      return false;
    }
    if (athleteId) {
      return event.athleteId === athleteId;
    }
    if (opponentPlayerId) {
      return event.opponentPlayerId === opponentPlayerId;
    }
    return event.opponentLabel === opponentLabel;
  });
}

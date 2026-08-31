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

export function eventDisplayLabel(event: {
  eventType: MatchEventType;
  detail: string | null;
}) {
  if (event.detail === PENALTY_SCORED_DETAIL) {
    return "Penalty";
  }
  if (event.detail === PENALTY_MISSED_DETAIL) {
    return "Penalty missed";
  }
  if (isSecondYellow(event)) {
    return "Second yellow";
  }
  return EVENT_LABEL[event.eventType];
}

export function hasPriorYellow(
  events: MatchLogEvent[],
  team: "own" | "opponent",
  athleteId?: string,
  opponentLabel?: string,
) {
  if (!athleteId && !opponentLabel) {
    return false;
  }
  return events.some((event) => {
    if (event.eventType !== "yellow_card" || event.team !== team) {
      return false;
    }
    if (athleteId) {
      return event.athleteId === athleteId;
    }
    return event.opponentLabel === opponentLabel;
  });
}

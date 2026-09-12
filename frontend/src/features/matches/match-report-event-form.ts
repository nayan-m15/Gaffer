import type {
  CreateMatchLogEventInput,
  MatchEventTeam,
  MatchEventType,
  MatchLogEvent,
  OpponentMatchPlayer,
  OpponentSquadVisibility,
  UpdateMatchLogEventInput,
} from "./types";

/** Same values the live logger writes onto `match_events.detail`. */
const PENALTY_SCORED_DETAIL = "Penalty";
const PENALTY_MISSED_DETAIL = "Penalty missed";

export type PenaltyOutcome = "goal" | "miss" | "";

export type EventFormDraft = {
  team: MatchEventTeam;
  minute: number;
  eventType: MatchEventType;
  athleteId: string;
  opponentPlayerId: string;
  opponentLabel: string;
  note: string;
  penaltyOutcome: PenaltyOutcome;
  assistAthleteId: string;
  assistOpponentPlayerId: string;
  assistOpponentLabel: string;
  incomingAthleteId: string;
  incomingOpponentPlayerId: string;
  incomingOpponentLabel: string;
  injuryLedToSub: boolean;
};

export type PlannedOp =
  | {
      kind: "create";
      input: CreateMatchLogEventInput;
      captureId?: boolean;
      detailFromPrimary?: boolean;
    }
  | {
      kind: "update";
      eventId: string;
      input: UpdateMatchLogEventInput;
    }
  | { kind: "delete"; eventId: string };

export function looksLikeId(value: string | null | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

export function usesOpponentRoster(
  visibility: OpponentSquadVisibility,
  opponentSquad: OpponentMatchPlayer[],
) {
  return visibility !== "none" && opponentSquad.length > 0;
}

export function opponentPlayerLabel(
  player: OpponentMatchPlayer,
  visibility: OpponentSquadVisibility,
) {
  if (visibility === "full" && player.name) {
    return `#${player.shirtNumber} ${player.name}`;
  }
  return `#${player.shirtNumber}`;
}

export function emptyEventDraft(
  overrides: Partial<EventFormDraft> = {},
): EventFormDraft {
  return {
    team: "own",
    minute: 0,
    eventType: "goal",
    athleteId: "",
    opponentPlayerId: "",
    opponentLabel: "",
    note: "",
    penaltyOutcome: "",
    assistAthleteId: "",
    assistOpponentPlayerId: "",
    assistOpponentLabel: "",
    incomingAthleteId: "",
    incomingOpponentPlayerId: "",
    incomingOpponentLabel: "",
    injuryLedToSub: false,
    ...overrides,
  };
}

export function penaltyOutcomeFromEvent(event: {
  eventType: MatchEventType;
  detail: string | null;
}): PenaltyOutcome {
  if (event.eventType === "goal" && event.detail === PENALTY_SCORED_DETAIL) {
    return "goal";
  }
  if (event.eventType === "penalty" && event.detail === PENALTY_MISSED_DETAIL) {
    return "miss";
  }
  return "";
}

export function draftFromLoggedEvent(
  event: MatchLogEvent,
  options: {
    linkedAssist: MatchLogEvent | null;
    linkedSub: MatchLogEvent | null;
    roster: boolean;
  },
): EventFormDraft {
  const penaltyLike =
    event.eventType === "penalty" ||
    (event.eventType === "goal" && event.detail === PENALTY_SCORED_DETAIL);
  const incomingRaw =
    event.eventType === "substitution" ? event.detail : options.linkedSub?.detail;
  const reservedDetail =
    event.eventType === "substitution" ||
    looksLikeId(event.detail) ||
    penaltyLike ||
    event.detail === PENALTY_SCORED_DETAIL ||
    event.detail === PENALTY_MISSED_DETAIL;

  return emptyEventDraft({
    team: event.team,
    minute: event.minute,
    eventType: event.eventType === "assist" ? "goal" : penaltyLike ? "penalty" : event.eventType,
    athleteId: event.athleteId ?? "",
    opponentPlayerId: event.opponentPlayerId ?? "",
    opponentLabel: event.opponentLabel ?? "",
    note: reservedDetail ? "" : (event.detail ?? ""),
    penaltyOutcome: penaltyOutcomeFromEvent(event),
    assistAthleteId: options.linkedAssist?.athleteId ?? "",
    assistOpponentPlayerId: options.linkedAssist?.opponentPlayerId ?? "",
    assistOpponentLabel: options.linkedAssist?.opponentLabel ?? "",
    incomingAthleteId:
      event.team === "own" && looksLikeId(incomingRaw) ? incomingRaw ?? "" : "",
    incomingOpponentPlayerId:
      event.team === "opponent" && options.roster && looksLikeId(incomingRaw)
        ? incomingRaw ?? ""
        : "",
    incomingOpponentLabel:
      event.team === "opponent" && !options.roster ? (incomingRaw ?? "") : "",
    injuryLedToSub: Boolean(options.linkedSub),
  });
}

export function persistedEventType(draft: EventFormDraft): MatchEventType {
  if (draft.eventType === "penalty") {
    return draft.penaltyOutcome === "goal" ? "goal" : "penalty";
  }
  return draft.eventType;
}

function penaltyDetail(draft: EventFormDraft) {
  return draft.penaltyOutcome === "goal"
    ? PENALTY_SCORED_DETAIL
    : PENALTY_MISSED_DETAIL;
}

export function linkedSubstitutionForInjury(
  timeline: MatchLogEvent[],
  injury: MatchLogEvent | undefined,
) {
  if (!injury || injury.eventType !== "injury") {
    return undefined;
  }
  return timeline.find(
    (event) =>
      event.eventType === "substitution" &&
      event.team === injury.team &&
      event.minute === injury.minute &&
      !event.pending &&
      sameOutgoingPlayer(event, injury),
  );
}

function sameOutgoingPlayer(left: MatchLogEvent, right: MatchLogEvent) {
  if (left.team === "own") {
    return Boolean(left.athleteId) && left.athleteId === right.athleteId;
  }
  if (left.opponentPlayerId && right.opponentPlayerId) {
    return left.opponentPlayerId === right.opponentPlayerId;
  }
  return Boolean(left.opponentLabel) && left.opponentLabel === right.opponentLabel;
}

function subjectFields(draft: EventFormDraft): Partial<CreateMatchLogEventInput> {
  if (draft.team === "own") {
    return draft.athleteId ? { athleteId: draft.athleteId } : {};
  }
  if (draft.opponentPlayerId) {
    return {
      opponentPlayerId: draft.opponentPlayerId,
      ...(draft.opponentLabel.trim()
        ? { opponentLabel: draft.opponentLabel.trim() }
        : {}),
    };
  }
  return draft.opponentLabel.trim()
    ? { opponentLabel: draft.opponentLabel.trim() }
    : {};
}

function assistSubject(draft: EventFormDraft): Partial<CreateMatchLogEventInput> {
  if (draft.team === "own") {
    return draft.assistAthleteId ? { athleteId: draft.assistAthleteId } : {};
  }
  if (draft.assistOpponentPlayerId) {
    return {
      opponentPlayerId: draft.assistOpponentPlayerId,
      ...(draft.assistOpponentLabel.trim()
        ? { opponentLabel: draft.assistOpponentLabel.trim() }
        : {}),
    };
  }
  return draft.assistOpponentLabel.trim()
    ? { opponentLabel: draft.assistOpponentLabel.trim() }
    : {};
}

export function incomingDetail(draft: EventFormDraft) {
  if (draft.team === "own") {
    return draft.incomingAthleteId || undefined;
  }
  if (draft.incomingOpponentPlayerId) {
    return draft.incomingOpponentPlayerId;
  }
  const label = draft.incomingOpponentLabel.trim();
  return label || undefined;
}

export function hasAssistSelection(draft: EventFormDraft) {
  if (draft.team === "own") {
    return Boolean(draft.assistAthleteId);
  }
  return Boolean(
    draft.assistOpponentPlayerId || draft.assistOpponentLabel.trim(),
  );
}

function hasIncomingSelection(draft: EventFormDraft) {
  return Boolean(incomingDetail(draft));
}

function noteOrUndefined(draft: EventFormDraft) {
  const note = draft.note.trim();
  return note || undefined;
}

function primaryCreateInput(draft: EventFormDraft): CreateMatchLogEventInput {
  if (draft.eventType === "penalty") {
    return {
      clientRequestId: crypto.randomUUID(),
      team: draft.team,
      eventType: persistedEventType(draft),
      minute: draft.minute,
      ...subjectFields(draft),
      detail: penaltyDetail(draft),
    };
  }
  const detail =
    draft.eventType === "substitution"
      ? incomingDetail(draft)
      : noteOrUndefined(draft);
  return {
    clientRequestId: crypto.randomUUID(),
    team: draft.team,
    eventType: draft.eventType,
    minute: draft.minute,
    ...subjectFields(draft),
    ...(detail ? { detail } : {}),
  };
}

function primaryUpdateInput(draft: EventFormDraft): UpdateMatchLogEventInput {
  if (draft.eventType === "penalty") {
    return {
      eventType: persistedEventType(draft),
      minute: draft.minute,
      athleteId: draft.team === "own" ? draft.athleteId || null : null,
      opponentPlayerId:
        draft.team === "opponent" ? draft.opponentPlayerId || null : null,
      opponentLabel:
        draft.team === "opponent" ? draft.opponentLabel.trim() || null : null,
      detail: penaltyDetail(draft),
    };
  }
  const detail =
    draft.eventType === "substitution"
      ? incomingDetail(draft) ?? null
      : draft.note.trim() || null;
  return {
    eventType: draft.eventType,
    minute: draft.minute,
    athleteId: draft.team === "own" ? draft.athleteId || null : null,
    opponentPlayerId:
      draft.team === "opponent" ? draft.opponentPlayerId || null : null,
    opponentLabel:
      draft.team === "opponent" ? draft.opponentLabel.trim() || null : null,
    detail,
  };
}

export function planAddEvent(draft: EventFormDraft): PlannedOp[] {
  const ops: PlannedOp[] = [
    {
      kind: "create",
      input: primaryCreateInput(draft),
      captureId:
        draft.eventType === "goal" && hasAssistSelection(draft),
    },
  ];

  if (draft.eventType === "goal" && hasAssistSelection(draft)) {
    ops.push({
      kind: "create",
      detailFromPrimary: true,
      input: {
        clientRequestId: crypto.randomUUID(),
        team: draft.team,
        eventType: "assist",
        minute: draft.minute,
        ...assistSubject(draft),
      },
    });
  }

  if (
    draft.eventType === "injury" &&
    draft.injuryLedToSub &&
    hasIncomingSelection(draft)
  ) {
    ops.push({
      kind: "create",
      input: {
        clientRequestId: crypto.randomUUID(),
        team: draft.team,
        eventType: "substitution",
        minute: draft.minute,
        ...subjectFields(draft),
        detail: incomingDetail(draft),
      },
    });
  }

  return ops;
}

export function planEditEvent({
  event,
  draft,
  linkedAssist,
  linkedSub,
}: {
  event: MatchLogEvent;
  draft: EventFormDraft;
  linkedAssist: MatchLogEvent | null;
  linkedSub: MatchLogEvent | null;
}): PlannedOp[] {
  const ops: PlannedOp[] = [
    {
      kind: "update",
      eventId: event.id,
      input: primaryUpdateInput(draft),
    },
  ];

  if (event.eventType === "goal" && persistedEventType(draft) !== "goal" && linkedAssist) {
    ops.push({ kind: "delete", eventId: linkedAssist.id });
  }

  if (draft.eventType === "goal") {
    if (hasAssistSelection(draft) && linkedAssist) {
      ops.push({
        kind: "update",
        eventId: linkedAssist.id,
        input: {
          minute: draft.minute,
          athleteId:
            draft.team === "own" ? draft.assistAthleteId || null : null,
          opponentPlayerId:
            draft.team === "opponent"
              ? draft.assistOpponentPlayerId || null
              : null,
          opponentLabel:
            draft.team === "opponent"
              ? draft.assistOpponentLabel.trim() || null
              : null,
          detail: event.id,
        },
      });
    } else if (hasAssistSelection(draft) && !linkedAssist) {
      ops.push({
        kind: "create",
        input: {
          clientRequestId: crypto.randomUUID(),
          team: draft.team,
          eventType: "assist",
          minute: draft.minute,
          detail: event.id,
          ...assistSubject(draft),
        },
      });
    } else if (!hasAssistSelection(draft) && linkedAssist) {
      ops.push({ kind: "delete", eventId: linkedAssist.id });
    }
  }

  if (
    draft.eventType === "injury" &&
    draft.injuryLedToSub &&
    hasIncomingSelection(draft)
  ) {
    const subInput = {
      eventType: "substitution" as const,
      minute: draft.minute,
      athleteId: draft.team === "own" ? draft.athleteId || null : null,
      opponentPlayerId:
        draft.team === "opponent" ? draft.opponentPlayerId || null : null,
      opponentLabel:
        draft.team === "opponent" ? draft.opponentLabel.trim() || null : null,
      detail: incomingDetail(draft) ?? null,
    };
    if (linkedSub) {
      ops.push({
        kind: "update",
        eventId: linkedSub.id,
        input: subInput,
      });
    } else {
      ops.push({
        kind: "create",
        input: {
          clientRequestId: crypto.randomUUID(),
          team: draft.team,
          eventType: "substitution",
          minute: draft.minute,
          ...subjectFields(draft),
          detail: incomingDetail(draft),
        },
      });
    }
  }

  return ops;
}

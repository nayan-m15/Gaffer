import type {
  CreateMatchLogEventInput,
  MatchEventTeam,
  MatchEventType,
  MatchLogEvent,
  OpponentMatchPlayer,
  OpponentSquadVisibility,
  UpdateMatchLogEventInput,
} from "./types";

export type EventFormDraft = {
  team: MatchEventTeam;
  minute: number;
  eventType: MatchEventType;
  athleteId: string;
  opponentPlayerId: string;
  opponentLabel: string;
  note: string;
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
  const detail =
    draft.eventType === "substitution"
      ? incomingDetail(draft)
      : noteOrUndefined(draft);
  return {
    team: draft.team,
    eventType: draft.eventType,
    minute: draft.minute,
    ...subjectFields(draft),
    ...(detail ? { detail } : {}),
  };
}

function primaryUpdateInput(draft: EventFormDraft): UpdateMatchLogEventInput {
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
      captureId: draft.eventType === "goal" && hasAssistSelection(draft),
    },
  ];

  if (draft.eventType === "goal" && hasAssistSelection(draft)) {
    ops.push({
      kind: "create",
      detailFromPrimary: true,
      input: {
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

  if (event.eventType === "goal" && draft.eventType !== "goal" && linkedAssist) {
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

import assert from "node:assert/strict";
import {
  emptyEventDraft,
  hasAssistSelection,
  incomingDetail,
  linkedSubstitutionForInjury,
  looksLikeId,
  planAddEvent,
  planEditEvent,
  usesOpponentRoster,
} from "./match-report-event-form.ts";

const scorer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assister = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const incoming = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const goalId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const assistId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const injuryId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const subId = "99999999-9999-4999-8999-999999999999";

assert.equal(usesOpponentRoster("none", [{ id: "x", shirtNumber: 9, name: null }]), false);
assert.equal(usesOpponentRoster("full", []), false);
assert.equal(
  usesOpponentRoster("numbers", [{ id: "x", shirtNumber: 9, name: null }]),
  true,
);
assert.equal(looksLikeId(scorer), true);
assert.equal(looksLikeId("Penalty"), false);

const scoredPenaltyOps = planAddEvent(
  emptyEventDraft({
    minute: 19,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "goal",
  }),
);
assert.equal(scoredPenaltyOps.length, 1);
assert.equal(scoredPenaltyOps[0].kind === "create" && scoredPenaltyOps[0].input.eventType, "goal");
assert.equal(scoredPenaltyOps[0].kind === "create" && scoredPenaltyOps[0].input.detail, "Penalty");
assert.equal(scoredPenaltyOps[0].input.period, "first_half");
assert.equal(scoredPenaltyOps[0].input.matchElapsedMs, 19 * 60_000);
const secondHalfOps = planAddEvent(emptyEventDraft({ minute: 70, athleteId: scorer, assistAthleteId: assister }));
assert.ok(secondHalfOps.every(op => op.kind === "create" && op.input.period === "second_half" && op.input.matchElapsedMs === 70 * 60_000));

const missedPenaltyOps = planAddEvent(
  emptyEventDraft({
    minute: 19,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "miss",
  }),
);
assert.equal(missedPenaltyOps[0].kind === "create" && missedPenaltyOps[0].input.eventType, "penalty");
assert.equal(
  missedPenaltyOps[0].kind === "create" && missedPenaltyOps[0].input.detail,
  "Penalty missed",
);

const savedPenaltyOps = planAddEvent(
  emptyEventDraft({
    minute: 19,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "saved",
  }),
);
assert.equal(savedPenaltyOps[0].kind === "create" && savedPenaltyOps[0].input.eventType, "penalty");
assert.equal(
  savedPenaltyOps[0].kind === "create" && savedPenaltyOps[0].input.detail,
  "Penalty saved by goalkeeper",
);

const goalDraft = emptyEventDraft({
  minute: 23,
  eventType: "goal",
  athleteId: scorer,
  assistAthleteId: assister,
  note: "late",
});
assert.equal(hasAssistSelection(goalDraft), true);
const goalOps = planAddEvent(goalDraft);
assert.equal(goalOps.length, 2);
assert.equal(goalOps[0].kind, "create");
assert.equal(goalOps[0].kind === "create" && goalOps[0].captureId, true);
assert.equal(goalOps[0].kind === "create" && goalOps[0].input.eventType, "goal");
assert.equal(goalOps[0].kind === "create" && goalOps[0].input.athleteId, scorer);
assert.equal(goalOps[0].kind === "create" && goalOps[0].input.detail, "late");
assert.equal(goalOps[1].kind === "create" && goalOps[1].detailFromPrimary, true);
assert.equal(goalOps[1].kind === "create" && goalOps[1].input.eventType, "assist");
assert.equal(goalOps[1].kind === "create" && goalOps[1].input.athleteId, assister);

const noAssistOps = planAddEvent(
  emptyEventDraft({ minute: 10, eventType: "goal", athleteId: scorer }),
);
assert.equal(noAssistOps.length, 1);

const subDraft = emptyEventDraft({
  minute: 61,
  eventType: "substitution",
  athleteId: scorer,
  incomingAthleteId: incoming,
});
assert.equal(incomingDetail(subDraft), incoming);
const subOps = planAddEvent(subDraft);
assert.equal(subOps.length, 1);
assert.equal(subOps[0].kind === "create" && subOps[0].input.eventType, "substitution");
assert.equal(subOps[0].kind === "create" && subOps[0].input.athleteId, scorer);
assert.equal(subOps[0].kind === "create" && subOps[0].input.detail, incoming);

const injuryOnly = planAddEvent(
  emptyEventDraft({ minute: 12, eventType: "injury", athleteId: scorer }),
);
assert.equal(injuryOnly.length, 1);
assert.equal(injuryOnly[0].kind === "create" && injuryOnly[0].input.eventType, "injury");

const injurySub = planAddEvent(
  emptyEventDraft({
    minute: 12,
    eventType: "injury",
    athleteId: scorer,
    incomingAthleteId: incoming,
    injuryLedToSub: true,
  }),
);
assert.equal(injurySub.length, 2);
assert.equal(injurySub[1].kind === "create" && injurySub[1].input.eventType, "substitution");
assert.equal(injurySub[1].kind === "create" && injurySub[1].input.athleteId, scorer);
assert.equal(injurySub[1].kind === "create" && injurySub[1].input.detail, incoming);

const cardOps = planAddEvent(
  emptyEventDraft({ minute: 40, eventType: "yellow_card", athleteId: scorer }),
);
assert.equal(cardOps.length, 1);
assert.equal(cardOps[0].kind === "create" && cardOps[0].input.eventType, "yellow_card");
assert.equal("detail" in (cardOps[0].kind === "create" ? cardOps[0].input : {}), false);

const oppCard = planAddEvent(
  emptyEventDraft({
    team: "opponent",
    minute: 8,
    eventType: "red_card",
    opponentPlayerId: incoming,
    opponentLabel: "#9",
  }),
);
assert.equal(oppCard[0].kind === "create" && oppCard[0].input.opponentPlayerId, incoming);
assert.equal("athleteId" in (oppCard[0].kind === "create" ? oppCard[0].input : {}), false);

const goalEvent = {
  id: goalId,
  matchId: "m",
  athleteId: scorer,
  team: "own",
  opponentLabel: null,
  opponentPlayerId: null,
  eventType: "goal",
  minute: 23,
  detail: null,
  loggedByUserId: "u",
  manuallyAdjusted: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  athlete: null,
  opponentPlayer: null,
};
const assistEvent = {
  ...goalEvent,
  id: assistId,
  athleteId: assister,
  eventType: "assist",
  detail: goalId,
};

const editAssistChange = planEditEvent({
  event: goalEvent,
  draft: emptyEventDraft({
    minute: 24,
    eventType: "goal",
    athleteId: scorer,
    assistAthleteId: incoming,
  }),
  linkedAssist: assistEvent,
  linkedSub: null,
});
assert.equal(editAssistChange[0].kind, "update");
assert.equal(editAssistChange[1].kind, "update");
assert.equal(editAssistChange[1].kind === "update" && editAssistChange[1].input.athleteId, incoming);
assert.equal(editAssistChange[1].kind === "update" && editAssistChange[1].input.detail, goalId);

const editRemoveAssist = planEditEvent({
  event: goalEvent,
  draft: emptyEventDraft({ minute: 23, eventType: "goal", athleteId: scorer }),
  linkedAssist: assistEvent,
  linkedSub: null,
});
assert.equal(editRemoveAssist.some((op) => op.kind === "delete" && op.eventId === assistId), true);

const injuryEvent = {
  ...goalEvent,
  id: injuryId,
  eventType: "injury",
  minute: 70,
};
const linkedSub = {
  ...goalEvent,
  id: subId,
  eventType: "substitution",
  minute: 70,
  athleteId: scorer,
  detail: incoming,
};
assert.equal(linkedSubstitutionForInjury([injuryEvent, linkedSub], injuryEvent)?.id, subId);

const legacyPenalty = {
  ...goalEvent,
  id: "88888888-8888-4888-8888-888888888888",
  eventType: "penalty",
  minute: 33,
  detail: null,
};
const flipToGoal = planEditEvent({
  event: legacyPenalty,
  draft: emptyEventDraft({
    minute: 33,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "goal",
  }),
  linkedAssist: null,
  linkedSub: null,
});
assert.equal(flipToGoal[0].kind === "update" && flipToGoal[0].input.eventType, "goal");
assert.equal(flipToGoal[0].kind === "update" && flipToGoal[0].input.detail, "Penalty");

const scoredPenaltyEvent = {
  ...goalEvent,
  detail: "Penalty",
};
const flipToMiss = planEditEvent({
  event: scoredPenaltyEvent,
  draft: emptyEventDraft({
    minute: 23,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "miss",
  }),
  linkedAssist: null,
  linkedSub: null,
});
assert.equal(flipToMiss[0].kind === "update" && flipToMiss[0].input.eventType, "penalty");
assert.equal(flipToMiss[0].kind === "update" && flipToMiss[0].input.detail, "Penalty missed");

const flipToSaved = planEditEvent({
  event: scoredPenaltyEvent,
  draft: emptyEventDraft({
    minute: 23,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "saved",
  }),
  linkedAssist: null,
  linkedSub: null,
});
assert.equal(flipToSaved[0].kind === "update" && flipToSaved[0].input.eventType, "penalty");
assert.equal(
  flipToSaved[0].kind === "update" && flipToSaved[0].input.detail,
  "Penalty saved by goalkeeper",
);

const keeperId = "12121212-1212-4121-8121-121212121212";
const saveId = "34343434-3434-4343-8343-343434343434";
const penaltyId = "56565656-5656-4565-8565-565656565656";
const opposingKeeper = {
  team: "opponent",
  opponentPlayerId: keeperId,
  opponentLabel: "#1",
};
const savedPenalty = {
  ...goalEvent,
  id: penaltyId,
  eventType: "penalty",
  minute: 40,
  detail: "Penalty saved by goalkeeper",
};
const linkedSave = {
  ...goalEvent,
  id: saveId,
  team: "opponent",
  athleteId: null,
  opponentPlayerId: keeperId,
  opponentLabel: "#1",
  eventType: "goalkeeper_save",
  minute: 40,
  detail: penaltyId,
};

const savedToMiss = planEditEvent({
  event: savedPenalty,
  draft: emptyEventDraft({
    minute: 40,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "miss",
  }),
  linkedAssist: null,
  linkedSub: null,
  linkedGoalkeeperSaves: [linkedSave],
  opposingKeeper,
});
assert.equal(savedToMiss.length, 2);
assert.equal(savedToMiss[0].kind === "update" && savedToMiss[0].input.detail, "Penalty missed");
assert.equal(savedToMiss[1].kind === "delete" && savedToMiss[1].eventId, saveId);

const savedToGoal = planEditEvent({
  event: savedPenalty,
  draft: emptyEventDraft({
    minute: 40,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "goal",
  }),
  linkedAssist: null,
  linkedSub: null,
  linkedGoalkeeperSaves: [linkedSave],
});
assert.equal(savedToGoal[0].kind === "update" && savedToGoal[0].input.eventType, "goal");
assert.equal(savedToGoal[1].kind === "delete" && savedToGoal[1].eventId, saveId);

const missToSaved = planEditEvent({
  event: { ...savedPenalty, detail: "Penalty missed" },
  draft: emptyEventDraft({
    minute: 41,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "saved",
  }),
  linkedAssist: null,
  linkedSub: null,
  linkedGoalkeeperSaves: [],
  opposingKeeper,
});
assert.equal(missToSaved.length, 2);
assert.equal(missToSaved[1].kind === "create" && missToSaved[1].input.eventType, "goalkeeper_save");
assert.equal(missToSaved[1].kind === "create" && missToSaved[1].input.detail, penaltyId);
assert.equal(missToSaved[1].kind === "create" && missToSaved[1].input.team, "opponent");
assert.equal(missToSaved[1].kind === "create" && missToSaved[1].input.minute, 41);
assert.equal(
  missToSaved[1].kind === "create" && missToSaved[1].input.opponentPlayerId,
  keeperId,
);

const missToSavedWithoutKeeper = planEditEvent({
  event: { ...savedPenalty, detail: "Penalty missed" },
  draft: emptyEventDraft({
    minute: 40,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "saved",
  }),
  linkedAssist: null,
  linkedSub: null,
  opposingKeeper: null,
});
assert.equal(missToSavedWithoutKeeper.length, 1);

const scoredToSaved = planEditEvent({
  event: { ...savedPenalty, eventType: "goal", detail: "Penalty" },
  draft: emptyEventDraft({
    minute: 40,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "saved",
  }),
  linkedAssist: null,
  linkedSub: null,
  opposingKeeper,
});
assert.equal(scoredToSaved[1].kind === "create" && scoredToSaved[1].input.detail, penaltyId);

const savedSameMinuteNewShooter = planEditEvent({
  event: savedPenalty,
  draft: emptyEventDraft({
    minute: 40,
    eventType: "penalty",
    athleteId: assister,
    penaltyOutcome: "saved",
  }),
  linkedAssist: null,
  linkedSub: null,
  linkedGoalkeeperSaves: [linkedSave],
  opposingKeeper,
});
assert.equal(savedSameMinuteNewShooter.length, 1);
assert.equal(
  savedSameMinuteNewShooter[0].kind === "update" &&
    savedSameMinuteNewShooter[0].input.athleteId,
  assister,
);

const savedMinuteChange = planEditEvent({
  event: savedPenalty,
  draft: emptyEventDraft({
    minute: 44,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "saved",
  }),
  linkedAssist: null,
  linkedSub: null,
  linkedGoalkeeperSaves: [linkedSave],
  opposingKeeper,
});
assert.equal(savedMinuteChange.length, 2);
assert.deepEqual(
  savedMinuteChange[1].kind === "update" && savedMinuteChange[1].input,
  { minute: 44 },
);

const addedSaved = planAddEvent(
  emptyEventDraft({
    minute: 12,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "saved",
  }),
  { opposingKeeper },
);
assert.equal(addedSaved.length, 2);
assert.equal(addedSaved[0].kind === "create" && addedSaved[0].captureId, true);
assert.equal(addedSaved[1].kind === "create" && addedSaved[1].detailFromPrimary, true);
assert.equal(addedSaved[1].kind === "create" && addedSaved[1].input.eventType, "goalkeeper_save");
assert.equal("detail" in (addedSaved[1].kind === "create" ? addedSaved[1].input : {}), false);

const addedSavedWithoutKeeper = planAddEvent(
  emptyEventDraft({
    minute: 12,
    eventType: "penalty",
    athleteId: scorer,
    penaltyOutcome: "saved",
  }),
);
assert.equal(addedSavedWithoutKeeper.length, 1);

console.log("[match-report-event-form] passed", {
  goalOps: goalOps.length,
  subDetail: incoming,
  injurySubOps: injurySub.length,
  cardType: cardOps[0].kind === "create" ? cardOps[0].input.eventType : null,
});

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

console.log("[match-report-event-form] passed", {
  goalOps: goalOps.length,
  subDetail: incoming,
  injurySubOps: injurySub.length,
  cardType: cardOps[0].kind === "create" ? cardOps[0].input.eventType : null,
});

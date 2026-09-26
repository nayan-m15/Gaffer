import assert from "node:assert/strict";
import test from "node:test";
import {
  chronologicalMatchEvents,
  matchReportFilename,
  matchReportGoals,
  matchReportSubstitutions,
  matchReportTimeline,
} from "./live-match-report-model.ts";
import { createLiveMatchReportPdf } from "./live-match-report-export.ts";

const squad = [
  { id: "p1", firstName: "Alex", lastName: "Morgan", squadNumber: 9, position: "ST", started: true },
  { id: "p2", firstName: "Sam", lastName: "Kerr", squadNumber: 10, position: "FW", started: true },
  { id: "p3", firstName: "Jamie", lastName: "Lee", squadNumber: 18, position: "MF", started: false },
];

const match = {
  id: "match-1", eventId: "event-1", competitionId: "competition-1",
  opponentName: "City / Athletic", isHome: true, teamScore: 2, opponentScore: 1,
  gamePlanId: null, gamePlanSnapshot: null, opponentSquadVisibility: "full",
  teamColor: null, opponentColor: null, clockPeriod: "full_time", clockElapsedMs: 5_400_000,
  clockStartedAt: null, clockRevision: 1, createdAt: "2026-09-24T13:00:00Z",
  updatedAt: "2026-09-24T15:00:00Z", eventTitle: "League match", eventStatus: "completed",
  eventScheduledAt: "2026-09-24T13:00:00Z", eventLocation: "Gaffer Stadium",
  eventNotes: "Compact and disciplined after half-time.", competitionName: "Premier League",
  competitionSeason: "2026/27", opponentSquad: [{ id: "o1", shirtNumber: 7, name: "Taylor" }],
};

function event(id, minute, eventType, overrides = {}) {
  return {
    id, matchId: match.id, athleteId: "p1", team: "own", opponentLabel: null,
    opponentPlayerId: null, eventType, minute, detail: null, loggedByUserId: "coach-1",
    manuallyAdjusted: false, period: minute <= 45 ? "first_half" : "second_half",
    matchElapsedMs: minute * 60_000, lifecycleStatus: "confirmed",
    createdAt: `2026-09-24T13:${String(minute % 60).padStart(2, "0")}:00Z`,
    updatedAt: "2026-09-24T15:00:00Z", athlete: squad[0], opponentPlayer: null,
    ...overrides,
  };
}

function data(events) {
  return { match, teamName: "Gaffer FC", squad, events, generatedAt: new Date("2026-09-24T16:00:00Z") };
}

test("logged events are ordered chronologically and paired assists stay with goals", () => {
  const events = [
    event("sub", 60, "substitution", { detail: "p3" }),
    event("assist", 12, "assist", { athleteId: "p2", athlete: squad[1], detail: "goal" }),
    event("goal", 12, "goal"),
    event("yellow", 27, "yellow_card"),
  ];
  assert.deepEqual(chronologicalMatchEvents(events).map((row) => row.id), ["assist", "goal", "yellow", "sub"]);
  const timeline = matchReportTimeline(data(events));
  assert.deepEqual(timeline.map((row) => row.id), ["goal", "yellow", "sub"]);
  assert.match(timeline[0].detail, /Sam Kerr/);
  assert.match(timeline[2].detail, /Jamie Lee/);
});

test("goals and substitutions contain the correct players and running score", () => {
  const events = [
    event("goal", 12, "goal"),
    event("assist", 12, "assist", { athleteId: "p2", athlete: squad[1], detail: "goal" }),
    event("opp-goal", 50, "goal", { team: "opponent", athleteId: null, athlete: null, opponentPlayerId: "o1", opponentPlayer: match.opponentSquad[0] }),
    event("sub", 60, "substitution", { detail: "p3" }),
  ];
  const goals = matchReportGoals(data(events));
  assert.deepEqual(goals.map((goal) => goal.score), ["1-0", "1-1"]);
  assert.match(goals[0].scorer, /Alex Morgan/);
  assert.match(goals[0].assist, /Sam Kerr/);
  const [substitution] = matchReportSubstitutions(data(events));
  assert.match(substitution.playerOff, /Alex Morgan/);
  assert.match(substitution.playerOn, /Jamie Lee/);
});

test("filename is sanitized and uses the scheduled match date", () => {
  assert.equal(
    matchReportFilename(data([])),
    "Gaffer_Match_Report_Gaffer_FC_vs_City_Athletic_2026-09-24.pdf",
  );
});

test("a long timeline generates a valid multi-page A4 report", async () => {
  const events = Array.from({ length: 110 }, (_, index) =>
    event(`event-${index}`, index + 1, index % 3 === 0 ? "key_pass" : "yellow_card"),
  );
  const pdf = await createLiveMatchReportPdf(data(events));
  assert.ok(pdf.getNumberOfPages() >= 3);
  assert.ok(pdf.output("arraybuffer").byteLength > 1_000);
});

test("missing optional season, notes, and player position do not break PDF generation", async () => {
  const sparse = data([]);
  sparse.match = { ...match, competitionSeason: null, eventNotes: null };
  sparse.squad = [{ ...squad[0], position: null }];
  const pdf = await createLiveMatchReportPdf(sparse);
  assert.ok(pdf.output("arraybuffer").byteLength > 1_000);
});

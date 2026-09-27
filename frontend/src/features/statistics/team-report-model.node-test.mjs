import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTeamReportCsv,
  reportHighlights,
  safeReportFilename,
} from "./team-report-model.ts";

function report(overrides = {}) {
  return {
    context: {
      teamName: "Gaffer, United",
      competitionName: "Premier League",
      seasonName: "2026/27",
      dateRange: "1 Aug 2026 – 31 May 2027",
      generatedAt: new Date("2026-09-24T10:00:00Z"),
    },
    overview: {
      matchesPlayed: 2,
      wins: 1,
      draws: 1,
      losses: 0,
      winRate: 0.5,
      goalsFor: 3,
      goalsAgainst: 1,
      goalDifference: 2,
      cleanSheets: 1,
      points: 4,
      avgGoalsFor: 1.5,
      avgGoalsAgainst: 0.5,
      trends: [
        { matchId: "m1", eventId: "e1", date: "2026-09-01T15:00:00Z", opponent: "City", isHome: true, result: "W", goalsFor: 3, goalsAgainst: 1, points: 3 },
      ],
      players: [
        { athleteId: "p1", name: "Alex Example", appearances: 2, goals: 2, assists: 1, yellowCards: 1, redCards: 0 },
      ],
      season: null,
      rollingWindow: 5,
      form: { rolling: [], cumulative: [] },
      periods: { mode: "halves", splits: [], deltas: [] },
      ...overrides,
    },
  };
}

test("CSV contains summary, match, and player rows with escaped values", () => {
  const csv = buildTeamReportCsv(report());
  assert.match(csv, /^\uFEFFSection,Metric,Value/);
  assert.match(csv, /Team summary,Team,"Gaffer, United"/);
  assert.match(csv, /Match result,[^\r\n]*City,Home,3-1,W/);
  assert.match(csv, /Player performance,[^\r\n]*Alex Example,2,2,1,1,0/);
});

test("highlights only use statistics present in report data", () => {
  const highlights = reportHighlights(report().overview);
  assert.deepEqual(highlights.map((item) => item.label), [
    "Top scorer",
    "Most assists",
    "Most appearances",
    "Best result",
  ]);

  const empty = reportHighlights(report({ trends: [], players: [] }).overview);
  assert.deepEqual(empty, []);
});

test("report filenames are filesystem-safe and date-stamped", () => {
  assert.equal(
    safeReportFilename("Gaffer / United FC", new Date("2026-09-24T10:00:00Z")),
    "Gaffer_United_FC_2026-09-24",
  );
});

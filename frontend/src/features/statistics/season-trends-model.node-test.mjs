import assert from "node:assert/strict";
import test from "node:test";
import {
  comparisonChartRows,
  cumulativeChartRows,
  deltaArrow,
  deltaTone,
  formatDelta,
  formatSeasonRange,
  periodChartRows,
  rollingChartRows,
} from "./season-trends-model.ts";

function rollingPoint(index, windowSize, overrides = {}) {
  return {
    matchId: `m${index}`,
    date: "2025-08-02T12:00:00.000Z",
    index,
    windowSize,
    goalsForAvg: 1,
    goalsAgainstAvg: 1,
    pointsPerGame: 1,
    ...overrides,
  };
}

function split(key, label, overrides = {}) {
  return {
    key,
    label,
    from: "2025-08-02T12:00:00.000Z",
    to: "2025-08-30T12:00:00.000Z",
    matchesPlayed: 3,
    wins: 1,
    draws: 1,
    losses: 1,
    points: 4,
    goalsFor: 4,
    goalsAgainst: 4,
    cleanSheets: 0,
    pointsPerGame: 1.33,
    avgGoalsFor: 1.33,
    avgGoalsAgainst: 1.33,
    winRate: 0.33,
    ...overrides,
  };
}

function athlete(name, overrides = {}) {
  return {
    athleteId: name,
    name,
    position: null,
    squadNumber: null,
    appearances: 5,
    starts: 5,
    minutesPlayed: 0,
    matchesWithMinutes: 0,
    goals: 3,
    assists: 2,
    yellowCards: 0,
    redCards: 0,
    goalContributions: 5,
    perAppearance: { goals: 0.6, assists: 0.4, goalContributions: 1 },
    per90: null,
    ...overrides,
  };
}

test("rollingChartRows flags partial windows early in the season", () => {
  const rows = rollingChartRows(
    [rollingPoint(1, 1), rollingPoint(2, 2), rollingPoint(3, 3), rollingPoint(4, 3)],
    3,
  );

  assert.deepEqual(
    rows.map((r) => r.partial),
    [true, true, false, false],
  );
  assert.deepEqual(
    rows.map((r) => r.label),
    ["M1", "M2", "M3", "M4"],
  );
});

test("rollingChartRows carries the averages through", () => {
  const rows = rollingChartRows(
    [rollingPoint(1, 1, { goalsForAvg: 2.5, goalsAgainstAvg: 0.5, pointsPerGame: 3 })],
    5,
  );

  assert.equal(rows[0].goalsFor, 2.5);
  assert.equal(rows[0].goalsAgainst, 0.5);
  assert.equal(rows[0].pointsPerGame, 3);
});

test("rollingChartRows handles an empty season", () => {
  assert.deepEqual(rollingChartRows([], 5), []);
});

test("cumulativeChartRows maps points and goal difference", () => {
  const rows = cumulativeChartRows([
    { matchId: "m1", date: "", index: 1, points: 3, cumulativePoints: 3, cumulativeGoalDifference: 2 },
    { matchId: "m2", date: "", index: 2, points: 0, cumulativePoints: 3, cumulativeGoalDifference: 0 },
  ]);

  assert.deepEqual(
    rows.map((r) => r.points),
    [3, 3],
  );
  assert.deepEqual(
    rows.map((r) => r.goalDifference),
    [2, 0],
  );
});

test("periodChartRows selects the requested metric", () => {
  const splits = [
    split("first", "First half", { pointsPerGame: 1.33, avgGoalsAgainst: 2 }),
    split("second", "Second half", { pointsPerGame: 3, avgGoalsAgainst: 0.5 }),
  ];

  assert.deepEqual(
    periodChartRows(splits, "pointsPerGame").map((r) => r.value),
    [1.33, 3],
  );
  assert.deepEqual(
    periodChartRows(splits, "avgGoalsAgainst").map((r) => r.value),
    [2, 0.5],
  );
  assert.deepEqual(
    periodChartRows(splits, "pointsPerGame").map((r) => r.label),
    ["First half", "Second half"],
  );
});

test("comparisonChartRows pivots athletes into one row per metric", () => {
  const rows = comparisonChartRows([
    athlete("Alex Morgan", { goals: 10, assists: 1, goalContributions: 11, appearances: 5 }),
    athlete("Sam Kerr", { goals: 4, assists: 6, goalContributions: 10, appearances: 5 }),
  ]);

  assert.deepEqual(
    rows.map((r) => r.metric),
    ["Goals", "Assists", "G+A", "Apps"],
  );
  assert.equal(rows[0]["Alex Morgan"], 10);
  assert.equal(rows[0]["Sam Kerr"], 4);
  assert.equal(rows[1]["Alex Morgan"], 1);
  assert.equal(rows[2]["Sam Kerr"], 10);
});

test("comparisonChartRows still returns metric rows with no athletes", () => {
  const rows = comparisonChartRows([]);
  assert.equal(rows.length, 4);
  assert.deepEqual(Object.keys(rows[0]), ["metric"]);
});

test("formatDelta always signs a non-zero delta", () => {
  assert.equal(formatDelta(1.67), "+1.67");
  assert.equal(formatDelta(-0.25), "-0.25");
  assert.equal(formatDelta(0), "0");
});

test("deltaTone follows direction, so conceding fewer goals reads positive", () => {
  const conceded = {
    metric: "avgGoalsAgainst",
    label: "Goals conceded per match",
    first: 3,
    last: 0,
    delta: -3,
    direction: "improving",
    higherIsBetter: false,
  };

  assert.equal(deltaTone(conceded), "positive");
  // The arrow still follows the raw movement.
  assert.equal(deltaArrow(conceded), "down");
});

test("deltaTone marks a decline negative and a steady metric neutral", () => {
  assert.equal(
    deltaTone({ direction: "declining", delta: -1, higherIsBetter: true }),
    "negative",
  );
  assert.equal(
    deltaTone({ direction: "steady", delta: 0.01, higherIsBetter: true }),
    "neutral",
  );
  assert.equal(deltaArrow({ direction: "steady", delta: 0.01 }), "flat");
});

test("formatSeasonRange renders both bounds in UTC", () => {
  assert.equal(
    formatSeasonRange("2025-08-01", "2026-05-31"),
    "1 Aug 2025 – 31 May 2026",
  );
});

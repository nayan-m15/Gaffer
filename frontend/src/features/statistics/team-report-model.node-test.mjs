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

/** RFC 4180 quoting only — mirrors how the report escapes a cell. */
function escapeCsv(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The cell the report must emit for a value that could run as a formula. */
function guardedCell(value) {
  return escapeCsv(`'${value}`);
}

test("CSV neutralizes =, +, - and @ formula triggers in user-controlled fields", () => {
  const data = report();
  data.context.teamName = '=HYPERLINK("http://evil.example","click")';
  data.context.competitionName = "+SUM(A1:A2)";
  data.context.seasonName = "@SUM(1,1)";
  data.overview.trends[0].opponent = "-2+3+cmd|' /C calc'!A1";
  data.overview.players[0].name = "=1+1";

  const csv = buildTeamReportCsv(data);

  // Each hostile field must be exported with the text-marker guard, as a
  // literal cell — team, competition, season, opponent and player names.
  assert.ok(
    csv.includes(`Team summary,Team,${guardedCell(data.context.teamName)},`),
    "team name is guarded",
  );
  assert.ok(
    csv.includes(`Team summary,Season,${guardedCell(data.context.seasonName)},`),
    "season name is guarded",
  );
  assert.ok(
    csv.includes(`,${guardedCell(data.context.competitionName)},`),
    "competition name is guarded",
  );
  assert.ok(
    csv.includes(`,${guardedCell(data.overview.trends[0].opponent)},Home,`),
    "opponent name is guarded",
  );
  assert.ok(
    csv.includes(`,${guardedCell(data.overview.players[0].name)},2,2,1,1,0`),
    "player name is guarded",
  );

  // None of the payloads may reach the file unguarded.
  assert.ok(!csv.includes(`Team summary,Team,${escapeCsv(data.context.teamName)},`));
  assert.ok(!csv.includes(`,${escapeCsv(data.context.competitionName)},`));
  assert.ok(!csv.includes(`,${escapeCsv(data.overview.trends[0].opponent)},Home,`));
  assert.ok(!csv.includes(`,${escapeCsv(data.overview.players[0].name)},2,2,1,1,0`));

  // Numbers are exempt from the guard: a negative goal difference must stay
  // a plain numeric cell so spreadsheet calculations keep working.
  const negative = buildTeamReportCsv(report({ goalDifference: -3 }));
  assert.ok(negative.includes("Team summary,Goal difference,-3,"));
  assert.ok(!negative.includes("Team summary,Goal difference,'-3,"));
  // Positive and zero numbers round-trip unchanged too.
  assert.ok(negative.includes("Team summary,Matches played,2,"));
  assert.ok(negative.includes("Team summary,Goals for,3,"));
});

test("a string beginning with '-' is still guarded, unlike a numeric -3", () => {
  const data = report();
  // seasonName is a user-controlled string cell: the same characters that
  // are harmless as a number are a formula trigger as text.
  data.context.seasonName = "-3";

  const csv = buildTeamReportCsv(data);

  assert.ok(
    csv.includes(`Team summary,Season,${guardedCell("-3")},`),
    "string '-3' is guarded with the text marker",
  );
  // The unguarded text form must never reach the file.
  assert.ok(!csv.includes("Team summary,Season,-3,"));
});

test("leading whitespace or control characters cannot bypass the formula guard", () => {
  const data = report();
  data.context.teamName = " =1+1";
  data.context.seasonName = "\t=2+2";
  data.context.competitionName = "\n=3+3";
  data.overview.trends[0].opponent = "\r@SUM(1,1)";
  data.overview.players[0].name = "\x0b+SUM(2,2)";

  const csv = buildTeamReportCsv(data);

  assert.ok(
    csv.includes(`Team summary,Team,${guardedCell(data.context.teamName)},`),
    "leading space is guarded",
  );
  assert.ok(
    csv.includes(`Team summary,Season,${guardedCell(data.context.seasonName)},`),
    "leading tab is guarded",
  );
  assert.ok(
    csv.includes(`,${guardedCell(data.context.competitionName)},`),
    "leading newline is guarded",
  );
  assert.ok(
    csv.includes(`,${guardedCell(data.overview.trends[0].opponent)},Home,`),
    "leading carriage return is guarded",
  );
  assert.ok(
    csv.includes(`,${guardedCell(data.overview.players[0].name)},2,2,1,1,0`),
    "leading vertical tab is guarded",
  );

  // The blank-then-trigger payloads must never appear as bare cells.
  assert.ok(!csv.includes("Team summary,Team, =1+1,"));
  assert.ok(!csv.includes(`Team summary,Season,${escapeCsv("\t=2+2")},`));
  assert.ok(!csv.includes(`,${escapeCsv(data.overview.players[0].name)},2,2,1,1,0`));
});

test("formula guard preserves normal CSV escaping of quotes, commas and newlines", () => {
  const data = report();
  data.context.teamName = 'Gaffer, "United"';
  data.context.seasonName = "2026\n27";

  const csv = buildTeamReportCsv(data);

  // Plain values with quotes, commas and newlines keep the exact RFC 4180
  // escaping they had before the guard.
  assert.ok(csv.includes(`Team summary,Team,${escapeCsv('Gaffer, "United"')},`));
  assert.ok(csv.includes(`Team summary,Season,${escapeCsv("2026\n27")},`));

  // A hostile value that also needs quoting round-trips both the guard and
  // the escaping: guard first, then the doubled quotes inside a quoted cell.
  const data2 = report();
  data2.context.teamName = '=CONCAT("a,b")';
  const csv2 = buildTeamReportCsv(data2);
  assert.ok(csv2.includes(`Team summary,Team,"'=CONCAT(""a,b"")",`));

  // Untouched values keep exporting exactly as before.
  assert.match(csv2, /Match result,[^\r\n]*City,Home,3-1,W/);
  assert.match(csv2, /Player performance,[^\r\n]*Alex Example,2,2,1,1,0/);
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

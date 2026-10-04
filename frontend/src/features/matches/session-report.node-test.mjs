import assert from "node:assert/strict";
import test from "node:test";
import {
  sessionPlayerLabel,
  sessionReportKey,
  applySessionReport,
  sessionTimeline,
} from "./session-report-model.ts";
const report = {
  sessionId: "session",
  participants: [],
  score: { home: 2, away: 1 },
  clock: {
    period: "full_time",
    elapsedMs: 5400000,
    startedAt: null,
    revision: 4,
  },
  finalStatus: "finalised",
  confirmations: { home: "yes", away: "yes" },
  timeline: [
    {
      id: "goal",
      side: "home",
      eventType: "goal",
      minute: 12,
      player: { name: "Shared Player", shirtNumber: 9 },
    },
  ],
  reviews: [],
};
test("both owning sheets resolve one shared cache, score, clock and timeline while private fields survive", () => {
  const home = {
    id: "sheet-a",
    isHome: true,
    gamePlanId: "private-a",
    eventNotes: "notes-a",
  };
  const away = {
    id: "sheet-b",
    isHome: false,
    gamePlanId: "private-b",
    eventNotes: "notes-b",
  };
  assert.deepEqual(sessionReportKey(report.sessionId), [
    "match-sessions",
    "session",
    "report",
  ]);
  const a = applySessionReport(home, report),
    b = applySessionReport(away, report);
  assert.equal(a.teamScore, b.opponentScore);
  assert.equal(a.opponentScore, b.teamScore);
  assert.equal(a.clockPeriod, b.clockPeriod);
  assert.equal(a.projection.finalisationState, b.projection.finalisationState);
  assert.equal(a.gamePlanId, "private-a");
  assert.equal(b.eventNotes, "notes-b");
  assert.equal(
    sessionTimeline(report, home)[0].side,
    sessionTimeline(report, away)[0].side,
  );
  assert.equal(sessionTimeline(report, away)[0].team, "opponent");
  assert.equal(sessionTimeline(report, away)[0].detail, null);
});
test("awaiting bilateral confirmation stays open and disputed decisions require amendment", () => {
  assert.equal(
    applySessionReport(
      { isHome: true },
      { ...report, finalStatus: "awaiting_confirmation" },
    ).projection.finalisationState,
    "open",
  );
  assert.equal(
    applySessionReport(
      { isHome: true },
      {
        ...report,
        finalStatus: "amendment_required",
        reviews: [{ status: "resolved", disputedAt: "now" }],
      },
    ).projection.unresolvedReviewCount,
    1,
  );
});
import { readFileSync } from "node:fs";
import ts from "typescript";
const apiSource = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const apiJs = ts.transpileModule(apiSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
class ApiError extends Error {
  constructor(status) {
    super("request failed");
    this.status = status;
  }
}
function apiHarness() {
  const calls = [],
    cache = new Map();
  let failure;
  const offline = {
    cacheResponse: async (key, value) => {
      calls.push(key);
      cache.set(key, value);
    },
    readCachedResponse: async (key) => cache.get(key),
    readSyncedSessionReport: async (id, sheet, value) => {
      calls.push(["synced", id, sheet]);
      return value;
    },
  };
  const compiled = {};
  new Function("exports", "require", apiJs)(compiled, (name) =>
    name === "@/lib/api"
      ? {
          ApiError,
          apiFetch: async (url) => {
            calls.push(url);
            if (failure) throw failure;
            return report;
          },
        }
      : offline,
  );
  return {
    api: compiled,
    calls,
    fail: (error) => {
      failure = error;
    },
  };
}
test("both access handles fetch and persist one session DTO; offline uses synced session data", async () => {
  const h = apiHarness();
  await h.api.fetchSessionReport("session", "sheet-a");
  await h.api.fetchSessionReport("session", "sheet-b");
  assert.deepEqual(
    h.calls.filter((x) => typeof x === "string"),
    [
      "/matches/sessions/session/report",
      "session-report:session",
      "/matches/sessions/session/report",
      "session-report:session",
    ],
  );
  h.fail(new TypeError("offline"));
  assert.equal(await h.api.fetchSessionReport("session", "sheet-b"), report);
  assert.deepEqual(h.calls.at(-1), ["synced", "session", "sheet-b"]);
  h.fail(new ApiError(403));
  await assert.rejects(
    h.api.fetchSessionReport("session", "sheet-b"),
    /request failed/,
  );
  h.fail(new ApiError(404));
  await assert.rejects(
    h.api.fetchSessionReport("session", "sheet-b"),
    /request failed/,
  );
});
const storeSource = readFileSync(
  new URL("../../offline/match-store.ts", import.meta.url),
  "utf8",
);
const readerSource = storeSource.slice(
  storeSource.indexOf("export async function readSyncedSessionReport("),
  storeSource.indexOf(
    "export async function subscribeToSyncedSessionReportChanges(",
  ),
);
const readerJs = ts.transpileModule(readerSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
test("synced report reconstructs canonical score, full time, bilateral confirmation and disputed decisions", async () => {
  const calls = [];
  const db = {
    getAll: async () => [],
    getOptional: async (sql, args) => {
      calls.push(args);
      return sql.includes("competition_fixtures")
        ? null
        : {
            home_confirmed_at: "yes",
            away_confirmed_at: "yes",
            finalised_at: "now",
          };
    },
  };
  const compiled = {};
  new Function(
    "exports",
    "database",
    "readSyncedMatchEvents",
    "readSyncedMatchReviews",
    "readSyncedSessionClockOperation",
    readerJs,
  )(
    compiled,
    async () => db,
    async () => [
      { id: "canonical-goal", side: "away", eventType: "goal", minute: 5 },
    ],
    async () => [
      {
        id: "review",
        status: "resolved",
        resolution: "same_event",
        disputedAt: "now",
      },
    ],
    async () => ({
      period: "full_time",
      elapsed_ms: 5400000,
      running: 0,
      applied_revision: 7,
    }),
  );
  const synced = await compiled.readSyncedSessionReport(
    "session",
    "sheet-b",
    report,
  );
  assert.deepEqual(calls, [["session"], ["session"]]);
  assert.deepEqual(synced.score, { home: 0, away: 1 });
  assert.equal(synced.finalStatus, "amendment_required");
  assert.equal(synced.clock.running, false);
  assert.equal(synced.reviews[0].resolution, "same_event");
});

test("offline published fixture score wins over timeline and a peer finish stops every clock", async () => {
  const db = {
    getOptional: async (sql) =>
      sql.includes("competition_fixtures")
        ? { home_score: 3, away_score: 1, status: "completed" }
        : {
            home_confirmed_at: "yes",
            away_confirmed_at: "yes",
            finalised_at: "now",
          },
    getAll: async () => [
      {
        id: "sheet-a",
        clock_period: "first_half",
        clock_elapsed_ms: 60000,
        clock_started_at: "now",
        clock_revision: 8,
      },
      {
        id: "sheet-b",
        clock_period: "full_time",
        clock_elapsed_ms: 5400000,
        clock_started_at: null,
        clock_revision: 7,
      },
    ],
  };
  const compiled = {};
  new Function(
    "exports",
    "database",
    "readSyncedMatchEvents",
    "readSyncedMatchReviews",
    "readSyncedSessionClockOperation",
    readerJs,
  )(
    compiled,
    async () => db,
    async () => [],
    async () => [],
    async () => null,
  );
  const synced = await compiled.readSyncedSessionReport(
    "session",
    "sheet-a",
    report,
  );
  assert.deepEqual(synced.score, { home: 3, away: 1 });
  assert.equal(synced.finalStatus, "finalised");
  assert.equal(synced.clock.period, "full_time");
  assert.equal(synced.clock.startedAt, null);
  assert.equal(synced.clock.elapsedMs, 5400000);
});

test('canonical player labels ignore viewer-private identity and legacy labels stay unchanged', () => {
  const a = sessionTimeline(report, {id:'a', isHome:true})[0];
  const b = sessionTimeline(report, {id:'b', isHome:false})[0];
  a.athlete = {firstName:'Private', lastName:'Name', squadNumber:99};
  assert.equal(sessionPlayerLabel(a), '#9 Shared Player');
  assert.equal(sessionPlayerLabel(b), sessionPlayerLabel(a));
  assert.equal(sessionPlayerLabel({athlete:a.athlete}), null);
});

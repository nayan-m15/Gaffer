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

function stubApi(apiFetch, offline) {
  const compiled = {};
  new Function("exports", "require", apiJs)(compiled, (name) =>
    name === "@/lib/api" ? { ApiError, apiFetch } : offline);
  return compiled;
}
test("older and equal synced clock revisions retain the API anchor; newer revisions replace it completely", async () => {
  const match = { clockRevision: 8, clockPeriod: "second_half", clockElapsedMs: 1000, clockStartedAt: "fresh" };
  for (const revision of [7, 8, 9]) {
    const api = stubApi(async () => match, {
      cacheResponse: async () => {},
      readSyncedSessionClockOperation: async () => ({ applied_revision: revision, period: "first_half", elapsed_ms: 10, running: 1, created_at: "old" }),
    });
    const actual = await api.fetchMatch("sheet");
    assert.deepEqual(actual, revision <= 8 ? match : { clockRevision: 9, clockPeriod: "first_half", clockElapsedMs: 10, clockStartedAt: "old" });
  }
});
test("protected match and squad reads never fall back after HTTP denial", async () => {
  for (const status of [401, 403, 404]) {
    const api = stubApi(async () => { throw new ApiError(status); }, new Proxy({}, {
      get: () => async () => { assert.fail("protected cache was read after denial"); },
    }));
    for (const method of ["fetchMatch", "fetchMatchSquad", "fetchMatchOpponentSquad", "fetchMatchEvents"])
      await assert.rejects(api[method]("sheet"), /request failed/);
  }
});
test("batch success applies individual receipts and leaves missing acknowledgements queued with a reason", async () => {
  const outcomes = [], states = [], rejected = [];
  const queue = ["accepted", "rejected", "pending", "missing"].map((id) => ({ id, match_id: "sheet", kind: "operation", state: "queued", payload: JSON.stringify({ id }) }));
  const api = stubApi(async () => ({ receipts: [
    { id: "accepted", outcome: "accepted", canonicalEventId: "canonical" },
    { id: "rejected", outcome: "rejected", safeErrorCode: "SHARED_SESSION_CONFLICT" },
    { id: "pending", outcome: "dependency_pending" },
  ] }), {
    listQueuedEvents: async () => queue,
    setQueuedEventState: async (...args) => states.push(args),
    setQueuedItemOutcome: async (...args) => outcomes.push(args),
    rejectQueuedEvent: async (...args) => rejected.push(args),
  });
  await api.flushOfflineMatchEvents();
  assert.deepEqual(rejected, [["rejected", "SHARED_SESSION_CONFLICT"]]);
  assert.equal(outcomes.find(([id]) => id === "accepted")[1], "accepted");
  assert.equal(outcomes.find(([id]) => id === "pending")[1], "dependency_pending");
  assert.match(outcomes.find(([id]) => id === "missing")[3], /did not acknowledge/);
  assert.equal(outcomes.find(([id]) => id === "missing")[1], "queued");
});
test("a report for another session fails visibly without using cached scores", async () => {
  const api = stubApi(async () => ({ ...report, sessionId: "wrong" }), {
    cacheResponse: async () => assert.fail("wrong report cached"),
    readCachedResponse: async () => assert.fail("private fallback used"),
  });
  await assert.rejects(api.fetchSessionReport("session", "sheet"), /different session/);
});

test("clock retry payload retains original elapsed time and identity while the display advances", async () => {
  const source = storeSource.slice(storeSource.indexOf("export async function readClockAnchor("), storeSource.indexOf("export function queuedEventAsTimelineRow("));
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const compiled = {};
  new Function("exports", "database", js)(compiled, async () => ({ getOptional: async () => ({
    period: "first_half", elapsed_ms: 1000, running: 1, authority_revision: "4", wall_clock_ms: Date.now() - 5000,
    uncertain: 0, operation_id: "immutable", client_created_at: "original", updated_at: "version",
  }) }));
  const anchor = await compiled.readClockAnchor("sheet");
  assert.ok(anchor.elapsedMs >= 6000);
  assert.equal(anchor.operationElapsedMs, 1000);
  assert.equal(anchor.operationId, "immutable");
  assert.equal(anchor.clientCreatedAt, "original");
});

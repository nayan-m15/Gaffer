import assert from "node:assert/strict";
import test from "node:test";
import { mergeSessionTimeline } from "./session-report-model.ts";

test("server delivery replaces a queued event even before queue membership refresh", () => {
  const pending = { id: "same-id", pending: true, lifecycleStatus: "provisional" };
  const server = { id: "same-id", pending: false, lifecycleStatus: "needs_review" };
  const other = { id: "another-id", pending: true };
  assert.deepEqual(mergeSessionTimeline([pending, other], [server]), [server, other]);
});

test("separate observations of the same goal remain available for coach review", () => {
  const first = { id: "first", eventType: "goal", minute: 10 };
  const second = { ...first, id: "second" };
  assert.deepEqual(mergeSessionTimeline([first], [second]), [first, second]);
});

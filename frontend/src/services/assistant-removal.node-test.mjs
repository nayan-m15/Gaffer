import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantRemovalErrorCopy } from "./assistant-removal.ts";

test("maps the coach-only 403 guard to an explicit permission message", () => {
  assert.equal(
    assistantRemovalErrorCopy({ status: 403 }),
    "Only coaches can remove assistants.",
  );
});

test("maps 404 from a stale list to a no-longer-on-team message", () => {
  assert.equal(
    assistantRemovalErrorCopy({ status: 404 }),
    "This assistant is no longer on your team.",
  );
});

test("falls back to a retry prompt for network failures and unknown errors", () => {
  const retryCopy =
    "Could not remove the assistant. Check your connection and try again.";

  assert.equal(assistantRemovalErrorCopy(new TypeError("Failed to fetch")), retryCopy);
  assert.equal(assistantRemovalErrorCopy(undefined), retryCopy);
  assert.equal(assistantRemovalErrorCopy({ status: "500" }), retryCopy);
  assert.equal(assistantRemovalErrorCopy({ status: 500 }), retryCopy);
});

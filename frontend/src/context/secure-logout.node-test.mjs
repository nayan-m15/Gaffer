import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOGOUT_PENDING_RETRY_MESSAGE,
  resolveLogoutAction,
  shouldRetryLogout,
} from "./secure-logout.ts";

// The decision table behind secure logout: the session cookie is HttpOnly, so
// only the server can end a session, and only a 401 proves it ended. Every
// other failure keeps the signed-in UI so it can never claim "signed out"
// while the browser still authenticates.

test("network failures keep the signed-in state and explain the pending retry", () => {
  const action = resolveLogoutAction(null);
  assert.equal(action.clearLocalState, false);
  assert.equal(action.message, LOGOUT_PENDING_RETRY_MESSAGE);
});

test("server errors keep the signed-in state because the session's fate is unknown", () => {
  for (const status of [500, 502, 503, 504]) {
    const action = resolveLogoutAction(status);
    assert.equal(action.clearLocalState, false, `status ${status}`);
    assert.equal(action.message, LOGOUT_PENDING_RETRY_MESSAGE, `status ${status}`);
  }
});

test("a rejected sign-out (403) keeps the signed-in state — the session was not revoked", () => {
  for (const status of [400, 403, 404, 429]) {
    const action = resolveLogoutAction(status);
    assert.equal(action.clearLocalState, false, `status ${status}`);
  }
});

test("a 401 means the server has no session left, so clearing local state is safe", () => {
  const action = resolveLogoutAction(401);
  assert.equal(action.clearLocalState, true);
  assert.equal(action.message, null);
});

test("the keep-state message actually tells the user what will happen", () => {
  assert.ok(LOGOUT_PENDING_RETRY_MESSAGE.length > 0);
  assert.match(LOGOUT_PENDING_RETRY_MESSAGE, /still signed in/i);
  assert.match(LOGOUT_PENDING_RETRY_MESSAGE, /once the connection is back/i);
});

test("an armed retry fires only for the session that failed to sign out", () => {
  assert.equal(shouldRetryLogout({ userId: "coach-1" }, "coach-1"), true);
});

test("a stale retry must not sign out a different signed-in account", () => {
  assert.equal(shouldRetryLogout({ userId: "coach-1" }, "coach-2"), false);
});

test("no retry when nothing is armed or no session is active", () => {
  assert.equal(shouldRetryLogout(null, "coach-1"), false);
  assert.equal(shouldRetryLogout({ userId: "coach-1" }, null), false);
});

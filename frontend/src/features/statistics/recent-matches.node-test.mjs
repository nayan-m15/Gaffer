import assert from "node:assert/strict";
import { test } from "node:test";
import { RECENT_MATCH_LIMIT, selectRecentMatches } from "./recent-matches.ts";

const match = (matchId, date) => ({ matchId, date });

test("orders matches newest first and keeps only the five most recent", () => {
  const matches = [
    match("jan-10", "2026-01-10"),
    match("mar-01", "2026-03-01"),
    match("dec-25", "2025-12-25"),
    match("feb-14", "2026-02-14"),
    match("jan-31", "2026-01-31"),
    match("apr-02", "2026-04-02"),
  ];

  const recent = selectRecentMatches(matches);

  assert.equal(RECENT_MATCH_LIMIT, 5);
  assert.deepEqual(
    recent.map((entry) => entry.matchId),
    ["apr-02", "mar-01", "feb-14", "jan-31", "jan-10"],
  );
});

test("returns every match when fewer than five exist", () => {
  const matches = [
    match("newer", "2026-02-01"),
    match("older", "2026-01-01"),
  ];

  const recent = selectRecentMatches(matches);

  assert.deepEqual(
    recent.map((entry) => entry.matchId),
    ["newer", "older"],
  );
});

test("returns an empty list when the athlete has no matches", () => {
  assert.deepEqual(selectRecentMatches([]), []);
});

test("does not mutate the caller's array", () => {
  const matches = [
    match("later", "2026-02-01"),
    match("earlier", "2026-01-01"),
  ];

  selectRecentMatches(matches);

  assert.deepEqual(
    matches.map((entry) => entry.matchId),
    ["later", "earlier"],
  );
});

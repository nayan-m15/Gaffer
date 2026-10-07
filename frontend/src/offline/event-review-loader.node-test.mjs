import assert from "node:assert/strict";
import test from "node:test";
import { loadEventReviews } from "./event-review-loader.ts";

const review = { id: "review", status: "open", observations: [] };
const broken = async () => { throw new Error("Local storage unavailable"); };

test("online reviews load when local reads and cache writes fail", async () => {
  const result = await loadEventReviews({ online: true, fetch: async () => [review],
    synced: broken, cached: broken, cache: broken });
  assert.deepEqual(result, { reviews: [review], warning: null });
});

test("503 keeps the cached queue visible with an explicit refresh warning", async () => {
  const result = await loadEventReviews({ online: true, fetch: async () => { throw new Error("503 unavailable"); },
    synced: async () => [], cached: async () => [review], cache: broken });
  assert.deepEqual(result.reviews, [review]);
  assert.match(result.warning, /503 unavailable/);
});

test("offline uses cached reviews when sync has not delivered them", async () => {
  const result = await loadEventReviews({ online: false, fetch: broken,
    synced: async () => [], cached: async () => [review], cache: broken });
  assert.deepEqual(result.reviews, [review]);
});

test("a resolved synced review supersedes its cached open state", async () => {
  const result = await loadEventReviews({ online: false, fetch: broken,
    synced: async () => [{ ...review, status: "resolved" }], cached: async () => [review], cache: broken });
  assert.equal(result.reviews[0].status, "resolved");
});

test("an authoritative empty server queue replaces stale cached reviews", async () => {
  const result = await loadEventReviews({ online: true, fetch: async () => [],
    synced: async () => [review], cached: async () => [review], cache: async () => {} });
  assert.deepEqual(result.reviews, []);
});

test("unavailable reviews report a failure instead of an empty queue", async () => {
  await assert.rejects(loadEventReviews({ online: false, fetch: broken,
    synced: broken, cached: broken, cache: broken }), /unavailable offline/);
});

test("access denial never falls back to a cached private review", async () => {
  for (const status of [401, 403, 404]) {
    const denied = Object.assign(new Error("Access denied"), { status });
    await assert.rejects(loadEventReviews({ online: true, fetch: async () => { throw denied; },
      synced: async () => [review], cached: async () => [review], cache: broken }), /Access denied/);
  }
});

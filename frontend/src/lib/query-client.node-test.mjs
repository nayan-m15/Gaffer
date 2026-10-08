import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { notifyDataChange } from "./data-changes.ts";

// Exercise browser interval/focus behavior; QueryObserver disables timers on servers.
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { visibilityState: "visible" };
const { QueryObserver, focusManager, onlineManager } = await import("@tanstack/react-query");
const { createAppQueryClient, connectAutomaticRefresh } = await import("./query-client.ts");

function createTestClient() {
  const client = createAppQueryClient();
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, gcTime: Infinity },
    mutations: { gcTime: Infinity },
  });
  return client;
}

test("visible pages poll without writes and refetch fresh data on focus and reconnect", async () => {
  const client = createTestClient();
  client.mount();
  let reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: ["dashboard"], queryFn: () => ++reads, staleTime: Infinity,
  });
  const stop = observer.subscribe(() => {});
  try {
    await delay(5_150);
    assert.equal(reads, 2, "remote changes are fetched on the default interval");
    focusManager.setFocused(false);
    await delay(5_150);
    assert.equal(reads, 2, "hidden pages do not poll");
    focusManager.setFocused(true);
    await delay(20);
    assert.equal(reads, 3, "returning to the app refetches even with infinite stale time");
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await delay(20);
    assert.equal(reads, 4, "reconnecting refreshes immediately");
  } finally {
    stop(); client.unmount(); client.clear();
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
  }
});

test("writes refresh mounted views and dialogs, mark inactive data stale, and leave disabled reads idle", async () => {
  const client = createTestClient();
  const disconnect = connectAutomaticRefresh(client);
  let revision = 1;
  let disabledReads = 0;
  const page = new QueryObserver(client, {
    queryKey: ["athletes"], queryFn: () => revision, staleTime: Infinity,
  });
  const dialog = new QueryObserver(client, {
    queryKey: ["injuries", "detail"], queryFn: () => revision, staleTime: Infinity,
  });
  const disabled = new QueryObserver(client, {
    queryKey: ["closed-dialog"], enabled: false,
    queryFn: () => { disabledReads++; return revision; },
  });
  const stops = [page, dialog, disabled].map((observer) => observer.subscribe(() => {}));
  try {
    await delay(10);
    client.setQueryData(["statistics"], 1);
    revision = 2;
    notifyDataChange("/injuries");
    await delay(150);
    assert.equal(page.getCurrentResult().data, 2);
    assert.equal(dialog.getCurrentResult().data, 2);
    assert.equal(disabledReads, 0);
    assert.equal(client.getQueryState(["statistics"]).isInvalidated, true);
  } finally {
    disconnect(); stops.forEach((stop) => stop()); client.clear();
  }
});

test("refresh waits for optimistic mutations to settle and coalesces write bursts", async () => {
  const client = createTestClient();
  const disconnect = connectAutomaticRefresh(client);
  let reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: ["matches", "one"], queryFn: () => ++reads, staleTime: Infinity,
  });
  const stop = observer.subscribe(() => {});
  let finish;
  try {
    await delay(10);
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => new Promise((resolve) => { finish = resolve; }),
    });
    const saving = mutation.execute();
    await delay(10);
    notifyDataChange("/matches/one/events");
    notifyDataChange("/matches/one/clock");
    await delay(150);
    assert.equal(reads, 1, "no broad refetch during an optimistic mutation");
    finish();
    await saving;
    await delay(150);
    assert.equal(reads, 2, "one refresh after the batch settles");
    disconnect();
    notifyDataChange("/events");
    await delay(150);
    assert.equal(reads, 2, "cleanup removes the write listener");
  } finally {
    finish?.(); disconnect(); stop(); client.clear();
  }
});

test("writes in another tab refresh this tab without rebroadcast loops", async () => {
  const client = createTestClient();
  const disconnect = connectAutomaticRefresh(client);
  const otherTab = new BroadcastChannel("gaffer-data-changes");
  let reads = 0;
  let echoes = 0;
  otherTab.onmessage = () => { echoes++; };
  const observer = new QueryObserver(client, {
    queryKey: ["events"], queryFn: () => ++reads, staleTime: Infinity,
  });
  const stop = observer.subscribe(() => {});
  try {
    await delay(10);
    otherTab.postMessage("changed");
    await delay(200);
    assert.equal(reads, 2);
    assert.equal(echoes, 0);
  } finally {
    otherTab.close(); disconnect(); stop(); client.clear();
  }
});

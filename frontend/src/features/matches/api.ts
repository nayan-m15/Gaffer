import { apiFetch } from "@/lib/api";
import type {
  CreateMatchLogEventInput,
  MatchLogEvent,
  MatchRecord,
  MatchSquadAthlete,
  OpponentMatchPlayer,
  UpdateMatchLogEventInput,
  UpdateMatchClockInput,
} from "./types";
import { ApiError } from "@/lib/api";
import {
  cacheResponse,
  completeQueuedEvent,
  enqueueEvent,
  enqueueOperation,
  getOfflineDeviceId,
  listQueuedEvents,
  queuedEventAsTimelineRow,
  readCachedResponse,
  readSyncedMatchEvents,
  readSyncedMatchProjection,
  rejectQueuedEvent,
  setQueuedItemOutcome,
  setQueuedEventState,
} from "@/offline/match-store";

async function cachedFetch<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load();
    await cacheResponse(key, value);
    return value;
  } catch (error) {
    const cached = await readCachedResponse<T>(key);
    if (cached !== null) return cached;
    throw error;
  }
}

export async function fetchMatch(matchId: string) {
  try {
    const match = await apiFetch<MatchRecord>(`/matches/${matchId}`);
    await cacheResponse(`match:${matchId}`, match);
    return match;
  } catch (error) {
    const match = await readCachedResponse<MatchRecord>(`match:${matchId}`);
    if (!match) throw error;
    const projection = await readSyncedMatchProjection(matchId);
    return projection
      ? {
          ...match,
          teamScore: projection.provisionalTeamScore,
          opponentScore: projection.provisionalOpponentScore,
          projection,
        }
      : match;
  }
}

export function fetchMatchSquad(matchId: string) {
  return cachedFetch(`squad:${matchId}`, () =>
    apiFetch<MatchSquadAthlete[]>(`/matches/${matchId}/squad`),
  );
}

export function fetchMatchOpponentSquad(matchId: string) {
  return cachedFetch(`opponent-squad:${matchId}`, () =>
    apiFetch<OpponentMatchPlayer[]>(`/matches/${matchId}/opponent-squad`),
  );
}

export async function fetchMatchEvents(matchId: string) {
  let events: MatchLogEvent[];
  try {
    events = (await apiFetch<MatchLogEvent[]>(`/matches/${matchId}/events`)).map(
      (event) => ({ ...event, syncStatus: "reconciled" as const }),
    );
    await cacheResponse(`events:${matchId}`, events);
  } catch (error) {
    const synced = await readSyncedMatchEvents(matchId);
    const cached = await readCachedResponse<MatchLogEvent[]>(`events:${matchId}`);
    if (synced.length > 0) events = synced;
    else if (cached) events = cached;
    else throw error;
  }
  const allQueued = await listQueuedEvents(matchId);
  const canonicalIds = new Set(events.map((event) => event.id));
  const observationIds = new Set(
    events.map((event) => event.clientRequestId).filter(Boolean),
  );
  for (const row of allQueued) {
    if (
      row.state === "accepted" &&
      ((row.canonical_event_id && canonicalIds.has(row.canonical_event_id)) ||
        observationIds.has(row.id))
    ) {
      await completeQueuedEvent(row.id);
    }
  }
  const queued = (await listQueuedEvents(matchId))
    .filter((row) => (row.kind ?? "observation") === "observation")
    .map(queuedEventAsTimelineRow);
  const queuedIds = new Set(queued.map((event) => event.clientRequestId));
  return [...queued, ...events.filter((event) => !queuedIds.has(event.clientRequestId))];
}

async function uploadMatchLogEvent(
  matchId: string,
  input: CreateMatchLogEventInput,
) {
  return uploadSyncItems([
    { kind: "observation" as const, matchId, payload: input },
  ]);
}

interface SyncReceipt {
  id: string;
  outcome: "accepted" | "rejected" | "dependency_pending";
  safeErrorCode?: string | null;
  canonicalEventId?: string | null;
}

async function uploadSyncItems(items: unknown[]) {
  return apiFetch<{ receipts: SyncReceipt[] }>("/sync/upload", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

function syncItemForRow(row: Awaited<ReturnType<typeof listQueuedEvents>>[number]) {
  if (row.kind === "operation") return JSON.parse(row.payload) as unknown;
  return {
    kind: "observation",
    matchId: row.match_id,
    payload: JSON.parse(row.payload) as CreateMatchLogEventInput,
  };
}

async function applyReceipt(receipt: SyncReceipt) {
  if (receipt.outcome === "accepted") {
    await setQueuedItemOutcome(receipt.id, "accepted", receipt.canonicalEventId);
  } else if (receipt.outcome === "dependency_pending") {
    await setQueuedItemOutcome(
      receipt.id,
      "dependency_pending",
      receipt.canonicalEventId,
      "Waiting for an earlier offline change.",
    );
  } else {
    if (receipt.safeErrorCode === "MEMBERSHIP_REVOKED_OR_FORBIDDEN") {
      await setQueuedItemOutcome(
        receipt.id,
        "quarantined",
        receipt.canonicalEventId,
        "Team access was revoked or this account cannot apply the change.",
      );
    } else {
      await rejectQueuedEvent(
        receipt.id,
        receipt.safeErrorCode ?? "The server rejected this offline change.",
      );
    }
  }
}

async function queuedTimelineRow(matchId: string, clientRequestId: string) {
  const row = (await listQueuedEvents(matchId)).find(
    (item) => item.id === clientRequestId,
  );
  return row ? queuedEventAsTimelineRow(row) : null;
}

export async function createMatchLogEvent(
  matchId: string,
  input: CreateMatchLogEventInput,
) {
  const enriched = {
    ...input,
    deviceId: input.deviceId ?? getOfflineDeviceId(),
    clientCreatedAt: input.clientCreatedAt ?? new Date().toISOString(),
  };
  await enqueueEvent(matchId, enriched);

  // Once the operation is in SQLite it is safe to release the live logger.
  // Attempting fetch while the browser already knows it is offline can leave
  // the mutation (and goal follow-up composer) waiting on the network stack.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const queued = await queuedTimelineRow(matchId, enriched.clientRequestId);
    if (queued) return queued;
  }

  try {
    await setQueuedEventState(enriched.clientRequestId, "uploading");
    const response = await uploadMatchLogEvent(matchId, enriched);
    const receipt = response.receipts[0];
    if (!receipt) throw new Error("The server did not acknowledge the event.");
    await applyReceipt(receipt);
    if (receipt.outcome === "rejected") {
      const rejected = await queuedTimelineRow(matchId, enriched.clientRequestId);
      if (rejected) return rejected;
      throw new Error(receipt.safeErrorCode ?? "The server rejected the event.");
    }
    const queued = await queuedTimelineRow(matchId, enriched.clientRequestId);
    if (!queued) throw new Error("The accepted event could not be read locally.");
    return queued;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) {
      await rejectQueuedEvent(enriched.clientRequestId, error.message);
      throw error;
    }
    await setQueuedEventState(enriched.clientRequestId, "queued");
    const queued = await queuedTimelineRow(matchId, enriched.clientRequestId);
    if (!queued) throw error;
    return queued;
  }
}

export async function flushOfflineMatchEvents() {
  const queued = (await listQueuedEvents()).filter((row) =>
    ["queued", "dependency_pending", "uploading"].includes(row.state),
  );
  for (let offset = 0; offset < queued.length; offset += 50) {
    const batch = queued.slice(offset, offset + 50);
    try {
      await Promise.all(
        batch.map((row) => setQueuedEventState(row.id, "uploading")),
      );
      const response = await uploadSyncItems(batch.map(syncItemForRow));
      const receipts = new Map(
        response.receipts.map((receipt) => [receipt.id, receipt]),
      );
      for (const row of batch) {
        const receipt = receipts.get(row.id);
        if (receipt) await applyReceipt(receipt);
        else await setQueuedEventState(row.id, "queued");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        await Promise.all(
          batch.map((row) =>
            setQueuedItemOutcome(
              row.id,
              "quarantined",
              row.canonical_event_id,
              "Team access was revoked. Sign in with the original authorised account to recover this item.",
            ),
          ),
        );
        continue;
      }
      await Promise.all(
        batch.map((row) => setQueuedEventState(row.id, "queued")),
      );
      break;
    }
  }
}

async function storedEvent(matchId: string, eventId: string) {
  const synced = await readSyncedMatchEvents(matchId);
  const cached = await readCachedResponse<MatchLogEvent[]>(`events:${matchId}`);
  return (
    synced.find((event) => event.id === eventId) ??
    cached?.find((event) => event.id === eventId) ??
    null
  );
}

export async function updateMatchLogEvent(
  matchId: string,
  eventId: string,
  input: UpdateMatchLogEventInput,
) {
  const operation = {
    kind: "operation" as const,
    id: crypto.randomUUID(),
    matchId,
    operationType: "correct" as const,
    canonicalEventId: eventId,
    replacement: input,
    causalParentIds: [],
  };
  await enqueueOperation(operation);
  const previous = await storedEvent(matchId, eventId);
  if (navigator.onLine) await flushOfflineMatchEvents();
  if (!previous) throw new Error("The event is unavailable offline.");
  return {
    ...previous,
    ...input,
    pending: true,
    syncStatus: "queued" as const,
    updatedAt: new Date().toISOString(),
  };
}

export async function deleteMatchLogEvent(matchId: string, eventId: string) {
  const operation = {
    kind: "operation" as const,
    id: crypto.randomUUID(),
    matchId,
    operationType: "void" as const,
    canonicalEventId: eventId,
    reason: "Removed from the match timeline",
    causalParentIds: [],
  };
  await enqueueOperation(operation);
  if (navigator.onLine) await flushOfflineMatchEvents();
  return storedEvent(matchId, eventId);
}

export function finishMatch(matchId: string) {
  return apiFetch<MatchRecord>(`/matches/${matchId}/finish`, {
    method: "POST",
  });
}

export function updateMatchClock(matchId: string, input: UpdateMatchClockInput) {
  return apiFetch<MatchRecord>(`/matches/${matchId}/clock`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function finaliseMatchProjection(matchId: string, expectedRevision: number) {
  return apiFetch(`/matches/${matchId}/finalise`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision }),
  });
}

export function reopenMatchProjection(matchId: string, reason: string) {
  return apiFetch(`/matches/${matchId}/reopen`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

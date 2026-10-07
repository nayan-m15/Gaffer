import { apiFetch } from "@/lib/api";
import type {
  CreateMatchLogEventInput,
  MatchInsight,
  MatchLogEvent,
  MatchRecord,
  MatchSquadAthlete,
  OpponentMatchPlayer,
  UpdateMatchLogEventInput,
  UpdateMatchClockInput,
} from "./types";
import { ApiError } from "@/lib/api";
import {
  readSyncedSessionReport,
  cacheResponse,
  completeQueuedEvent,
  enqueueEvent,
  enqueueOperation,
  getOfflineDeviceId,
  hasSyncedPreparedMatch,
  listQueuedEvents,
  queuedEventAsTimelineRow,
  readCachedResponse,
  readSyncedMatchSquad,
  readSyncedOpponentSquad,
  readSyncedPreparedMatch,
  readSyncedMatchEvents,
  readSyncedObservationMemberships,
  readSyncedMatchProjection,
  readSyncedSessionClockOperation,
  rejectQueuedEvent,
  setQueuedItemOutcome,
  setQueuedEventState,
  type SyncedMatchReview,
} from "@/offline/match-store";

export async function fetchMatch(matchId: string) {
  try {
    const match = await apiFetch<MatchRecord>(`/matches/${matchId}`, {
      cache: "no-store",
    });
    const withClock = await applySyncedSessionClock(matchId, match);
    await cacheResponse(`match:${matchId}`, withClock);
    return withClock;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const match =
      (await readSyncedPreparedMatch(matchId)) ??
      (await readCachedResponse<MatchRecord>(`match:${matchId}`));
    if (!match) throw error;
    const projection = await readSyncedMatchProjection(matchId);
    const withProjection = projection
      ? {
          ...match,
          teamScore: projection.provisionalTeamScore,
          opponentScore: projection.provisionalOpponentScore,
          projection,
        }
      : match;
    return applySyncedSessionClock(matchId, withProjection);
  }
}

async function applySyncedSessionClock(
  matchId: string,
  match: MatchRecord,
): Promise<MatchRecord> {
  try {
    const clock = await readSyncedSessionClockOperation(matchId);
    if (!clock || clock.applied_revision <= match.clockRevision) return match;
    return {
      ...match,
      clockPeriod: clock.period,
      clockElapsedMs: clock.elapsed_ms,
      clockStartedAt: clock.running ? clock.created_at : null,
      clockRevision: clock.applied_revision,
    };
  } catch {
    // Keep the API/cache result usable if the local PowerSync database is
    // unavailable; shared clock data is an offline enhancement.
    return match;
  }
}

export async function fetchMatchSquad(matchId: string) {
  try {
    const squad = await apiFetch<MatchSquadAthlete[]>(
      `/matches/${matchId}/squad`,
    );
    await cacheResponse(`squad:${matchId}`, squad);
    return squad;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const synced = await readSyncedMatchSquad(matchId);
    if (synced.length > 0 || (await hasSyncedPreparedMatch(matchId))) {
      return synced;
    }
    const cached = await readCachedResponse<MatchSquadAthlete[]>(
      `squad:${matchId}`,
    );
    if (cached) return cached;
    throw error;
  }
}

export async function fetchMatchOpponentSquad(matchId: string) {
  try {
    const squad = await apiFetch<OpponentMatchPlayer[]>(
      `/matches/${matchId}/opponent-squad`,
    );
    await cacheResponse(`opponent-squad:${matchId}`, squad);
    return squad;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const synced = await readSyncedOpponentSquad(matchId);
    if (synced.length > 0 || (await hasSyncedPreparedMatch(matchId))) {
      return synced;
    }
    const cached = await readCachedResponse<OpponentMatchPlayer[]>(
      `opponent-squad:${matchId}`,
    );
    if (cached) return cached;
    throw error;
  }
}

export function fetchMatchInsight(matchId: string) {
  return apiFetch<MatchInsight>(`/matches/${matchId}/insight`);
}

export async function fetchMatchEvents(matchId: string) {
  let events: MatchLogEvent[];
  try {
    events = (
      await apiFetch<MatchLogEvent[]>(`/matches/${matchId}/events`)
    ).map((event) => ({ ...event, syncStatus: "reconciled" as const }));
    await cacheResponse(`events:${matchId}`, events);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const synced = await readSyncedMatchEvents(matchId);
    const cached = await readCachedResponse<MatchLogEvent[]>(
      `events:${matchId}`,
    );
    if (synced.length > 0) events = synced;
    else if (cached) events = cached;
    else throw error;
  }
  const syncedEvents = await readSyncedMatchEvents(matchId);
  const eventsById = new Map(events.map((event) => [event.id, event]));
  for (const synced of syncedEvents) {
    const online = eventsById.get(synced.id);
    eventsById.set(
      synced.id,
      online
        ? {
            ...synced,
            ...online,
            team: synced.side ? synced.team : online.team,
            side: synced.side ?? online.side,
            athleteId: online.athleteId ?? synced.athleteId,
            athlete: online.athlete ?? synced.athlete,
            opponentPlayerId:
              online.opponentPlayerId ?? synced.opponentPlayerId,
            opponentPlayer: online.opponentPlayer ?? synced.opponentPlayer,
          }
        : synced,
    );
  }
  events = [...eventsById.values()].sort(
    (left, right) =>
      right.minute - left.minute ||
      right.createdAt.localeCompare(left.createdAt),
  );
  const allQueued = await listQueuedEvents(matchId);
  const memberships = await readSyncedObservationMemberships(matchId);
  const canonicalIds = new Set(events.map((event) => event.id));
  const observationIds = new Set(
    events.map((event) => event.clientRequestId).filter(Boolean),
  );
  for (const row of allQueued) {
    if (
      row.state === "accepted" &&
      ((row.canonical_event_id && canonicalIds.has(row.canonical_event_id)) ||
        memberships.has(row.id) ||
        observationIds.has(row.id))
    ) {
      await completeQueuedEvent(row.id);
    }
  }
  const queued = (await listQueuedEvents(matchId))
    .filter((row) => (row.kind ?? "observation") === "observation")
    .map(queuedEventAsTimelineRow);
  const queuedIds = new Set(queued.map((event) => event.clientRequestId));
  return [
    ...queued,
    ...events.filter((event) => !queuedIds.has(event.clientRequestId)),
  ];
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

type ReviewDecisionOperation = {
  id: string;
  matchId: string;
  reviewId: string;
  resolution: "same_event" | "separate_events";
  explanation?: string;
  causalParentIds: string[];
};

export async function uploadReviewDecision(operation: ReviewDecisionOperation) {
  try {
    await setQueuedEventState(operation.id, "uploading");
    const review = await apiFetch<Partial<SyncedMatchReview> & { canonicalEventId?: string }>(
      `/matches/${operation.matchId}/event-reviews/${operation.reviewId}/resolve`,
      {
        method: "POST",
        body: JSON.stringify({
          operationId: operation.id,
          resolution: operation.resolution,
          explanation: operation.explanation,
          causalParentIds: operation.causalParentIds,
        }),
      },
    );
    await setQueuedItemOutcome(operation.id, "accepted", review.canonicalEventId);
    return review;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) {
      await rejectQueuedEvent(operation.id, error.message);
    } else {
      await setQueuedItemOutcome(operation.id, "queued", null,
        "Decision saved on this device. Reconnect to retry.");
    }
    throw error;
  }
}

function syncItemForRow(
  row: Awaited<ReturnType<typeof listQueuedEvents>>[number],
) {
  if (row.kind === "operation") return JSON.parse(row.payload) as unknown;
  return {
    kind: "observation",
    matchId: row.match_id,
    payload: JSON.parse(row.payload) as CreateMatchLogEventInput,
  };
}

async function applyReceipt(receipt: SyncReceipt) {
  if (receipt.outcome === "accepted") {
    await setQueuedItemOutcome(
      receipt.id,
      "accepted",
      receipt.canonicalEventId,
    );
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
  options: {
    backgroundUpload?: boolean;
    onUploadSettled?: () => void;
  } = {},
) {
  const enriched = {
    ...input,
    deviceId: input.deviceId ?? getOfflineDeviceId(),
    clientCreatedAt: input.clientCreatedAt ?? new Date().toISOString(),
  };
  await enqueueEvent(matchId, enriched);

  if (options.backgroundUpload) {
    const queued = await queuedTimelineRow(matchId, enriched.clientRequestId);
    if (!queued) throw new Error("The saved event could not be read locally.");
    if (typeof navigator === "undefined" || navigator.onLine) {
      // Return the durable row immediately so live follow-ups can open. Use
      // the ordered queue for uploads so a goal precedes its assist or undo.
      void flushOfflineMatchEvents()
        .then(options.onUploadSettled)
        .catch((error: unknown) => {
          console.warn("Could not finish the background match upload.", error);
        });
    }
    return queued;
  }

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
    const receipt = response.receipts.find((item) => item.id === enriched.clientRequestId);
    if (!receipt) {
      await setQueuedItemOutcome(enriched.clientRequestId, "queued", null, "The server did not acknowledge this item. Retry upload.");
      const queued = await queuedTimelineRow(matchId, enriched.clientRequestId);
      if (queued) return queued;
      throw new Error("The server did not acknowledge the event.");
    }
    await applyReceipt(receipt);
    if (receipt.outcome === "rejected") {
      const rejected = await queuedTimelineRow(
        matchId,
        enriched.clientRequestId,
      );
      if (rejected) return rejected;
      throw new Error(
        receipt.safeErrorCode ?? "The server rejected the event.",
      );
    }
    const queued = await queuedTimelineRow(matchId, enriched.clientRequestId);
    if (!queued)
      throw new Error("The accepted event could not be read locally.");
    return queued;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await setQueuedItemOutcome(enriched.clientRequestId, "queued", null, "Sign in again to upload this item.");
      throw error;
    }
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 401
    ) {
      await rejectQueuedEvent(enriched.clientRequestId, error.message);
      throw error;
    }
    await setQueuedEventState(enriched.clientRequestId, "queued");
    const queued = await queuedTimelineRow(matchId, enriched.clientRequestId);
    if (!queued) throw error;
    return queued;
  }
}

async function uploadQueuedBatch(
  batch: Awaited<ReturnType<typeof listQueuedEvents>>,
) {
  // Review votes use their dedicated endpoint and must not depend on the
  // offline observation rollout gate. Keep causal queue order on replay.
  const hasReviewDecision = batch.some((row) => row.kind === "operation" &&
    JSON.parse(row.payload).operationType === "resolve_review");
  if (hasReviewDecision && batch.length > 1) {
    for (const row of batch) await uploadQueuedBatch([row]);
    return;
  }
  if (hasReviewDecision) {
    try {
      await uploadReviewDecision(JSON.parse(batch[0].payload) as ReviewDecisionOperation);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 401 || error.status >= 500) throw error;
    }
    return;
  }
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
      else await setQueuedItemOutcome(row.id, "queued", row.canonical_event_id, "The server did not acknowledge this item. Retry upload.");
    }
  } catch (error) {
    // Upload validation applies to the entire request. Isolate invalid items
    // so an older queued change cannot block unrelated match observations.
    if (error instanceof ApiError && error.status === 400) {
      if (batch.length > 1) {
        const middle = Math.ceil(batch.length / 2);
        await uploadQueuedBatch(batch.slice(0, middle));
        await uploadQueuedBatch(batch.slice(middle));
      } else {
        await rejectQueuedEvent(batch[0].id, error.message);
      }
      return;
    }
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
      return;
    }
    await Promise.all(
      batch.map((row) =>
        setQueuedItemOutcome(
          row.id,
          "queued",
          row.canonical_event_id,
          error instanceof ApiError && error.status === 401
            ? "Sign in again to upload this item."
            : "Upload interrupted. This item is saved and will retry when online.",
        ),
      ),
    );
    throw error;
  }
}

async function flushQueuedMatchEvents() {
  const queued = (await listQueuedEvents()).filter((row) =>
    ["queued", "dependency_pending", "uploading"].includes(row.state),
  );
  for (let offset = 0; offset < queued.length; offset += 50) {
    try {
      await uploadQueuedBatch(queued.slice(offset, offset + 50));
    } catch {
      break;
    }
  }
}

let offlineFlushPromise: Promise<void> | undefined;
let offlineFlushRequested = false;

export function flushOfflineMatchEvents(): Promise<void> {
  offlineFlushRequested = true;
  if (!offlineFlushPromise) {
    offlineFlushPromise = (async () => {
      do {
        offlineFlushRequested = false;
        await flushQueuedMatchEvents();
      } while (offlineFlushRequested);
    })().finally(() => {
      offlineFlushPromise = undefined;
    });
  }
  return offlineFlushPromise;
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
  const queued = (await listQueuedEvents(matchId)).find(row => row.id === operation.id);
  if (queued && ["rejected", "quarantined"].includes(queued.state)) {
    throw new Error(queued.error ?? "The server rejected this deletion.");
  }
  return storedEvent(matchId, eventId);
}

export function finishMatch(matchId: string) {
  return apiFetch<MatchRecord>(`/matches/${matchId}/finish`, {
    method: "POST",
  });
}

export function updateMatchClock(
  matchId: string,
  input: UpdateMatchClockInput,
) {
  return apiFetch<MatchRecord>(`/matches/${matchId}/clock`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function finaliseMatchProjection(
  matchId: string,
  expectedRevision: number,
  expectedSessionRevision?: number,
) {
  const current = await apiFetch<MatchRecord>(`/matches/${matchId}`, {
    cache: "no-store",
  });
  if (!current.projection || current.projection.revision !== expectedRevision) {
    throw new Error("The result changed. Review the updated result and confirm again.");
  }
  return apiFetch(`/matches/${matchId}/finalise`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision, expectedSessionRevision }),
  });
}

export function reopenMatchProjection(matchId: string, reason: string) {
  return apiFetch(`/matches/${matchId}/reopen`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** Shared session DTO, cached once per session; authorization failures never use stale data. */
export async function fetchSessionReport(sessionId: string, matchId: string) {
  const key = `session-report:${sessionId}`;
  try {
    const report = await apiFetch<
      import("./session-report-model").SessionReport
    >(`/matches/sessions/${sessionId}/report`, { cache: "no-store" });
    if (report.sessionId !== sessionId) throw new Error("The shared report belongs to a different session.");
    await cacheResponse(key, report);
    return report;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const cached =
      await readCachedResponse<import("./session-report-model").SessionReport>(
        key,
      );
    if (!cached) throw error;
    return readSyncedSessionReport(sessionId, matchId, cached);
  }
}

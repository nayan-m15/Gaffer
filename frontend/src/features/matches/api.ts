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
  getOfflineDeviceId,
  listQueuedEvents,
  queuedEventAsTimelineRow,
  readCachedResponse,
  readSyncedMatchEvents,
  readSyncedMatchProjection,
  rejectQueuedEvent,
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
    events = await apiFetch<MatchLogEvent[]>(`/matches/${matchId}/events`);
    await cacheResponse(`events:${matchId}`, events);
  } catch (error) {
    const synced = await readSyncedMatchEvents(matchId);
    const cached = await readCachedResponse<MatchLogEvent[]>(`events:${matchId}`);
    if (synced.length > 0) events = synced;
    else if (cached) events = cached;
    else throw error;
  }
  const queued = (await listQueuedEvents(matchId)).map(queuedEventAsTimelineRow);
  const queuedIds = new Set(queued.map((event) => event.clientRequestId));
  return [...queued, ...events.filter((event) => !queuedIds.has(event.clientRequestId))];
}

async function uploadMatchLogEvent(
  matchId: string,
  input: CreateMatchLogEventInput,
) {
  return apiFetch<MatchLogEvent>(`/matches/${matchId}/events`, {
    method: "POST",
    body: JSON.stringify(input),
  });
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
    const created = await uploadMatchLogEvent(matchId, enriched);
    await completeQueuedEvent(enriched.clientRequestId);
    return created;
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
  const queued = await listQueuedEvents();
  for (const row of queued) {
    if (row.state !== "queued") continue;
    try {
      await setQueuedEventState(row.id, "uploading");
      await uploadMatchLogEvent(
        row.match_id,
        JSON.parse(row.payload) as CreateMatchLogEventInput,
      );
      await completeQueuedEvent(row.id);
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) {
        await rejectQueuedEvent(row.id, error.message);
        continue;
      }
      await setQueuedEventState(row.id, "queued");
      break;
    }
  }
}

export function updateMatchLogEvent(
  matchId: string,
  eventId: string,
  input: UpdateMatchLogEventInput,
) {
  return apiFetch<MatchLogEvent>(`/matches/${matchId}/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteMatchLogEvent(matchId: string, eventId: string) {
  return apiFetch<MatchLogEvent>(`/matches/${matchId}/events/${eventId}`, {
    method: "DELETE",
  });
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

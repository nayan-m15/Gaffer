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
  rejectQueuedEvent,
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

export function fetchMatch(matchId: string) {
  return cachedFetch(`match:${matchId}`, () =>
    apiFetch<MatchRecord>(`/matches/${matchId}`),
  );
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
  try {
    const created = await uploadMatchLogEvent(matchId, enriched);
    await completeQueuedEvent(enriched.clientRequestId);
    return created;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) {
      await rejectQueuedEvent(enriched.clientRequestId, error.message);
      throw error;
    }
    const row = (await listQueuedEvents(matchId)).find(
      (item) => item.id === enriched.clientRequestId,
    );
    if (!row) throw error;
    return queuedEventAsTimelineRow(row);
  }
}

export async function flushOfflineMatchEvents() {
  const queued = await listQueuedEvents();
  for (const row of queued) {
    if (row.state !== "queued") continue;
    try {
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

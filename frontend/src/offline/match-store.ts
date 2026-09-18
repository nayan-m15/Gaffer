import type { PowerSyncDatabase } from "@powersync/web";
import type {
  CreateMatchLogEventInput,
  MatchLogEvent,
} from "@/features/matches/types";
import { apiUrl } from "@/lib/api-url";

let databasePromise: Promise<PowerSyncDatabase> | undefined;
let userScope = localStorage.getItem("gaffer-offline-user-scope") ?? "anonymous";

export async function setOfflineUserScope(userId: string | null) {
  const next = userId ?? "anonymous";
  if (next === userScope) return;
  const previous = databasePromise;
  databasePromise = undefined;
  userScope = next;
  if (userId) localStorage.setItem("gaffer-offline-user-scope", userId);
  else localStorage.removeItem("gaffer-offline-user-scope");
  if (previous) {
    const db = await previous;
    await db.disconnect();
    await db.close();
  }
}

async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const { PowerSyncDatabase, Schema, Table, column } = await import(
        "@powersync/web"
      );
      const schema = new Schema({
        offline_event_queue: Table.createLocalOnly({
          match_id: column.text,
          payload: column.text,
          state: column.text,
          error: column.text,
          created_at: column.text,
        }),
        offline_response_cache: Table.createLocalOnly({
          payload: column.text,
          updated_at: column.text,
        }),
        match_events: new Table({
          match_id: column.text,
          athlete_id: column.text,
          team: column.text,
          opponent_label: column.text,
          opponent_player_id: column.text,
          event_type: column.text,
          minute: column.integer,
          detail: column.text,
          logged_by_user_id: column.text,
          manually_adjusted: column.integer,
          client_request_id: column.text,
          period: column.text,
          match_elapsed_ms: column.integer,
          lifecycle_status: column.text,
          created_at: column.text,
          updated_at: column.text,
        }),
        match_event_reviews: new Table({
          match_id: column.text,
          canonical_event_id: column.text,
          reason: column.text,
          status: column.text,
          resolution: column.text,
          created_at: column.text,
          updated_at: column.text,
        }),
      });
      const db = new PowerSyncDatabase({
        schema,
        database: {
          dbFilename: `gaffer-${userScope.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}.db`,
        },
      });
      await db.init();
      if (import.meta.env.VITE_POWERSYNC_URL) {
        await db.connect({
          fetchCredentials: async () => {
            const response = await fetch(apiUrl("/sync/token"), {
              credentials: "include",
            });
            if (response.status === 401) return null;
            if (!response.ok) throw new Error("Could not authenticate PowerSync.");
            const credentials = (await response.json()) as {
              endpoint: string;
              token: string;
              expiresAt: string;
            };
            return {
              endpoint: credentials.endpoint,
              token: credentials.token,
              expiresAt: new Date(credentials.expiresAt),
            };
          },
          uploadData: async (syncDatabase) => {
            // Match capture uses the typed NestJS queue below. Synced tables
            // are server-owned, so an unexpected direct write is discarded.
            const transaction = await syncDatabase.getNextCrudTransaction();
            if (transaction) await transaction.complete();
          },
        });
      }
      return db;
    })();
  }
  return databasePromise;
}

export function getOfflineDeviceId(): string {
  const key = "gaffer-offline-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

export async function enqueueEvent(
  matchId: string,
  input: CreateMatchLogEventInput,
) {
  const db = await database();
  await db.execute(
    `INSERT OR REPLACE INTO offline_event_queue
      (id, match_id, payload, state, error, created_at)
     VALUES (?, ?, ?, 'queued', NULL, ?)`,
    [input.clientRequestId, matchId, JSON.stringify(input), new Date().toISOString()],
  );
}

export async function completeQueuedEvent(id: string) {
  const db = await database();
  await db.execute("DELETE FROM offline_event_queue WHERE id = ?", [id]);
}

export async function rejectQueuedEvent(id: string, message: string) {
  const db = await database();
  await db.execute(
    "UPDATE offline_event_queue SET state = 'rejected', error = ? WHERE id = ?",
    [message, id],
  );
}

export interface QueuedEventRow {
  id: string;
  match_id: string;
  payload: string;
  state: "queued" | "rejected";
  error: string | null;
  created_at: string;
}

export async function listQueuedEvents(matchId?: string) {
  const db = await database();
  return db.getAll<QueuedEventRow>(
    matchId
      ? "SELECT * FROM offline_event_queue WHERE match_id = ? ORDER BY created_at"
      : "SELECT * FROM offline_event_queue ORDER BY created_at",
    matchId ? [matchId] : [],
  );
}

export async function cacheResponse(key: string, value: unknown) {
  const db = await database();
  await db.execute(
    `INSERT OR REPLACE INTO offline_response_cache (id, payload, updated_at)
     VALUES (?, ?, ?)`,
    [key, JSON.stringify(value), new Date().toISOString()],
  );
}

export async function readCachedResponse<T>(key: string): Promise<T | null> {
  const db = await database();
  const row = await db.getOptional<{ payload: string }>(
    "SELECT payload FROM offline_response_cache WHERE id = ?",
    [key],
  );
  return row ? (JSON.parse(row.payload) as T) : null;
}

export function queuedEventAsTimelineRow(row: QueuedEventRow): MatchLogEvent {
  const input = JSON.parse(row.payload) as CreateMatchLogEventInput;
  const now = row.created_at;
  return {
    id: input.clientRequestId,
    matchId: row.match_id,
    athleteId: input.athleteId ?? null,
    team: input.team,
    opponentLabel: input.opponentLabel ?? null,
    opponentPlayerId: input.opponentPlayerId ?? null,
    eventType: input.eventType,
    minute: input.minute,
    detail: input.detail ?? null,
    loggedByUserId: "",
    manuallyAdjusted: false,
    clientRequestId: input.clientRequestId,
    period: input.period,
    matchElapsedMs: input.matchElapsedMs ?? input.minute * 60_000,
    createdAt: now,
    updatedAt: now,
    athlete: null,
    opponentPlayer: null,
    pending: row.state === "queued",
    syncStatus: row.state,
    syncError: row.error,
  };
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

interface SyncedEventRow {
  id: string;
  match_id: string;
  athlete_id: string | null;
  team: MatchLogEvent["team"];
  opponent_label: string | null;
  opponent_player_id: string | null;
  event_type: MatchLogEvent["eventType"];
  minute: number;
  detail: string | null;
  logged_by_user_id: string;
  manually_adjusted: number;
  client_request_id: string | null;
  period: MatchLogEvent["period"];
  match_elapsed_ms: number | null;
  lifecycle_status: MatchLogEvent["lifecycleStatus"];
  created_at: string;
  updated_at: string;
}

export async function readSyncedMatchEvents(matchId: string): Promise<MatchLogEvent[]> {
  const db = await database();
  const rows = await db.getAll<SyncedEventRow>(
    "SELECT * FROM match_events WHERE match_id = ? ORDER BY minute DESC, created_at DESC",
    [matchId],
  );
  return rows.map((row) => ({
    id: row.id,
    matchId: row.match_id,
    athleteId: row.athlete_id,
    team: row.team,
    opponentLabel: row.opponent_label,
    opponentPlayerId: row.opponent_player_id,
    eventType: row.event_type,
    minute: row.minute,
    detail: row.detail,
    loggedByUserId: row.logged_by_user_id,
    manuallyAdjusted: Boolean(row.manually_adjusted),
    clientRequestId: row.client_request_id,
    period: row.period,
    matchElapsedMs: row.match_elapsed_ms,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    athlete: null,
    opponentPlayer: null,
    syncStatus: "synced",
  }));
}

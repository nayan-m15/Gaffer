import type { PowerSyncDatabase } from "@powersync/web";
import type {
  CreateMatchLogEventInput,
  MatchLogEvent,
} from "@/features/matches/types";
import { apiUrl } from "@/lib/api-url";

let databasePromise: Promise<PowerSyncDatabase> | undefined;
let userScope =
  localStorage.getItem("gaffer-offline-user-scope") ?? "anonymous";

const deploymentScope = (
  import.meta.env.VITE_DEPLOYMENT_ENV ||
  window.location.hostname ||
  "local"
)
  .replace(/[^a-zA-Z0-9]/g, "")
  .slice(0, 24);
const queueChannel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel(`gaffer-offline-queue-${deploymentScope}`);

function announceQueueChange() {
  queueChannel?.postMessage({ userScope, changedAt: Date.now() });
}

function assertStorageWritable() {
  if (localStorage.getItem("gaffer-simulate-storage-full") === "1") {
    throw new DOMException("Offline storage is full.", "QuotaExceededError");
  }
}

export function subscribeToOfflineQueueChanges(onChange: () => void) {
  if (!queueChannel) return () => undefined;
  const listener = (event: MessageEvent<{ userScope?: string }>) => {
    if (event.data.userScope === userScope) onChange();
  };
  queueChannel.addEventListener("message", listener);
  return () => queueChannel.removeEventListener("message", listener);
}

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
      const { PowerSyncDatabase, Schema, Table, column } =
        await import("@powersync/web");
      const schema = new Schema({
        offline_event_queue: Table.createLocalOnly({
          match_id: column.text,
          kind: column.text,
          payload: column.text,
          state: column.text,
          error: column.text,
          canonical_event_id: column.text,
          created_at: column.text,
        }),
        offline_response_cache: Table.createLocalOnly({
          payload: column.text,
          updated_at: column.text,
        }),
        offline_clock_anchors: Table.createLocalOnly({
          period: column.text,
          elapsed_ms: column.integer,
          running: column.integer,
          authority_revision: column.text,
          wall_clock_ms: column.integer,
          uncertain: column.integer,
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
          structured_payload: column.text,
          lifecycle_status: column.text,
          rules_version: column.integer,
          projection_revision: column.integer,
          created_at: column.text,
          updated_at: column.text,
        }),
        match_event_reviews: new Table({
          match_id: column.text,
          canonical_event_id: column.text,
          reason: column.text,
          status: column.text,
          resolution: column.text,
          resolved_by_user_id: column.text,
          resolved_at: column.text,
          created_at: column.text,
          updated_at: column.text,
        }),
        match_projection_state: new Table({
          revision: column.integer,
          input_digest: column.text,
          rules_version: column.integer,
          confirmed_team_score: column.integer,
          confirmed_opponent_score: column.integer,
          provisional_team_score: column.integer,
          provisional_opponent_score: column.integer,
          possible_effects: column.text,
          disciplinary_projection: column.text,
          unresolved_review_count: column.integer,
          finalisation_state: column.text,
          finalised_by_user_id: column.text,
          finalised_at: column.text,
          created_at: column.text,
          updated_at: column.text,
        }),
      });
      const db = new PowerSyncDatabase({
        schema,
        database: {
          dbFilename: `gaffer-${deploymentScope}-${userScope.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}.db`,
        },
      });
      await db.init();
      const safeUserScope = userScope.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
      const migrationKey = `gaffer-offline-migrated-${deploymentScope}-${safeUserScope}`;
      if (safeUserScope && !localStorage.getItem(migrationKey)) {
        const legacy = new PowerSyncDatabase({
          schema,
          database: { dbFilename: `gaffer-${safeUserScope}.db` },
        });
        try {
          await legacy.init();
          const [queued, cached, clocks] = await Promise.all([
            legacy.getAll<QueuedEventRow>("SELECT * FROM offline_event_queue"),
            legacy.getAll<{
              id: string;
              payload: string;
              updated_at: string;
            }>("SELECT * FROM offline_response_cache"),
            legacy.getAll<{
              id: string;
              period: string;
              elapsed_ms: number;
              running: number;
              authority_revision: string;
              wall_clock_ms: number;
              uncertain: number;
              updated_at: string;
            }>("SELECT * FROM offline_clock_anchors"),
          ]);
          await db.writeTransaction(async (tx) => {
            for (const row of queued) {
              await tx.execute(
                `INSERT OR IGNORE INTO offline_event_queue
                  (id, match_id, kind, payload, state, error, canonical_event_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  row.id,
                  row.match_id,
                  row.kind ?? "observation",
                  row.payload,
                  row.state,
                  row.error,
                  row.canonical_event_id,
                  row.created_at,
                ],
              );
            }
            for (const row of cached) {
              await tx.execute(
                `INSERT OR IGNORE INTO offline_response_cache
                  (id, payload, updated_at) VALUES (?, ?, ?)`,
                [row.id, row.payload, row.updated_at],
              );
            }
            for (const row of clocks) {
              await tx.execute(
                `INSERT OR IGNORE INTO offline_clock_anchors
                  (id, period, elapsed_ms, running, authority_revision, wall_clock_ms, uncertain, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  row.id,
                  row.period,
                  row.elapsed_ms,
                  row.running,
                  row.authority_revision,
                  row.wall_clock_ms,
                  row.uncertain,
                  row.updated_at,
                ],
              );
            }
          });
          localStorage.setItem(migrationKey, new Date().toISOString());
        } catch (error) {
          console.warn(
            "Could not migrate the legacy offline workspace.",
            error,
          );
        } finally {
          await legacy.close();
        }
      }
      if (import.meta.env.VITE_POWERSYNC_URL) {
        // Local queue access must never wait for the remote sync connection.
        // PowerSync can remain pending while a device is offline; awaiting it
        // here would block enqueueEvent and leave the live logger locked.
        void db
          .connect({
            fetchCredentials: async () => {
              const response = await fetch(apiUrl("/sync/token"), {
                credentials: "include",
              });
              if (response.status === 401) return null;
              if (!response.ok)
                throw new Error("Could not authenticate PowerSync.");
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
          })
          .catch((error: unknown) => {
            console.warn(
              "PowerSync connection is unavailable; using local storage.",
              error,
            );
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
  assertStorageWritable();
  const db = await database();
  await db.execute(
    `INSERT OR REPLACE INTO offline_event_queue
      (id, match_id, kind, payload, state, error, canonical_event_id, created_at)
     VALUES (?, ?, 'observation', ?, 'queued', NULL, NULL, ?)`,
    [
      input.clientRequestId,
      matchId,
      JSON.stringify(input),
      new Date().toISOString(),
    ],
  );
  announceQueueChange();
}

export interface OfflineOperationInput {
  kind: "operation";
  id: string;
  matchId: string;
  operationType: "correct" | "void" | "resolve_review";
  canonicalEventId?: string;
  replacement?: import("@/features/matches/types").UpdateMatchLogEventInput;
  reason?: string;
  reviewId?: string;
  resolution?: "same_event" | "separate_events";
  causalParentIds: string[];
}

export async function enqueueOperation(input: OfflineOperationInput) {
  assertStorageWritable();
  const db = await database();
  await db.execute(
    `INSERT OR REPLACE INTO offline_event_queue
      (id, match_id, kind, payload, state, error, canonical_event_id, created_at)
     VALUES (?, ?, 'operation', ?, 'queued', NULL, ?, ?)`,
    [
      input.id,
      input.matchId,
      JSON.stringify(input),
      input.canonicalEventId ?? null,
      new Date().toISOString(),
    ],
  );
  announceQueueChange();
}

export async function completeQueuedEvent(id: string) {
  const db = await database();
  await db.execute("DELETE FROM offline_event_queue WHERE id = ?", [id]);
  announceQueueChange();
}

export async function setQueuedEventState(
  id: string,
  state: "queued" | "uploading",
) {
  const db = await database();
  await db.execute(
    "UPDATE offline_event_queue SET state = ?, error = NULL WHERE id = ?",
    [state, id],
  );
  announceQueueChange();
}

export async function rejectQueuedEvent(id: string, message: string) {
  const db = await database();
  await db.execute(
    "UPDATE offline_event_queue SET state = 'rejected', error = ? WHERE id = ?",
    [message, id],
  );
  announceQueueChange();
}

export async function setQueuedItemOutcome(
  id: string,
  outcome: "accepted" | "dependency_pending" | "quarantined",
  canonicalEventId?: string | null,
  message?: string | null,
) {
  const db = await database();
  await db.execute(
    `UPDATE offline_event_queue
       SET state = ?, canonical_event_id = ?, error = ?
     WHERE id = ?`,
    [outcome, canonicalEventId ?? null, message ?? null, id],
  );
  announceQueueChange();
}

export async function discardQueuedItems() {
  const db = await database();
  await db.execute("DELETE FROM offline_event_queue");
  announceQueueChange();
}

export interface QueuedEventRow {
  id: string;
  match_id: string;
  kind: "observation" | "operation" | null;
  payload: string;
  state:
    | "queued"
    | "uploading"
    | "accepted"
    | "dependency_pending"
    | "quarantined"
    | "rejected";
  error: string | null;
  canonical_event_id: string | null;
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

export interface OfflineClockAnchor {
  period: import("@/features/matches/types").MatchClockPeriod;
  elapsedMs: number;
  running: boolean;
  authorityRevision: string;
  wallClockMs: number;
  uncertain: boolean;
  updatedAt: string;
}

function pendingClockKey(matchId: string) {
  return `gaffer-pending-clock-${deploymentScope}-${userScope}-${matchId}`;
}

export async function saveClockAnchor(
  matchId: string,
  anchor: Omit<OfflineClockAnchor, "wallClockMs" | "uncertain" | "updatedAt">,
) {
  const db = await database();
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();
  await db.execute(
    `INSERT OR REPLACE INTO offline_clock_anchors
      (id, period, elapsed_ms, running, authority_revision, wall_clock_ms, uncertain, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      matchId,
      anchor.period,
      anchor.elapsedMs,
      anchor.running ? 1 : 0,
      anchor.authorityRevision,
      now,
      updatedAt,
    ],
  );
  localStorage.setItem(pendingClockKey(matchId), updatedAt);
  return updatedAt;
}

export function isClockAnchorPending(matchId: string) {
  return localStorage.getItem(pendingClockKey(matchId)) !== null;
}

export function markClockAnchorSynced(matchId: string, version: string) {
  if (localStorage.getItem(pendingClockKey(matchId)) === version) {
    localStorage.removeItem(pendingClockKey(matchId));
  }
}

export async function readClockAnchor(
  matchId: string,
): Promise<OfflineClockAnchor | null> {
  const db = await database();
  const row = await db.getOptional<{
    period: OfflineClockAnchor["period"];
    elapsed_ms: number;
    running: number;
    authority_revision: string;
    wall_clock_ms: number;
    uncertain: number;
    updated_at: string;
  }>("SELECT * FROM offline_clock_anchors WHERE id = ?", [matchId]);
  if (!row) return null;
  const wallDelta = Date.now() - row.wall_clock_ms;
  const uncertain =
    Boolean(row.uncertain) || wallDelta < 0 || wallDelta > 6 * 60 * 60 * 1000;
  return {
    period: row.period,
    elapsedMs: row.elapsed_ms + (row.running && !uncertain ? wallDelta : 0),
    running: Boolean(row.running) && !uncertain,
    authorityRevision: row.authority_revision,
    wallClockMs: row.wall_clock_ms,
    uncertain,
    updatedAt: row.updated_at,
  };
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
    pending: !["accepted"].includes(row.state),
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

export async function readSyncedMatchEvents(
  matchId: string,
): Promise<MatchLogEvent[]> {
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
    syncStatus: "reconciled",
  }));
}

export interface OfflineReadiness {
  matchCached: boolean;
  squadCached: boolean;
  eventsCached: boolean;
  appShellCached: boolean;
  localDatabaseWritable: boolean;
  persistentStorage: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function checkOfflineReadiness(
  matchId: string,
): Promise<OfflineReadiness> {
  const db = await database();
  const probeId = `readiness:${crypto.randomUUID()}`;
  let localDatabaseWritable = false;
  try {
    await db.execute(
      `INSERT INTO offline_response_cache (id, payload, updated_at)
       VALUES (?, ?, ?)`,
      [probeId, JSON.stringify({ ok: true }), new Date().toISOString()],
    );
    const probe = await db.getOptional<{ payload: string }>(
      "SELECT payload FROM offline_response_cache WHERE id = ?",
      [probeId],
    );
    localDatabaseWritable = probe?.payload === JSON.stringify({ ok: true });
  } finally {
    await db.execute("DELETE FROM offline_response_cache WHERE id = ?", [
      probeId,
    ]);
  }
  const [match, squad, events, registration, persisted, estimate] =
    await Promise.all([
      readCachedResponse(`match:${matchId}`),
      readCachedResponse(`squad:${matchId}`),
      readCachedResponse(`events:${matchId}`),
      navigator.serviceWorker?.getRegistration(),
      navigator.storage?.persisted?.() ?? Promise.resolve(false),
      navigator.storage?.estimate?.() ?? Promise.resolve({}),
    ]);
  return {
    matchCached: match !== null,
    squadCached: squad !== null,
    eventsCached: events !== null,
    appShellCached: Boolean(registration?.active),
    localDatabaseWritable,
    persistentStorage: persisted,
    usageBytes: estimate.usage ?? null,
    quotaBytes: estimate.quota ?? null,
  };
}

export async function exportUnsentObservations() {
  const rows = await listQueuedEvents();
  return {
    format: "gaffer-offline-observations",
    version: 1,
    exportedAt: new Date().toISOString(),
    userScope,
    items: rows.map((row) => ({
      id: row.id,
      matchId: row.match_id,
      kind: row.kind ?? "observation",
      state: row.state,
      error: row.error,
      createdAt: row.created_at,
      payload: JSON.parse(row.payload) as CreateMatchLogEventInput,
    })),
  };
}

export async function importUnsentObservations(raw: string) {
  assertStorageWritable();
  const parsed = JSON.parse(raw) as {
    format?: string;
    version?: number;
    userScope?: string;
    items?: Array<{
      id?: string;
      matchId?: string;
      kind?: "observation" | "operation";
      payload?: unknown;
      createdAt?: string;
    }>;
    observations?: Array<{
      id?: string;
      matchId?: string;
      payload?: unknown;
      createdAt?: string;
    }>;
  };
  if (
    parsed.format !== "gaffer-offline-observations" ||
    parsed.version !== 1 ||
    parsed.userScope !== userScope
  ) {
    throw new Error("This export belongs to a different account or format.");
  }
  const items: Array<{
    id?: string;
    matchId?: string;
    kind?: "observation" | "operation";
    payload?: unknown;
    createdAt?: string;
  }> = parsed.items ?? parsed.observations ?? [];
  const db = await database();
  let imported = 0;
  await db.writeTransaction(async (tx) => {
    for (const item of items) {
      if (
        typeof item.id !== "string" ||
        typeof item.matchId !== "string" ||
        !item.payload ||
        typeof item.payload !== "object"
      ) {
        throw new Error("The export contains an invalid queued item.");
      }
      const kind = item.kind ?? "observation";
      const payload = JSON.stringify(item.payload);
      const existing = await tx.getOptional<{ payload: string }>(
        "SELECT payload FROM offline_event_queue WHERE id = ?",
        [item.id],
      );
      if (existing && existing.payload !== payload) {
        throw new Error(
          `Queued item ${item.id} already exists with different data.`,
        );
      }
      if (!existing) {
        await tx.execute(
          `INSERT INTO offline_event_queue
            (id, match_id, kind, payload, state, error, canonical_event_id, created_at)
           VALUES (?, ?, ?, ?, 'queued', NULL, NULL, ?)`,
          [
            item.id,
            item.matchId,
            kind,
            payload,
            item.createdAt ?? new Date().toISOString(),
          ],
        );
        imported += 1;
      }
    }
  });
  announceQueueChange();
  return imported;
}

export async function subscribeToSyncedMatchEventChanges(
  onChange: () => void,
): Promise<() => void> {
  const db = await database();
  return db.onChange(
    { onChange },
    { tables: ["match_events", "match_projection_state"] },
  );
}

export async function readSyncedMatchProjection(
  matchId: string,
): Promise<
  import("@/features/matches/types").MatchRecord["projection"] | null
> {
  const db = await database();
  const row = await db.getOptional<{
    revision: number;
    confirmed_team_score: number;
    confirmed_opponent_score: number;
    provisional_team_score: number;
    provisional_opponent_score: number;
    possible_effects: string | Record<string, unknown>;
    unresolved_review_count: number;
    finalisation_state: "open" | "finalised" | "amendment_required";
  }>("SELECT * FROM match_projection_state WHERE id = ?", [matchId]);
  if (!row) return null;
  return {
    revision: row.revision,
    confirmedTeamScore: row.confirmed_team_score,
    confirmedOpponentScore: row.confirmed_opponent_score,
    provisionalTeamScore: row.provisional_team_score,
    provisionalOpponentScore: row.provisional_opponent_score,
    possibleEffects:
      typeof row.possible_effects === "string"
        ? JSON.parse(row.possible_effects)
        : row.possible_effects,
    unresolvedReviewCount: row.unresolved_review_count,
    finalisationState: row.finalisation_state,
  };
}

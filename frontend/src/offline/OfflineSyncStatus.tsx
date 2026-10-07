import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { flushOfflineMatchEvents } from "@/features/matches/api";
import { apiFetch } from "@/lib/api";
import {
  getOfflineDeviceId,
  getPeerSyncStatus,
  listQueuedEvents,
  subscribeToOfflineQueueChanges,
} from "./match-store";

const PENDING_STATES = ["queued", "uploading", "dependency_pending"];

function getSyncLabel(input: {
  quarantined: number;
  rejected: number;
  syncing: boolean;
  pending: number;
  accepted: number;
  online: boolean;
}) {
  if (input.quarantined) return `${input.quarantined} access blocked`;
  if (input.rejected) return `${input.rejected} rejected`;
  if (input.syncing) return `Uploading ${input.pending}`;
  if (input.pending) return `${input.pending} waiting`;
  if (input.accepted) return `${input.accepted} accepted`;
  return input.online ? "No pending uploads" : "Offline";
}

function getSyncIndicatorClass(hasIssue: boolean, online: boolean) {
  if (hasIssue) return "bg-danger";
  return online ? "bg-success" : "bg-warning";
}

export function OfflineSyncStatus({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [accepted, setAccepted] = useState(0);
  const [quarantined, setQuarantined] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [peerSync, setPeerSync] = useState<
    Awaited<ReturnType<typeof getPeerSyncStatus>>
  >("connecting");
  const telemetrySentAt = useRef(0);
  const [lastSync, setLastSync] = useState<string | null>(() =>
    localStorage.getItem("gaffer-last-successful-sync"),
  );

  useEffect(() => {
    let active = true;
    let uploadInProgress = false;
    const refresh = async () => {
      const [rows, peerStatus] = await Promise.all([
        listQueuedEvents(matchId),
        getPeerSyncStatus().catch(() => "unavailable" as const),
      ]);
      if (!active) return;
      setPeerSync(peerStatus);
      const pendingRows = rows.filter((row) =>
        PENDING_STATES.includes(row.state),
      );
      setPending(
        pendingRows.length,
      );
      setRejected(rows.filter((row) => row.state === "rejected").length);
      setAccepted(rows.filter((row) => row.state === "accepted").length);
      setQuarantined(rows.filter((row) => row.state === "quarantined").length);
      if (navigator.onLine && Date.now() - telemetrySentAt.current >= 60_000) {
        telemetrySentAt.current = Date.now();
        const telemetryRows = await listQueuedEvents();
        const telemetryPending = telemetryRows.filter((row) =>
          PENDING_STATES.includes(row.state),
        );
        void apiFetch("/sync/telemetry", {
          method: "POST",
          body: JSON.stringify({
            deviceId: getOfflineDeviceId(),
            pendingCount: telemetryPending.length,
            rejectedCount: telemetryRows.filter(
              (row) => row.state === "rejected",
            ).length,
            oldestPendingAt: telemetryPending[0]?.created_at ?? null,
            lastSuccessfulSyncAt: localStorage.getItem(
              "gaffer-last-successful-sync",
            ),
            deployment:
              import.meta.env.VITE_DEPLOYMENT_ENV || window.location.hostname,
          }),
        }).catch(() => {
          telemetrySentAt.current = 0;
        });
      }
    };
    const reconnect = async () => {
      if (!active || !navigator.onLine || uploadInProgress) return;
      uploadInProgress = true;
      setOnline(true);
      setSyncing(true);
      try {
        await flushOfflineMatchEvents();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["matches", matchId, "events"] }),
          queryClient.invalidateQueries({ queryKey: ["matches", matchId] }),
        ]);
        const remaining = await listQueuedEvents(matchId);
        if (
          !remaining.some((row) =>
            PENDING_STATES.includes(row.state),
          )
        ) {
          const syncedAt = new Date().toISOString();
          localStorage.setItem("gaffer-last-successful-sync", syncedAt);
          if (active) setLastSync(syncedAt);
        }
      } finally {
        uploadInProgress = false;
        if (active) setSyncing(false);
        await refresh();
      }
    };
    const disconnect = () => setOnline(false);
    void refresh();
    const unsubscribeQueue = subscribeToOfflineQueueChanges(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 1_000);
    // The first reconnect can race the network becoming usable. Keep retrying
    // pending uploads without requiring another offline/online transition.
    const retryTimer = window.setInterval(() => {
      if (!navigator.onLine || uploadInProgress) return;
      void listQueuedEvents(matchId).then((rows) => {
        if (rows.some((row) => PENDING_STATES.includes(row.state))) {
          void reconnect();
        }
      });
    }, 10_000);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    if (navigator.onLine) void reconnect();
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(retryTimer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
      unsubscribeQueue();
    };
  }, [matchId, queryClient]);

  const uploadLabel = getSyncLabel({ quarantined, rejected, syncing, pending, accepted, online });
  const peerLabel = !online ? "Live updates offline"
    : peerSync === "connected" ? "Live updates connected"
    : peerSync === "connecting" ? "Live updates connecting"
    : peerSync === "disabled" ? "Live updates disabled"
    : "Live updates unavailable";
  const label = `${uploadLabel} · ${peerLabel}`;

  return (
    <span
      role="status"
      title="Upload acceptance and live update connection status"
      aria-label={`${label}${lastSync ? `; last successful sync ${new Date(lastSync).toLocaleString()}` : ""}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-elevated px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground shadow-sm"
    >
      <span
        className={`size-1.5 rounded-full ${getSyncIndicatorClass(
          Boolean(rejected || quarantined || (online && peerSync === "unavailable")),
          online && peerSync === "connected",
        )}`}

      />
      {label}
    </span>
  );
}

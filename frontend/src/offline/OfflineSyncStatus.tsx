import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { flushOfflineMatchEvents } from "@/features/matches/api";
import { apiFetch } from "@/lib/api";
import {
  getOfflineDeviceId,
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
  if (input.syncing) return `Syncing ${input.pending}`;
  if (input.pending) return `${input.pending} waiting`;
  if (input.accepted) return `${input.accepted} accepted`;
  return input.online ? "Synced" : "Offline";
}

function getSyncIndicatorClass(hasIssue: boolean, online: boolean) {
  if (hasIssue) return "bg-[#e36a6d]";
  return online ? "bg-[#16d99a]" : "bg-[#d6a447]";
}

export function OfflineSyncStatus({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [accepted, setAccepted] = useState(0);
  const [quarantined, setQuarantined] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const telemetrySentAt = useRef(0);
  const [lastSync, setLastSync] = useState<string | null>(() =>
    localStorage.getItem("gaffer-last-successful-sync"),
  );

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const rows = await listQueuedEvents(matchId);
      if (!active) return;
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
        if (active) setSyncing(false);
        await refresh();
      }
    };
    const disconnect = () => setOnline(false);
    void refresh();
    const unsubscribeQueue = subscribeToOfflineQueueChanges(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 1_000);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    if (navigator.onLine) void reconnect();
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
      unsubscribeQueue();
    };
  }, [matchId, queryClient]);

  const label = getSyncLabel({ quarantined, rejected, syncing, pending, accepted, online });

  return (
    <span
      role="status"
      title="Offline event synchronisation status"
      aria-label={`${label}${lastSync ? `; last successful sync ${new Date(lastSync).toLocaleString()}` : ""}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#111315] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#c7ccc9]"
    >
      <span
        className={`size-1.5 rounded-full ${getSyncIndicatorClass(
          Boolean(rejected || quarantined),
          online,
        )}`}
      />
      {label}
    </span>
  );
}

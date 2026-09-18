import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { flushOfflineMatchEvents } from "@/features/matches/api";
import { listQueuedEvents } from "./match-store";

export function OfflineSyncStatus({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(() =>
    localStorage.getItem("gaffer-last-successful-sync"),
  );

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const rows = await listQueuedEvents(matchId);
      if (!active) return;
      setPending(rows.filter((row) => row.state !== "rejected").length);
      setRejected(rows.filter((row) => row.state === "rejected").length);
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
        if (!remaining.some((row) => row.state !== "rejected")) {
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
    const timer = window.setInterval(() => void refresh(), 1_000);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    if (navigator.onLine) void reconnect();
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
    };
  }, [matchId, queryClient]);

  const label = rejected
    ? `${rejected} rejected`
    : syncing
      ? `Syncing ${pending}`
      : pending
        ? `${pending} waiting`
        : online
          ? "Synced"
          : "Offline";

  return (
    <span
      role="status"
      title="Offline event synchronisation status"
      aria-label={`${label}${lastSync ? `; last successful sync ${new Date(lastSync).toLocaleString()}` : ""}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#101920] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#c5ced6]"
    >
      <span
        className={`size-1.5 rounded-full ${
          rejected ? "bg-[#ff5b5f]" : online ? "bg-[#00d99a]" : "bg-[#ffbe2e]"
        }`}
      />
      {label}
    </span>
  );
}

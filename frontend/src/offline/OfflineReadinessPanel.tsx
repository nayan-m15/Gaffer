import { useCallback, useEffect, useState } from "react";
import {
  checkOfflineReadiness,
  exportUnsentObservations,
  requestPersistentStorage,
  type OfflineReadiness,
} from "./match-store";

const formatBytes = (value: number | null) =>
  value == null ? "Unavailable" : `${(value / 1024 / 1024).toFixed(1)} MB`;

export function OfflineReadinessPanel({
  matchId,
  onClose,
}: {
  matchId: string;
  onClose: () => void;
}) {
  const [readiness, setReadiness] = useState<OfflineReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setError(null);
    try {
      await requestPersistentStorage();
      setReadiness(await checkOfflineReadiness(matchId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Readiness check failed.");
    }
  }, [matchId]);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  const downloadExport = async () => {
    const data = await exportUnsentObservations();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gaffer-unsent-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const checks = readiness
    ? [
        ["Match downloaded", readiness.matchCached],
        ["Squad downloaded", readiness.squadCached],
        ["Events downloaded", readiness.eventsCached],
        ["App shell cached", readiness.appShellCached],
        ["Local write/read passed", readiness.localDatabaseWritable],
        ["Persistent storage granted", readiness.persistentStorage],
      ] as const
    : [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-[#1c2b36] bg-[#101920] p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-oswald text-xl tracking-wide text-white">Prepare for offline use</h2>
          <button type="button" onClick={onClose} className="text-sm text-[#9fadb8]">Close</button>
        </div>
        <p className="mt-2 text-sm text-[#9fadb8]">
          Run this while online before leaving for the match.
        </p>
        {error ? <p className="mt-3 text-sm text-[#ff7377]">{error}</p> : null}
        <div className="mt-4 space-y-2">
          {readiness ? checks.map(([label, passed]) => (
            <div key={label} className="flex items-center justify-between rounded-lg bg-[#0c1218] px-3 py-2 text-sm">
              <span className="text-[#c5ced6]">{label}</span>
              <span className={passed ? "text-[#00d99a]" : "text-[#ffbe2e]"}>{passed ? "Ready" : "Needs attention"}</span>
            </div>
          )) : <p className="text-sm text-[#9fadb8]">Checking this device…</p>}
        </div>
        {readiness ? (
          <p className="mt-3 text-xs text-[#7f8d98]">
            Storage used: {formatBytes(readiness.usageBytes)} of {formatBytes(readiness.quotaBytes)}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void runCheck()} className="rounded-lg bg-[#00d99a] px-3 py-2 text-sm font-semibold text-[#05130f]">Check again</button>
          <button type="button" onClick={() => void downloadExport()} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white">Export unsent events</button>
        </div>
      </div>
    </div>
  );
}

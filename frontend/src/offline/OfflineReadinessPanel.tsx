import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkOfflineReadiness,
  exportUnsentObservations,
  importUnsentObservations,
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
  const [message, setMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

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

  const importExport = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const count = await importUnsentObservations(await file.text());
      setMessage(`${count} offline item${count === 1 ? "" : "s"} imported.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const checks = readiness
    ? [
        ["Match downloaded", readiness.matchCached, "Needs attention"],
        ["Squad downloaded", readiness.squadCached, "Needs attention"],
        ["Events downloaded", readiness.eventsCached, "Needs attention"],
        [
          "App shell cached",
          readiness.appShellCached,
          import.meta.env.DEV ? "Production PWA only" : "Needs attention",
        ],
        [
          "Local write/read passed",
          readiness.localDatabaseWritable,
          "Needs attention",
        ],
        [
          "Persistent storage granted",
          readiness.persistentStorage,
          "Browser managed",
        ],
      ] as const
    : [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="offline-readiness-title">
      <div className="w-full max-w-md rounded-2xl border border-border-default bg-popover p-5 text-popover-foreground shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 id="offline-readiness-title" className="font-oswald text-xl tracking-wide text-foreground">Prepare for offline use</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Close</button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Run this while online before leaving for the match.
        </p>
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
        {message ? <p role="status" className="mt-3 text-sm text-success">{message}</p> : null}
        <div className="mt-4 space-y-2">
          {readiness ? checks.map(([label, passed, fallback]) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-nested px-3 py-2 text-sm">
              <span className="text-secondary-foreground">{label}</span>
              <span className={passed ? "font-medium text-success" : "font-medium text-warning"}>{passed ? "Ready" : fallback}</span>
            </div>
          )) : <p className="text-sm text-muted-foreground">Checking this device…</p>}
        </div>
        {readiness ? (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>
              Storage used: {formatBytes(readiness.usageBytes)} of {formatBytes(readiness.quotaBytes)}
            </p>
            {!readiness.persistentStorage ? (
              <p>Your browser may still store offline data, but it has not guaranteed protection from automatic cleanup.</p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void runCheck()} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Check again</button>
          <button type="button" onClick={() => void downloadExport()} className="rounded-lg border border-border-default bg-surface-nested px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Export unsent events</button>
          <button type="button" onClick={() => importRef.current?.click()} className="rounded-lg border border-border-default bg-surface-nested px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Import unsent events</button>
          <input ref={importRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importExport(event.target.files?.[0])} />
        </div>
      </div>
    </div>
  );
}

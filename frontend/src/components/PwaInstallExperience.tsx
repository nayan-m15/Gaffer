import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { listQueuedEvents, subscribeToOfflineQueueChanges } from "@/offline/match-store";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PwaInstallExperience() {
  const { pathname } = useLocation();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [installed, setInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
  );

  useEffect(() => {
    const installable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installedEvent = () => { setInstalled(true); setInstallPrompt(null); };
    const onlineEvent = () => setOnline(true);
    const offlineEvent = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", installable);
    window.addEventListener("appinstalled", installedEvent);
    window.addEventListener("online", onlineEvent);
    window.addEventListener("offline", offlineEvent);
    let active = true;
    const refreshQueue = async () => {
      try {
        const rows = await listQueuedEvents();
        if (active) setPendingSync(rows.filter((row) => ["queued", "uploading", "dependency_pending"].includes(row.state)).length);
      } catch { /* Local storage may not be initialized yet. */ }
    };
    void refreshQueue();
    const unsubscribeQueue = subscribeToOfflineQueueChanges(() => void refreshQueue());
    return () => {
      active = false;
      unsubscribeQueue();
      window.removeEventListener("beforeinstallprompt", installable);
      window.removeEventListener("appinstalled", installedEvent);
      window.removeEventListener("online", onlineEvent);
      window.removeEventListener("offline", offlineEvent);
    };
  }, []);

  if (installed && online && !pendingSync) return null;

  return <>
    <div className="fixed bottom-3 right-3 z-[90] flex items-center gap-2">
      {!online || pendingSync ? <span role="status" className="rounded-lg border border-warning/40 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-xl">{!online ? "Offline mode" : `${pendingSync} waiting to sync`}</span> : null}
      {pathname === "/" && !installed ? (installPrompt ? <button type="button" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-xl" onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }}>Install Gaffer</button> : <button type="button" className="rounded-lg border border-border-default bg-popover px-3 py-2 text-sm font-medium text-popover-foreground shadow-xl" onClick={() => setHelpOpen(true)}>Install app</button>) : null}
    </div>
    {helpOpen && pathname === "/" ? <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title"><div className="w-full max-w-sm rounded-2xl border border-border-default bg-popover p-5 text-popover-foreground shadow-2xl"><h2 id="pwa-install-title" className="font-display text-xl">Install Gaffer</h2><p className="mt-3 text-sm text-muted-foreground">On iPhone or iPad, open the Share menu in Safari and choose <strong>Add to Home Screen</strong>. On Android, use your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p><button className="mt-4 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground" onClick={() => setHelpOpen(false)}>Done</button></div></div> : null}
  </>;
}

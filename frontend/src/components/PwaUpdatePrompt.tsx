import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(
    undefined,
  );
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW: (_url, registration) => {
      registrationRef.current = registration;
    },
  });

  useEffect(() => {
    const checkForUpdate = () => void registrationRef.current?.update();
    window.addEventListener("focus", checkForUpdate);
    const interval = window.setInterval(checkForUpdate, 60_000);
    return () => {
      window.removeEventListener("focus", checkForUpdate);
      window.clearInterval(interval);
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-primary/45 bg-popover p-3 text-sm text-popover-foreground shadow-2xl">
      <p>A Gaffer update is ready. Apply it on every match device.</p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setNeedRefresh(false)}
        >
          Later
        </button>
        <button
          type="button"
          disabled={updating}
          className="rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground hover:bg-primary/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-text-disabled"
          onClick={() => {
            setUpdating(true);
            void updateServiceWorker(true);
          }}
        >
          {updating ? "Updating..." : "Update"}
        </button>
      </div>
    </div>
  );
}

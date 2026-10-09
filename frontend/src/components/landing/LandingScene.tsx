import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingSceneController } from "./landing-scene";
import { yieldSceneTask } from "./scene-scheduler";
import { supportsLandingScene } from "./scene-capability";

interface LandingSceneProps {
  onStatusChange: (status: LandingSceneStatus) => void;
}

export type LandingSceneStatus = "loading" | "ready" | "fallback";

export function LandingScene({ onStatusChange }: LandingSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<LandingSceneController | null>(null);
  const statusCallbackRef = useRef(onStatusChange);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    statusCallbackRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      setReady(false);
      statusCallbackRef.current("fallback");
      return;
    }
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduceMotion || saveData || (deviceMemory !== undefined && deviceMemory <= 4) || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)) {
      setReady(false);
      statusCallbackRef.current("fallback");
      return;
    }

    let cancelled = false;
    setReady(false);
    setPaused(false);
    statusCallbackRef.current("loading");
    const abortController = new AbortController();
    let documentVisible = !document.hidden;

    const updateActivity = () => {
      controllerRef.current?.setActive(documentVisible);
    };

    const initialise = async () => {
      try {
        await yieldSceneTask(abortController.signal);
        if (!await supportsLandingScene(abortController.signal)) {
          if (!cancelled) statusCallbackRef.current("fallback");
          return;
        }
        const { createLandingScene } = await import("./landing-scene");
        if (cancelled) return;
        const controller = await createLandingScene({
          container: host,
          signal: abortController.signal,
          onReadyChange: (nextReady) => {
            if (cancelled) return;
            setReady(nextReady);
            statusCallbackRef.current(nextReady ? "ready" : "fallback");
          },
        });
        if (cancelled) { controller.dispose(); return; }
        controllerRef.current = controller;
        updateActivity();
      } catch {
        if (cancelled) return;
        setReady(false);
        statusCallbackRef.current("fallback");
      }
    };

    void initialise();

    const resizeObserver = new ResizeObserver(() => controllerRef.current?.resize());
    resizeObserver.observe(host);

    const themeObserver = new MutationObserver(() => controllerRef.current?.updateTheme());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const handleVisibility = () => {
      documentVisible = !document.hidden;
      updateActivity();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      abortController.abort();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [reduceMotion]);

  const togglePaused = useCallback(() => {
    setPaused((current) => {
      const next = !current;
      controllerRef.current?.setPaused(next);
      return next;
    });
  }, []);

  return (
    <>
      <div
        ref={hostRef}
        aria-hidden="true"
        className="landing-scene"
        data-ready={ready ? "true" : "false"}
      />
      {!reduceMotion && ready && (
        <button
          type="button"
          onClick={togglePaused}
          aria-label={paused ? "Resume background" : "Pause background"}
          aria-pressed={paused}
          className="fixed bottom-5 left-5 z-40 hidden size-10 items-center justify-center rounded-full border border-[var(--landing-scene-border)] bg-black/55 text-[var(--landing-scene-foreground)] shadow-lg backdrop-blur-md transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-scene-accent)] md:flex"
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
      )}
    </>
  );
}

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingSceneController } from "./landing-scene";

interface LandingSceneProps {
  onReadyChange: (ready: boolean) => void;
}

export function LandingScene({ onReadyChange }: LandingSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<LandingSceneController | null>(null);
  const readyCallbackRef = useRef(onReadyChange);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduceMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    readyCallbackRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      setReady(false);
      readyCallbackRef.current(false);
      return;
    }
    if (reduceMotion) {
      setReady(false);
      readyCallbackRef.current(false);
      return;
    }

    let cancelled = false;
    let documentVisible = !document.hidden;
    let idleHandle = 0;
    let timeoutHandle = 0;

    const updateActivity = () => {
      controllerRef.current?.setActive(documentVisible);
    };

    const initialise = async () => {
      try {
        const { createLandingScene } = await import("./landing-scene");
        if (cancelled) return;
        controllerRef.current = createLandingScene({
          container: host,
          onReadyChange: (nextReady) => {
            if (cancelled) return;
            setReady(nextReady);
            readyCallbackRef.current(nextReady);
          },
        });
        updateActivity();
      } catch {
        setReady(false);
        readyCallbackRef.current(false);
      }
    };

    const requestIdle = window.requestIdleCallback;
    if (requestIdle) idleHandle = requestIdle(() => void initialise(), { timeout: 900 });
    else timeoutHandle = window.setTimeout(() => void initialise(), 1);

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
      if (idleHandle) window.cancelIdleCallback(idleHandle);
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
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
          className="fixed bottom-5 right-5 z-40 hidden size-10 items-center justify-center rounded-full border border-[var(--landing-scene-border)] bg-black/55 text-[var(--landing-scene-foreground)] shadow-lg backdrop-blur-md transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-scene-accent)] md:flex"
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
      )}
    </>
  );
}

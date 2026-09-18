import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { LandingSceneController } from "./landing-scene";

interface LandingSceneProps {
  onReadyChange: (ready: boolean) => void;
}

export function LandingScene({ onReadyChange }: LandingSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<LandingSceneController | null>(null);
  const readyCallbackRef = useRef(onReadyChange);
  const pausedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);

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
        controllerRef.current.setPaused(pausedRef.current);
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
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    controllerRef.current?.setPaused(paused);
  }, [paused]);

  return (
    <>
      <div
        ref={hostRef}
        aria-hidden="true"
        className="landing-scene"
        data-ready={ready ? "true" : "false"}
      />
      {ready && (
        <button
          type="button"
          className="landing-scene__motion-control"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          <span>{paused ? "Resume background" : "Pause background"}</span>
        </button>
      )}
    </>
  );
}

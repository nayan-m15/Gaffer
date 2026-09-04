import { useEffect, useRef, useState } from "react";
import { SportLogo } from "@/components/brand/SportLogo";
import { brand } from "@/data/brand";

interface LoadingScreenProps {
  /** When true the screen is ready and the overlay may begin its exit transition. */
  appReady: boolean;
  /** Called after the exit transition completes so the parent can unmount this component. */
  onDone: () => void;
}

/**
 * LoadingScreen — Full-screen branded overlay shown while the app initialises.
 *
 * Behaviour:
 * 1. Renders a fixed overlay above all application content.
 * 2. Enforces a minimum display time (700 ms) to avoid a jarring flash on fast
 *    connections.
 * 3. Starts a smooth fade-out + slight scale transition once `appReady` is true
 *    AND the minimum display time has elapsed.
 * 4. Calls `onDone` after the CSS transition completes so the parent can remove
 *    the component from the React tree.
 *
 * The component uses existing CSS custom properties (--background, --foreground,
 * --brand, --muted-foreground) so it automatically adapts to the active light /
 * dark theme without any additional logic.
 */
export function LoadingScreen({ appReady, onDone }: LoadingScreenProps) {
  const [startFade, setStartFade] = useState(false);
  const minTimeRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Enforce a minimum display time so the loader doesn't flash on fast connections.
    const minTimer = window.setTimeout(() => {
      minTimeRef.current = true;
      if (mountedRef.current && appReady) setStartFade(true);
    }, 700);

    // If the parent already signalled ready (e.g. returning visitor with a
    // cached session), start the fade immediately if the minimum time has
    // already passed, or wait for it.
    if (appReady && minTimeRef.current) {
      setStartFade(true);
    }

    return () => {
      mountedRef.current = false;
      clearTimeout(minTimer);
    };
  }, [appReady]);

  /** Lock body scroll while the overlay is visible. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && e.propertyName === "opacity") {
      onDone();
    }
  };

  return (
    <div
      role="status"
      aria-label="Loading application"
      aria-busy={!startFade}
      className={[
        "loading-overlay",
        startFade ? "loading-overlay--exit" : "",
      ].join(" ")}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="loading-content">
        <SportLogo size={56} className="rounded-lg loading-logo" />
        <span className="loading-brand">{brand.name}</span>
        <div className="loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="sr-only">Loading application</span>
      </div>
    </div>
  );
}

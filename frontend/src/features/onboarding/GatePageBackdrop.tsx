import { cn } from "@/lib/utils";
import type { UnlockPageKey } from "./unlocks";
import "./gate-page-backdrop.css";

const GATED_PAGE_KEYS = new Set<UnlockPageKey>([
  "events",
  "team",
  "injuries",
  "live-logger",
  "statistics",
]);

export function GatePageBackdrop({
  pageKey,
  fading,
  fadeMs,
}: {
  pageKey: UnlockPageKey;
  fading: boolean;
  fadeMs: number;
}) {
  if (!GATED_PAGE_KEYS.has(pageKey)) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-10",
        "transition-opacity ease-out motion-reduce:transition-none",
        fading && "opacity-0",
        fading && "will-change-[opacity]",
      )}
      style={{ transitionDuration: `${fadeMs}ms` }}
    >
      <div className="unlock-gate-page-photo" data-page={pageKey} />
      <div className="unlock-gate-page-dim" />
    </div>
  );
}

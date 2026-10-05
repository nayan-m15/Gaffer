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
  sidebarExpanded,
}: {
  pageKey: UnlockPageKey;
  fading: boolean;
  fadeMs: number;
  sidebarExpanded: boolean;
}) {
  if (!GATED_PAGE_KEYS.has(pageKey)) return null;

  return (
    <div
      aria-hidden="true"
      data-sidebar={sidebarExpanded ? "expanded" : "collapsed"}
      className={cn("unlock-gate-page-bg no-print", fading && "opacity-0 will-change-[opacity]")}
      style={{ transitionDuration: `${fadeMs}ms, 300ms` }}
    >
      <div className="unlock-gate-page-photo" data-page={pageKey} />
      <div className="unlock-gate-page-dim" />
    </div>
  );
}

export function DashboardGateTint({
  fading,
  fadeMs,
  sidebarExpanded,
}: {
  fading: boolean;
  fadeMs: number;
  sidebarExpanded: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      data-sidebar={sidebarExpanded ? "expanded" : "collapsed"}
      className={cn("unlock-gate-page-bg no-print", fading && "opacity-0 will-change-[opacity]")}
      style={{ transitionDuration: `${fadeMs}ms, 300ms` }}
    >
      <div className="unlock-gate-page-dim" />
    </div>
  );
}

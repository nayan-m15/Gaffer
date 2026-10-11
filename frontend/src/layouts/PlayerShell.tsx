import { lazy, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { SportLogo } from "@/components/brand/SportLogo";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/useSidebar";
import { cn } from "@/lib/utils";

const StadiumScene = lazy(() =>
  import("@/components/dashboard/StadiumScene").then((module) => ({
    default: module.StadiumScene,
  })),
);

/**
 * Player-specific app chrome: responsive sidebar (player variant) + main outlet.
 *
 * Mirrors `AppShell` but renders the sidebar with `variant="player"` so
 * only the player nav items (Dashboard / Team / Events / Standings) appear.
 */
export function PlayerShell() {
  return (
    <SidebarProvider>
      <PlayerShellContent />
    </SidebarProvider>
  );
}

function PlayerShellContent() {
  const { expanded } = useSidebar();
  const { pathname } = useLocation();
  const isEventsPage = pathname === "/player/events" || pathname === "/player/events/";
  const showDashboardScene =
    pathname === "/player/dashboard" || pathname === "/player/dashboard/";

  return (
    <div className="app-shell relative isolate flex h-dvh overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_oklab,var(--primary)_5%,transparent),transparent_30%),radial-gradient(circle_at_90%_12%,color-mix(in_oklab,var(--foreground)_3%,transparent),transparent_26%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.022] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:36px_36px]"
        aria-hidden="true"
      />
      {showDashboardScene && (
        <Suspense fallback={null}>
          <StadiumScene />
        </Suspense>
      )}

      <Sidebar variant="player" />

      <main
        className={cn(
          "app-shell-main relative z-10 flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-300 motion-reduce:transition-none",
          isEventsPage ? "overflow-hidden" : "overflow-y-auto",
          expanded ? "lg:pl-72" : "lg:pl-24",
        )}
      >
        <div className="no-print sticky top-0 z-30 flex h-16 shrink-0 items-center justify-center border-b border-border/60 bg-background/75 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <SportLogo size={26} className="rounded-md" />
            <span className="font-display text-sm font-bold tracking-wide text-foreground">
              GAFFER
            </span>
          </div>
        </div>
        <div className={cn("app-shell-content flex-1", isEventsPage && "min-h-0")}>
          <Outlet />
        </div>
        <div className={cn("no-print relative z-20", expanded ? "lg:-ml-1 lg:w-[calc(100%+4px)]" : "lg:-ml-5 lg:w-[calc(100%+20px)]")}>
          <Footer
            variant="player"
            className={isEventsPage ? "mt-0 shrink-0 py-2 sm:py-3" : undefined}
          />
        </div>
      </main>
    </div>
  );
}

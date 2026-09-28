import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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

  return (
    <div className="relative flex h-dvh overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_oklab,var(--primary)_5%,transparent),transparent_30%),radial-gradient(circle_at_90%_12%,color-mix(in_oklab,var(--foreground)_3%,transparent),transparent_26%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.022] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:36px_36px]"
        aria-hidden="true"
      />
      <Sidebar variant="player" />

      <main
        className={cn(
          "relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto transition-[padding] duration-300 motion-reduce:transition-none",
          expanded ? "lg:pl-72" : "lg:pl-24",
        )}
      >
        <div className="flex-1">
          <Outlet />
        </div>
        <div className="relative z-20">
          <Footer variant="player" />
        </div>
      </main>
    </div>
  );
}

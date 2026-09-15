import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";

/**
 * Player-specific app chrome: responsive sidebar (player variant) + main outlet.
 *
 * Mirrors `AppShell` but renders the sidebar with `variant="player"` so
 * only the player nav items (Dashboard / Team / Events / Standings) appear.
 */
export function PlayerShell() {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.add("dark");

    return () => {
      if (!wasDark) {
        root.classList.remove("dark");
      }
    };
  }, []);

  return (
    <div className="relative flex h-dvh overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_32%),radial-gradient(circle_at_90%_12%,color-mix(in_oklab,var(--chart-2)_10%,transparent),transparent_26%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:36px_36px]"
        aria-hidden="true"
      />
      <Sidebar variant="player" />

      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:pl-72">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer variant="player" />
      </main>
    </div>
  );
}

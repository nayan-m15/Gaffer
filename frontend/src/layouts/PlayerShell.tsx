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
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar variant="player" />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto lg:pl-64">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer variant="player" />
      </main>
    </div>
  );
}

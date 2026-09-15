import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { SportLogo } from "@/components/brand/SportLogo";

/**
 * Authenticated app chrome: responsive sidebar + main outlet.
 *
 * Shared by dashboard, roster, and events so navigation is always
 * present after sign-in.
 */
export function AppShell() {
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
      <Sidebar />

      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:pl-72">
      
        <div className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-center border-b border-border/60 bg-background/75 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <SportLogo size={26} className="rounded-md" />
            <span className="font-display text-sm font-bold tracking-wide text-foreground">
              GAFFER
            </span>
          </div>
        </div>
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>
    </div>
  );
}

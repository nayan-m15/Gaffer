import { lazy, Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { SportLogo } from "@/components/brand/SportLogo";

const StadiumScene = lazy(() =>
  import("@/components/dashboard/StadiumScene").then((module) => ({
    default: module.StadiumScene,
  })),
);

/**
 * Authenticated app chrome: responsive sidebar + main outlet.
 *
 * Shared by dashboard, roster, and events so navigation is always
 * present after sign-in.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const showDashboardScene =
    pathname === "/dashboard" || pathname === "/dashboard/";

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
    <div className="relative isolate flex h-dvh overflow-hidden bg-background text-foreground">
      {showDashboardScene && (
        <Suspense fallback={null}>
          <StadiumScene />
        </Suspense>
      )}

      <Sidebar />

      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:pl-64">
      
        <div className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-center border-b border-border bg-background/95 backdrop-blur lg:hidden">
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

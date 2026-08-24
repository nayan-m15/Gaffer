import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";

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
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto lg:pl-64">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>
    </div>
  );
}

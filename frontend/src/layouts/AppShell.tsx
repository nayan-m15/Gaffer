import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";

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

      <main className="min-w-0 flex-1 overflow-y-auto lg:pl-64">
        <Outlet />
      </main>
    </div>
  );
}

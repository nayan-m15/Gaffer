import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BarChart3, CalendarDays, LayoutDashboard, LogOut, Users } from "lucide-react";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { brand } from "@/data/brand";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/athletes", label: "Roster", icon: Users },
  { to: "/events", label: "Events", icon: CalendarDays },
] as const;

/**
 * Authenticated app chrome: dark command-centre sidebar + main outlet.
 *
 * Shared by dashboard, roster, and events so the Events nav item is always
 * present after sign-in.
 */
export function AppShell() {
  const { user, team, signOut } = useAuth();
  const navigate = useNavigate();

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

  const initials = (user?.name ?? "C")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <SportLogo size={28} className="rounded-md" />
          <div className="min-w-0">
            <p className="font-display text-sm font-bold tracking-wide text-foreground">
              {brand.name}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              Coach Command
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}

          <span
            className="relative flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground/50"
            title="Coming in a later sprint"
          >
            <BarChart3 className="size-4 shrink-0" />
            Stats
          </span>
        </nav>

        <div className="border-t border-sidebar-border px-3 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
              {initials || "C"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.name ?? "Coach"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {team?.name ?? "Your team"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void handleSignOut()}
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

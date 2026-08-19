import { useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SportLogo } from "@/components/brand/SportLogo";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import {
  Home,
  Users,
  Calendar,
  BarChart3,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
 *  NAVIGATION CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════ */

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <Home className="size-5" /> },
  { label: "Roster", path: "/athletes", icon: <Users className="size-5" /> },
  {
    label: "Events",
    path: "/events",
    icon: <Calendar className="size-5" />,
  },
  {
    label: "Stats",
    path: "/events",
    icon: <BarChart3 className="size-5" />,
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
 *  SIDEBAR COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const { user, team, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setIsMobileOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  /* ── Sidebar content (shared between desktop and mobile) ─────────────── */
  const sidebarContent = (
    <>
      {/* Brand header */}
      <div className="flex items-center gap-3 border-b border-sidebar-border px-6 py-5">
        <SportLogo size={36} className="rounded-lg" />
        <div>
          <h2 className="font-display text-base font-bold tracking-wide text-sidebar-foreground">
            GAFFER
          </h2>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Coach Command
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.label}
              onClick={() => handleNavigate(item.path)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className="shrink-0" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-4 py-4">
        {/* Coach profile */}
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
            {user?.name?.charAt(0).toUpperCase() ?? "C"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user?.name ?? "Coach"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {team?.name ?? "Your Team"}
            </p>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className="shrink-0" aria-hidden="true">
            {theme === "dark" ? (
              <Sun className="size-5" />
            ) : (
              <Moon className="size-5" />
            )}
          </span>
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>

        {/* Sign out */}
        <button
          onClick={() => void handleSignOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <LogOut className="size-5 shrink-0" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside
        className={cn(
          "hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0",
          "bg-sidebar border-r border-sidebar-border",
          className,
        )}
      >
        {sidebarContent}
      </aside>

      {/* ── Mobile toggle button ──────────────────────────────────────────── */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg border border-border bg-card p-2 shadow-sm lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="size-5 text-foreground" aria-hidden="true" />
      </button>

      {/* ── Mobile sidebar overlay ────────────────────────────────────────── */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Sidebar panel */}
          <aside
            className={cn(
              "fixed inset-y-0 left-0 w-64 flex flex-col",
              "bg-sidebar border-r border-sidebar-border",
            )}
          >
            {/* Close button */}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label="Close navigation menu"
            >
              <X className="size-5" aria-hidden="true" />
            </button>

            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

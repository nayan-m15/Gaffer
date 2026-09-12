import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { SportLogo } from "@/components/brand/SportLogo";
import { ProfileEditorDialog } from "@/components/profile/ProfileEditorDialog";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Users,
  Calendar,
  Radio,
  BarChart3,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  Shield,
  Trophy,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
 *  NAVIGATION CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════ */

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  requiresTeam?: boolean;
}

const COACH_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: Home },
  { label: "Roster", path: "/athletes", icon: Users, requiresTeam: true },
  { label: "Events", path: "/events", icon: Calendar, requiresTeam: true },
  { label: "Live Logger", path: "/live-logger", icon: Radio, requiresTeam: true },
  { label: "Stats", path: "/statistics", icon: BarChart3, requiresTeam: true },
  { label: "Team", path: "/team", icon: Shield, requiresTeam: true },
];

const PLAYER_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/player/dashboard", icon: Home },
  { label: "Team", path: "/player/team", icon: Users },
  { label: "Events", path: "/player/events", icon: Calendar },
  { label: "Standings", path: "/player/standings", icon: Trophy },
];

/* ═══════════════════════════════════════════════════════════════════════════
 *  SIDEBAR COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

interface SidebarProps {
  className?: string;
  /** Which navigation set to render. Defaults to the signed-in user's accountKind. */
  variant?: "coach" | "player";
}

export function Sidebar({ className, variant }: SidebarProps) {
  const { user, team, accountKind, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const resolvedVariant = variant ?? (accountKind === "player" ? "player" : "coach");
  const navItems = resolvedVariant === "player" ? PLAYER_NAV_ITEMS : COACH_NAV_ITEMS;

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

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
            {resolvedVariant === "player" ? "Player Hub" : "Coach Command"}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isRelatedMatchReport =
            item.path === "/live-logger" &&
            /^\/matches\/[^/]+\/report\/?$/.test(pathname);

          if (item.requiresTeam && !team) {
            return (
              <span
                key={item.label}
                className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/50"
                title="Add a team first"
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {item.label}
              </span>
            );
          }

          return (
            <NavLink
              key={item.label}
              to={item.path}
              aria-current={isRelatedMatchReport ? "page" : undefined}
              onClick={() => setIsMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive || isRelatedMatchReport
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )
              }
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}

      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-4 py-4">
        {/* Profile — clickable to open the profile editor (coach only) */}
        {resolvedVariant !== "player" && (
        <button
          onClick={() => {
            setIsMobileOpen(false);
            setIsProfileOpen(true);
          }}
          className="mb-3 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="View and edit profile"
        >
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/20 text-sm font-bold text-primary">
            {user?.image ? (
              <img
                src={user.image}
                alt=""
                className="size-full rounded-full object-cover"
              />
            ) : (
              (user?.name?.charAt(0).toUpperCase() ?? "C")
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user?.name ?? "Coach"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {team?.name ?? "Your Team"}
            </p>
          </div>
        </button>
        )}

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

      {/* Profile editor modal */}
      <ProfileEditorDialog
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />
    </>
  );
}

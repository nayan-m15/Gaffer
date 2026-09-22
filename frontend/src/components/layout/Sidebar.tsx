import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { SportLogo } from "@/components/brand/SportLogo";
import { ProfileEditorDialog } from "@/components/profile/ProfileEditorDialog";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { motion, useReducedMotion } from "motion/react";
import { listQueuedEvents } from "@/offline/match-store";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Users,
  Calendar,
  HeartPulse,
  Radio,
  BarChart3,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  Shield,
  Trophy,
  PanelLeftClose,
  PanelLeftOpen,
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
  {
    label: "Injuries",
    path: "/injuries",
    icon: HeartPulse,
    requiresTeam: true,
  },
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
  const { expanded, toggle } = useSidebar();
  const reduceMotion = useReducedMotion();

  const resolvedVariant = variant ?? (accountKind === "player" ? "player" : "coach");
  const navItems = resolvedVariant === "player" ? PLAYER_NAV_ITEMS : COACH_NAV_ITEMS;

  const handleSignOut = async () => {
    try {
      const pending = (await listQueuedEvents()).filter((item) =>
        ["queued", "uploading", "dependency_pending", "rejected", "quarantined"].includes(
          item.state,
        ),
      );
      let pendingData: "retain" | "discard" = "retain";
      if (pending.length > 0) {
        const retain = window.confirm(
          `You have ${pending.length} unsent offline item${pending.length === 1 ? "" : "s"}. Select OK to retain them for this account. Select Cancel to choose whether to discard them.`,
        );
        if (!retain) {
          const discard = window.confirm(
            "Permanently discard the unsent offline items? Select Cancel to stay signed in.",
          );
          if (!discard) return;
          pendingData = "discard";
        }
      }
      await signOut({ pendingData });
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  /* ── Sidebar content (shared between desktop and mobile) ─────────────── */
  const sidebarContent = (
    <>
      {/* Brand header */}
      <div
        className={cn(
          "flex items-center gap-3 border-b border-sidebar-border/70 px-5 py-6",
          !expanded && "lg:justify-center lg:px-2",
        )}
      >
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-1.5 shadow-[0_0_28px_-10px_var(--primary)]">
          <SportLogo size={32} className="rounded-md" />
        </div>
        <div className={cn(!expanded && "lg:hidden")}>
          <h2 className="font-display text-base font-bold tracking-[0.16em] text-sidebar-foreground">
            GAFFER
          </h2>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {resolvedVariant === "player" ? "Player Hub" : "Coach Command"}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 px-3 py-5" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isRelatedMatchReport =
            item.path === "/live-logger" &&
            /^\/matches\/[^/]+\/report\/?$/.test(pathname);

          if (item.requiresTeam && !team) {
            return (
              <span
                key={item.label}
                className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/40"
                title="Add a team first"
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className={cn(!expanded && "lg:hidden")}>{item.label}</span>
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
                  "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-200 motion-reduce:transition-none",
                  isActive || isRelatedMatchReport
                    ? "border-primary/25 bg-primary/12 text-sidebar-foreground shadow-[inset_0_1px_rgba(255,255,255,0.06)]"
                    : "border-transparent text-sidebar-foreground/70 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                )
              }
            >
              <span
                className={cn(
                  "absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary opacity-0 transition-opacity group-aria-[current=page]:opacity-100",
                )}
                aria-hidden="true"
              />
              <Icon className="size-[18px] shrink-0" aria-hidden="true" />
              <span className={cn(!expanded && "lg:hidden")}>{item.label}</span>
            </NavLink>
          );
        })}

      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border/70 px-4 py-4">
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
          <div className={cn("min-w-0 flex-1", !expanded && "lg:hidden")}>
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
          <span className={cn(!expanded && "lg:hidden")}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </span>
        </button>

        {/* Sign out */}
        <button
          onClick={() => void handleSignOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <LogOut className="size-5 shrink-0" aria-hidden="true" />
          <span className={cn(!expanded && "lg:hidden")}>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: expanded ? 272 : 64 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 280, damping: 28 }
        }
        className={cn(
          "hidden lg:fixed lg:inset-y-3 lg:left-3 lg:z-20 lg:flex lg:flex-col lg:overflow-hidden lg:rounded-2xl",
          "border border-sidebar-border/80 bg-sidebar/85 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.75)] backdrop-blur-xl",
          className,
        )}
      >
        <button
          type="button"
          onClick={toggle}
          className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          title={expanded ? "Collapse navigation" : "Expand navigation"}
        >
          {expanded ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
        {sidebarContent}
      </motion.aside>

      {/* ── Mobile toggle button ──────────────────────────────────────────── */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-xl border border-border/70 bg-card/80 p-2 shadow-lg backdrop-blur-xl lg:hidden"
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
              "fixed inset-y-0 left-0 flex w-72 flex-col",
              "border-r border-sidebar-border bg-sidebar/95 shadow-2xl backdrop-blur-xl",
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

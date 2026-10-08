import { useCallback, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ProfileEditorDialog, type AccountView } from "@/components/profile/ProfileEditorDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SportLogo } from "@/components/brand/SportLogo";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/useSidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
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
  Settings,
  UserRound,
  ChevronsUpDown,
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
  { label: "Leagues & Competitions", path: "/competitions", icon: Trophy, requiresTeam: true },
  { label: "Team", path: "/team", icon: Shield, requiresTeam: true },
];

const PLAYER_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/player/dashboard", icon: Home },
  { label: "Team", path: "/player/team", icon: Users },
  { label: "Events", path: "/player/events", icon: Calendar },
  { label: "Leagues & Competitions", path: "/player/competitions", icon: Trophy },
];

function SidebarNavigation({
  items,
  hasTeam,
  expanded,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  hasTeam: boolean;
  expanded: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1.5 px-3 py-5" aria-label="Main navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const isRelatedMatchReport =
          item.path === "/live-logger" &&
          /^\/matches\/[^/]+\/report\/?$/.test(pathname);
        if (item.requiresTeam && !hasTeam) {
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
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                isActive || isRelatedMatchReport
                  ? "border-sidebar-border bg-surface-active text-sidebar-foreground"
                  : "border-transparent text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )
            }
          >
            <span
              className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary opacity-0 transition-opacity group-aria-[current=page]:opacity-100"
              aria-hidden="true"
            />
            <Icon className="size-[18px] shrink-0 text-sidebar-foreground/55 transition-colors group-hover:text-sidebar-foreground group-aria-[current=page]:text-primary" aria-hidden="true" />
            <span className={cn(!expanded && "lg:hidden")}>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

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
  const [accountView, setAccountView] = useState<AccountView | null>(null);
  const closeAccount = useCallback(() => setAccountView(null), []);
  const openAccount = (view: AccountView) => { setIsMobileOpen(false); setAccountView(view); };
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
        <div className="rounded-lg border border-sidebar-border bg-surface-nested p-1.5">
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
      <SidebarNavigation
        items={navItems}
        hasTeam={Boolean(team)}
        expanded={expanded}
        pathname={pathname}
        onNavigate={() => setIsMobileOpen(false)}
      />


      {/* Footer */}
      <div className="border-t border-sidebar-border/70 px-4 py-4">
        {/* Profile — available to coaches, assistants, and players. */}
        <DropdownMenu>
          <DropdownMenuTrigger className="mb-3 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open account menu" title="Profile and account settings">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/20 text-sm font-bold text-primary">
            {user?.image ? (
              <img
                src={user.image}
                alt=""
                className="size-full rounded-full object-cover"
              />
            ) : (
              (user?.name?.charAt(0).toUpperCase() ??
                (resolvedVariant === "player" ? "P" : "C"))
            )}
          </div>
          <div className={cn("min-w-0 flex-1", !expanded && "lg:hidden")}>
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user?.name ?? (resolvedVariant === "player" ? "Player" : "Coach")}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Profile & settings
            </p>
          </div>
          <ChevronsUpDown className={cn("size-4 shrink-0 text-muted-foreground", !expanded && "lg:hidden")} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <DropdownMenuItem onClick={() => openAccount("profile")}><UserRound />View profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openAccount("settings")}><Settings />Account settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {resolvedVariant === "player" && (
          <nav aria-label="Legal navigation" className="mb-3 border-b border-sidebar-border/70 pb-3 lg:hidden">
            <a href="/terms-of-service.html?returnTo=%2Fplayer%2Fdashboard" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setIsMobileOpen(false)}>
              Terms &amp; Conditions
            </a>
            <a href="/privacy-policy.html?returnTo=%2Fplayer%2Fdashboard" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setIsMobileOpen(false)}>
              Privacy Policy
            </a>
          </nav>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          "hidden lg:fixed lg:inset-y-3 lg:left-3 lg:z-20 lg:flex lg:flex-col lg:overflow-hidden lg:rounded-xl",
          "border border-sidebar-border bg-sidebar/96 shadow-[0_20px_60px_-36px_rgba(0,0,0,0.95)] backdrop-blur-xl",
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

      {resolvedVariant === "coach" && (
        <MobileBottomNav
          hasTeam={Boolean(team)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onProfile={() => openAccount("profile")}
          onSettings={() => openAccount("settings")}
          onSignOut={() => void handleSignOut()}
        />
      )}

      <ProfileEditorDialog view={accountView} onClose={closeAccount} onViewChange={setAccountView} />

      {/* Player routes retain their existing mobile navigation. */}
      {resolvedVariant === "player" && <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg border border-border-subtle bg-surface-elevated p-2 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="size-5 text-foreground" aria-hidden="true" />
      </button>}

      {/* ── Mobile sidebar overlay ────────────────────────────────────────── */}
      {resolvedVariant === "player" && isMobileOpen && (
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
              "border-r border-sidebar-border bg-sidebar shadow-2xl",
            )}
          >
            {/* Close button */}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

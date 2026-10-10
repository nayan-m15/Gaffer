import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { matchPath, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";
import { ProfileEditorDialog, type AccountView } from "@/components/profile/ProfileEditorDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SportLogo } from "@/components/brand/SportLogo";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { startCoachTour } from "@/features/onboarding/startTour";
import { useOnboardingRoadActive } from "@/features/onboarding/onboardingFlag";
import {
  PAGE_UNLOCKS,
  pageRequirementsMet,
  usePageCelebrated,
  useUnlockRequirements,
  type UnlockPageKey,
} from "@/features/onboarding/unlocks";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/useSidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { listQueuedEvents } from "@/offline/match-store";
import { getPendingTeamInviteToken } from "@/services/team-invites";
import type { LucideIcon } from "lucide-react";
import "./Sidebar.css";
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
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Compass,
  Lock,
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

const TOUR_ID_BY_PATH: Record<string, string> = {
  "/dashboard": "nav-dashboard",
  "/athletes": "nav-roster",
  "/events": "nav-events",
  "/live-logger": "nav-live-logger",
  "/injuries": "nav-injuries",
  "/statistics": "nav-stats",
  "/competitions": "nav-competitions",
  "/team": "nav-team",
};

const PATH_TO_UNLOCK_KEY: Partial<Record<string, UnlockPageKey>> = {
  "/dashboard": "dashboard",
  "/events": "events",
  "/injuries": "injuries",
  "/live-logger": "live-logger",
  "/statistics": "statistics",
  "/team": "team",
};

type NavUnlockStatus =
  | { kind: "none" }
  | { kind: "locked"; title: string }
  | { kind: "claim"; title: string };

function UnlockNavController({
  enabled,
  children,
}: {
  enabled: boolean;
  children: (getStatus: (key: UnlockPageKey) => NavUnlockStatus) => ReactNode;
}) {
  if (!enabled) {
    return <>{children(() => ({ kind: "none" }))}</>;
  }
  return (
    <UnlockNavControllerActive>{children}</UnlockNavControllerActive>
  );
}

function UnlockNavControllerActive({
  children,
}: {
  children: (getStatus: (key: UnlockPageKey) => NavUnlockStatus) => ReactNode;
}) {
  const { user } = useAuth();
  const { hasPlayers, hasGamePlan, isLoading } = useUnlockRequirements();
  const dashboardCelebrated = usePageCelebrated(user?.id, "dashboard");
  const eventsCelebrated = usePageCelebrated(user?.id, "events");
  const injuriesCelebrated = usePageCelebrated(user?.id, "injuries");
  const liveLoggerCelebrated = usePageCelebrated(user?.id, "live-logger");
  const statisticsCelebrated = usePageCelebrated(user?.id, "statistics");
  const teamCelebrated = usePageCelebrated(user?.id, "team");
  const celebratedByKey: Record<UnlockPageKey, boolean> = {
    dashboard: dashboardCelebrated,
    events: eventsCelebrated,
    injuries: injuriesCelebrated,
    "live-logger": liveLoggerCelebrated,
    statistics: statisticsCelebrated,
    team: teamCelebrated,
  };

  const getStatus = (key: UnlockPageKey): NavUnlockStatus => {
    if (isLoading || celebratedByKey[key]) {
      return { kind: "none" };
    }
    if (!pageRequirementsMet(key, hasPlayers, hasGamePlan)) {
      const page = PAGE_UNLOCKS[key];
      if (page.needsPlayers && !hasPlayers) {
        return { kind: "locked", title: "Locked: add at least one player" };
      }
      return { kind: "locked", title: "Locked: save your first game plan" };
    }
    return { kind: "claim", title: "Unlocked, open to claim" };
  };

  return <>{children(getStatus)}</>;
}

function UnlockNavMark({ status, collapsed = false }: {
  status: NavUnlockStatus;
  collapsed?: boolean;
}) {
  if (status.kind === "none") return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        collapsed
          ? "absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full border border-sidebar-border bg-surface-card"
          : "ml-auto inline-flex shrink-0 items-center",
      )}
    >
      {status.kind === "locked" ? (
        <Lock className={cn("text-muted-foreground", collapsed ? "size-2.5" : "size-3.5")} />
      ) : (
        <span className="size-1.5 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
      )}
    </span>
  );
}

interface SidebarNavigationProps {
  items: NavItem[];
  hasTeam: boolean;
  expanded: boolean;
  pathname: string;
  onNavigate: () => void;
  desktop?: boolean;
  isFirstTime: boolean;
  showTourIds: boolean;
  getUnlockStatus: (key: UnlockPageKey) => NavUnlockStatus;
}

const NAV_SPRING = { type: "spring", stiffness: 700, damping: 45 } as const;
const PILL_SPRING = { type: "spring", stiffness: 600, damping: 42 } as const;

function DesktopNavigation({ items, hasTeam, expanded, pathname, onNavigate, isFirstTime, showTourIds, getUnlockStatus }: SidebarNavigationProps) {
  const reduceMotion = useReducedMotion();
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{
    x: number; y: number; width: number; height: number; animate: boolean;
  } | null>(null);
  const activeIndex = items.findIndex((item) => (!item.requiresTeam || hasTeam) && (
    matchPath({ path: item.path, end: false }, pathname) ||
    (item.path === "/live-logger" && /^\/matches\/[^/]+\/report\/?$/.test(pathname))
  ));

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || activeIndex < 0) return;
    const activeLink = nav.querySelector<HTMLElement>(`[data-sidebar-index="${activeIndex}"]`);
    if (!activeLink) return;
    const measure = () => {
      const bounds = nav.getBoundingClientRect();
      const item = activeLink.getBoundingClientRect();
      // Suspense can hide the shell; retain the last position while hidden.
      if (!item.width || !item.height) return;
      const x = item.left - bounds.left;
      const y = item.top - bounds.top;
      setPill((previous) => previous?.x === x && previous.y === y &&
        previous.width === item.width && previous.height === item.height
        ? previous : { x, y, width: item.width, height: item.height, animate: previous !== null });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    nav.querySelectorAll<HTMLElement>("[data-sidebar-index]").forEach((link) => observer.observe(link));
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex, expanded, pathname]);

  return (
      <nav ref={navRef} className={cn("desktop-sidebar-nav relative isolate z-10 flex-1 py-5", !expanded && "desktop-sidebar-nav--collapsed")} aria-label="Main navigation">
        {/* One persistent element: routing never transfers it between links. */}
        <motion.div initial={false}
          animate={{ y: pill?.y ?? 0, height: pill?.height ?? 44, opacity: activeIndex >= 0 && pill ? 1 : 0 }}
          style={{ left: pill?.x ?? 8, top: 0, width: pill?.width ?? 0 }}
          transition={{ ...(reduceMotion || !pill?.animate ? { duration: 0 } : PILL_SPRING), opacity: { duration: 0 } }}
          className="desktop-sidebar-active-pill pointer-events-none absolute z-0 rounded-xl"
          aria-hidden="true" />
        {items.map((item, index) => {
          const Icon = item.icon;
          const tourId = showTourIds ? TOUR_ID_BY_PATH[item.path] : undefined;
          const unlockKey = PATH_TO_UNLOCK_KEY[item.path];
          const unlockStatus = unlockKey ? getUnlockStatus(unlockKey) : { kind: "none" as const };
          const tooltipLabel = unlockStatus.kind === "locked"
            ? `${item.label} (locked)`
            : unlockStatus.kind === "claim" ? `${item.label} (unlocked, open to claim)` : item.label;
          const isRelatedMatchReport = item.path === "/live-logger" && /^\/matches\/[^/]+\/report\/?$/.test(pathname);
          if (item.requiresTeam && !hasTeam) return (
            <AnimatedTooltip key={item.label} label="Create your team first" side="right" portal dismissOnEscape
              enabled={!expanded} screenReaderDescription="Create your team first">
            <span
              data-tour={tourId}
              className={cn(
                "desktop-sidebar-item desktop-sidebar-link desktop-sidebar-link--disabled relative z-10 flex w-full cursor-not-allowed items-center rounded-xl font-medium text-sidebar-foreground/40",
                isFirstTime && "opacity-50 blur-[2px] transition-[filter,opacity] duration-700 motion-reduce:transition-none",
              )}
              title={expanded ? "Create your team first" : undefined}
              aria-disabled="true">
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span className={cn(!expanded && "lg:hidden")}>{item.label}</span>
            </span>
            </AnimatedTooltip>
          );
          return (
            <motion.div key={item.path} className="desktop-sidebar-item relative z-10" initial="rest" animate="rest"
              whileHover={reduceMotion ? undefined : "hover"}>
              <AnimatedTooltip label={tooltipLabel} side="right" portal dismissOnEscape
                enabled={!expanded} screenReaderDescription={`Navigate to ${item.label}`}>
                <NavLink to={item.path} aria-label={item.label} data-sidebar-index={index}
                  data-tour={tourId}
                  title={expanded && unlockStatus.kind !== "none" ? unlockStatus.title : undefined}
                  aria-current={isRelatedMatchReport ? "page" : undefined} onClick={onNavigate}
                  className={({ isActive }) => cn(
                    "desktop-sidebar-link group relative flex w-full items-center rounded-xl border border-transparent font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive || isRelatedMatchReport
                      ? "desktop-sidebar-link--active text-sidebar-foreground"
                      : "text-sidebar-foreground/65 hover:text-sidebar-accent-foreground",
                  )}>
                  <motion.span className="desktop-sidebar-link-content relative z-10 flex min-w-0 items-center"
                    variants={{ rest: { x: 0 }, hover: { x: reduceMotion ? 0 : 2.5 } }}
                    transition={reduceMotion ? { duration: 0 } : NAV_SPRING}>
                    <span className="relative inline-flex shrink-0">
                    <Icon className="size-5 shrink-0 text-sidebar-foreground/55 transition-colors duration-150 motion-reduce:transition-none group-hover:text-primary group-aria-[current=page]:text-primary" aria-hidden="true" />
                      {!expanded && <UnlockNavMark status={unlockStatus} collapsed />}
                    </span>
                    <span className={cn("whitespace-nowrap", !expanded && "lg:hidden")}>{item.label}</span>
                    {expanded && <UnlockNavMark status={unlockStatus} />}
                  </motion.span>
                </NavLink>
              </AnimatedTooltip>
            </motion.div>
          );
        })}
      </nav>
  );
}

function SidebarNavigation({ desktop = false, ...props }: SidebarNavigationProps) {
  return desktop ? <DesktopNavigation {...props} /> : <MobileSidebarNavigation {...props} />;
}

function MobileSidebarNavigation({
  items,
  hasTeam,
  expanded,
  pathname,
  onNavigate,
}: SidebarNavigationProps) {
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
  const isFirstTime = resolvedVariant === "coach" && !team && getPendingTeamInviteToken() === null;
  const onboardingActive = useOnboardingRoadActive(user?.id);
  const applyUnlocks = resolvedVariant === "coach" && Boolean(team?.role === "coach" && onboardingActive && user?.id);

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

  /* Explicit mode preserves the player's original mobile content. */
  const renderSidebarContent = (desktop: boolean) => (
    <>
      {/* Brand header */}
      <div
        className={cn(
          "flex items-center gap-3 border-b border-sidebar-border/70 px-5 py-6",
          desktop && "desktop-sidebar-header",
          !expanded && "lg:justify-center lg:px-2",
        )}
      >
        <div className={cn("rounded-lg border border-sidebar-border bg-surface-nested p-1.5", desktop && "desktop-sidebar-logo-tile")}>
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
      <UnlockNavController enabled={applyUnlocks}>
        {(getUnlockStatus) => (
      <SidebarNavigation
        desktop={desktop}
        items={navItems}
        hasTeam={Boolean(team)}
        expanded={expanded}
        pathname={pathname}
        onNavigate={() => setIsMobileOpen(false)}
        isFirstTime={isFirstTime}
        showTourIds={resolvedVariant === "coach"}
        getUnlockStatus={getUnlockStatus}
      />
        )}
      </UnlockNavController>


      {/* Footer */}
      <div className={cn("border-t border-sidebar-border/70 px-4 py-4", desktop && "desktop-sidebar-profile-footer")} data-tour="account-section">
        {/* Profile — available to coaches, assistants, and players. */}
        <DropdownMenu>
          <DropdownMenuTrigger className={cn("mb-3 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", desktop && "lg:duration-[180ms] motion-reduce:transition-none")} aria-label="Open account menu" title="Profile and account settings">
          <div className={cn("flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/20 text-sm font-bold text-primary", desktop && "desktop-sidebar-avatar")}>
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
            {resolvedVariant === "coach" && !team && (
              <p className="truncate text-xs text-muted-foreground">No team yet</p>
            )}
          </div>
          {desktop ? <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground", !expanded && "lg:hidden")} aria-hidden="true" />
            : <ChevronsUpDown className={cn("size-4 shrink-0 text-muted-foreground", !expanded && "lg:hidden")} aria-hidden="true" />}
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
            {desktop ? (
              <span className="relative block size-5">
                <AnimatePresence initial={false}>
                  <motion.span key={theme} className="absolute inset-0"
                    initial={reduceMotion ? false : { opacity: 0, rotate: -30 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, rotate: 30 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18 }}>
                    {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
                  </motion.span>
                </AnimatePresence>
              </span>
            ) : theme === "dark" ? (
              <Sun className="size-5" />
            ) : (
              <Moon className="size-5" />
            )}
          </span>
          <span className={cn(!expanded && "lg:hidden")}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </span>
        </button>

        {resolvedVariant === "coach" && team?.role === "coach" && (
          <AnimatedTooltip label="Show tour again" side="right" portal dismissOnEscape
            enabled={desktop && !expanded} screenReaderDescription="Show tour again">
          <button
            type="button"
            data-tour="show-tour"
            onClick={() => {
              setIsMobileOpen(false);
              startCoachTour({
                teamName: team.name,
                firstName: user?.name?.trim().split(/\s+/)[0] || "Coach",
                replay: true,
                onGoToRoster: () => navigate("/athletes"),
              });
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Show tour again"
          >
            <Compass className="size-5 shrink-0" aria-hidden="true" />
            <span className={cn(!expanded && "lg:hidden")}>Show tour again</span>
          </button>
          </AnimatedTooltip>
        )}

        {/* Sign out */}
        <button
          onClick={() => void handleSignOut()}
          aria-label={desktop ? "Sign Out" : undefined}
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
          "gaffer-desktop-sidebar hidden lg:fixed lg:inset-y-3 lg:left-3 lg:z-20 lg:flex lg:flex-col lg:overflow-hidden lg:rounded-xl",
          "border border-border-subtle bg-surface-card shadow-[0_16px_40px_-32px_rgba(0,0,0,0.9)]",
          className,
        )}
      >
        <button
          type="button"
          onClick={toggle}
          className="desktop-sidebar-collapse absolute right-2 top-2 z-10 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          title={expanded ? "Collapse navigation" : "Expand navigation"}
        >
          {expanded ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
        {renderSidebarContent(true)}
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

            {renderSidebarContent(false)}
          </aside>
        </div>
      )}

    </>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Compass,
  FileText,
  HeartPulse,
  Home,
  Lock,
  LogOut,
  Menu,
  Moon,
  Radio,
  ScrollText,
  Shield,
  Sun,
  Trophy,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Theme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingRoadActive } from "@/features/onboarding/onboardingFlag";
import { startCoachTour } from "@/features/onboarding/startTour";
import {
  PAGE_UNLOCKS,
  pageRequirementsMet,
  usePageCelebrated,
  useUnlockRequirements,
  type UnlockPageKey,
} from "@/features/onboarding/unlocks";
import "./MobileBottomNav.css";

type NavItem = { label: string; path: string; icon: LucideIcon };

const primaryItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: Home },
  { label: "Events", path: "/events", icon: CalendarDays },
  { label: "Live Logger", path: "/live-logger", icon: Radio },
  { label: "Stats", path: "/statistics", icon: BarChart3 },
];

const moreItems: NavItem[] = [
  { label: "Roster", path: "/athletes", icon: Users },
  { label: "Injuries", path: "/injuries", icon: HeartPulse },
  { label: "Leagues & Competitions", path: "/competitions", icon: Trophy },
  { label: "Team", path: "/team", icon: Shield },
];

const DOCK_TOUR_ID: Record<string, string> = {
  "/dashboard": "mobile-nav-dashboard",
  "/events": "mobile-nav-events",
  "/live-logger": "mobile-nav-live-logger",
  "/statistics": "mobile-nav-stats",
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

function MobileUnlockController({
  enabled,
  children,
}: {
  enabled: boolean;
  children: (getStatus: (key: UnlockPageKey) => NavUnlockStatus) => ReactNode;
}) {
  if (!enabled) return children(() => ({ kind: "none" }));
  return <MobileUnlockControllerActive>{children}</MobileUnlockControllerActive>;
}

function MobileUnlockControllerActive({
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

  return children(getStatus);
}

function DockMark({ status }: { status: NavUnlockStatus }) {
  if (status.kind === "locked") {
    return <Lock className="mobile-nav-lock" aria-hidden="true" />;
  }
  if (status.kind === "claim") {
    return (
      <span
        className="mobile-nav-claim animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      />
    );
  }
  return null;
}

function isCurrent(pathname: string, path: string) {
  if (path === "/live-logger") {
    return pathname.startsWith(path) || /^\/matches\/[^/]+\/report\/?$/.test(pathname);
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

interface MobileBottomNavProps {
  hasTeam: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onSignOut: () => void;
}

export function MobileBottomNav({
  hasTeam,
  theme,
  onToggleTheme,
  onProfile,
  onSettings,
  onSignOut,
}: MobileBottomNavProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, team } = useAuth();
  const onboardingActive = useOnboardingRoadActive(user?.id);
  const unlocksEnabled = Boolean(team && onboardingActive && user?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLAnchorElement>(null);
  const menuRouteActive = moreItems.some((item) => isCurrent(pathname, item.path));

  useEffect(() => {
    if (!menuOpen) return;
    firstMenuItemRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <MobileUnlockController enabled={unlocksEnabled}>
      {(getStatus) => {
  const renderPrimary = (item: NavItem) => {
    const Icon = item.icon;
    const active = isCurrent(pathname, item.path);
    const center = item.path === "/live-logger";
    const className = `mobile-dock__item${center ? " mobile-dock__item--center" : ""}${active ? " is-active" : ""}`;
    const unlockKey = PATH_TO_UNLOCK_KEY[item.path];
    const unlockStatus = unlockKey ? getStatus(unlockKey) : { kind: "none" as const };
    const tourId = DOCK_TOUR_ID[item.path];
    if (!hasTeam && item.path !== "/dashboard") {
      return (
        <span key={item.path} className={`${className} is-disabled`} title="Add a team first" aria-disabled="true" data-tour={tourId}>
          <span className="mobile-dock__icon"><Icon aria-hidden="true" /></span>
          <span className="mobile-dock__label">{item.label}</span>
        </span>
      );
    }
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={className}
        data-tour={tourId}
        title={unlockStatus.kind === "none" ? undefined : unlockStatus.title}
        aria-current={active ? "page" : undefined}
        onClick={closeMenu}
      >
        <span className="mobile-dock__icon">
          <Icon aria-hidden="true" />
          <DockMark status={unlockStatus} />
        </span>
        <span className="mobile-dock__label">{item.label}</span>
      </NavLink>
    );
  };

  const menuClaim = moreItems.some((item) => {
    const key = PATH_TO_UNLOCK_KEY[item.path];
    return key ? getStatus(key).kind === "claim" : false;
  });

  return (
    <div className="mobile-nav no-print lg:hidden">
      {menuOpen && (
        <>
          <button type="button" className="mobile-nav__scrim" aria-label="Close menu" onClick={() => { closeMenu(); menuButtonRef.current?.focus(); }} />
          <div id="mobile-more-menu" className="mobile-more" role="group" aria-label="More navigation">
            <div className="mobile-more__links">
              {moreItems.map((item, index) => {
                const Icon = item.icon;
                const active = isCurrent(pathname, item.path);
                const unlockKey = PATH_TO_UNLOCK_KEY[item.path];
                const unlockStatus = unlockKey ? getStatus(unlockKey) : { kind: "none" as const };
                return hasTeam || item.path === "/team" ? (
                  <NavLink
                    key={item.path}
                    ref={(hasTeam && index === 0) || (!hasTeam && item.path === "/team") ? firstMenuItemRef : undefined}
                    to={item.path}
                    className={`mobile-more__row${active ? " is-active" : ""}`}
                    title={unlockStatus.kind === "none" ? undefined : unlockStatus.title}
                    aria-current={active ? "page" : undefined}
                    onClick={closeMenu}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {unlockStatus.kind === "locked" && (
                      <Lock className="mobile-more__lock" aria-hidden="true" />
                    )}
                    {unlockStatus.kind === "claim" && (
                      <span className="mobile-more__claim animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                    )}
                    <ChevronRight className="mobile-more__chevron" aria-hidden="true" />
                  </NavLink>
                ) : (
                  <span key={item.path} className="mobile-more__row is-disabled" aria-disabled="true" title="Add a team first">
                    <Icon aria-hidden="true" /><span>{item.label}</span>
                  </span>
                );
              })}
            </div>
            <div className="mobile-more__links">
              <button type="button" className="mobile-more__row" onClick={() => { closeMenu(); onProfile(); }}><UserRound aria-hidden="true" /><span>View profile</span><ChevronRight className="mobile-more__chevron" aria-hidden="true" /></button>
              <button type="button" className="mobile-more__row" onClick={() => { closeMenu(); onSettings(); }}>
                <Settings aria-hidden="true" /><span>Account settings</span><ChevronRight className="mobile-more__chevron" aria-hidden="true" />
              </button>
            </div>
            <div className="mobile-more__links" role="group" aria-label="Legal navigation">
              <a href="/terms-of-service.html?returnTo=%2Fdashboard" className="mobile-more__row" onClick={closeMenu}>
                <ScrollText aria-hidden="true" /><span>Terms &amp; Conditions</span><ChevronRight className="mobile-more__chevron" aria-hidden="true" />
              </a>
              <a href="/privacy-policy.html?returnTo=%2Fdashboard" className="mobile-more__row" onClick={closeMenu}>
                <FileText aria-hidden="true" /><span>Privacy Policy</span><ChevronRight className="mobile-more__chevron" aria-hidden="true" />
              </a>
            </div>
            <div className="mobile-more__links">
              <button type="button" className="mobile-more__row" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-pressed={theme === "dark"} onClick={onToggleTheme}>
                {theme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
                <span>Light / Dark Mode</span>
                <span className={`mobile-more__switch${theme === "dark" ? " is-on" : ""}`} aria-hidden="true" />
              </button>
            </div>
            <div className="mobile-more__links">
              {team && (
                <button
                  type="button"
                  className="mobile-more__row"
                  aria-label="Show tour again"
                  onClick={() => {
                    closeMenu();
                    startCoachTour({
                      teamName: team.name,
                      firstName: user?.name?.trim().split(/\s+/)[0] || "Coach",
                      replay: true,
                      onGoToRoster: () => navigate("/athletes"),
                    });
                  }}
                >
                  <Compass aria-hidden="true" />
                  <span>Show tour again</span>
                </button>
              )}
              <button type="button" className="mobile-more__row mobile-more__row--danger" onClick={() => { closeMenu(); onSignOut(); }}>
                <LogOut aria-hidden="true" /><span>Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}
      <nav className="mobile-dock" aria-label="Primary navigation">
        {primaryItems.slice(0, 2).map(renderPrimary)}
        {renderPrimary(primaryItems[2])}
        {renderPrimary(primaryItems[3])}
        <button
          ref={menuButtonRef}
          type="button"
          className={`mobile-dock__item${menuOpen || menuRouteActive ? " is-active" : ""}`}
          data-tour="mobile-nav-menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="mobile-dock__icon">
            <Menu aria-hidden="true" />
            {menuClaim && (
              <span className="mobile-nav-claim animate-pulse motion-reduce:animate-none" aria-hidden="true" />
            )}
          </span>
          <span className="mobile-dock__label">Menu</span>
        </button>
      </nav>
    </div>
      );
      }}
    </MobileUnlockController>
  );
}

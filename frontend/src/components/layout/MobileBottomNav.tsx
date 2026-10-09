import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  FileText,
  HeartPulse,
  Home,
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

  const renderPrimary = (item: NavItem) => {
    const Icon = item.icon;
    const active = isCurrent(pathname, item.path);
    const center = item.path === "/live-logger";
    const className = `mobile-dock__item${center ? " mobile-dock__item--center" : ""}${active ? " is-active" : ""}`;
    if (!hasTeam && item.path !== "/dashboard") {
      return (
        <span key={item.path} className={`${className} is-disabled`} title="Add a team first" aria-disabled="true">
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
        aria-current={active ? "page" : undefined}
        onClick={closeMenu}
      >
        <span className="mobile-dock__icon"><Icon aria-hidden="true" /></span>
        <span className="mobile-dock__label">{item.label}</span>
      </NavLink>
    );
  };

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
                return hasTeam || item.path === "/team" ? (
                  <NavLink
                    key={item.path}
                    ref={(hasTeam && index === 0) || (!hasTeam && item.path === "/team") ? firstMenuItemRef : undefined}
                    to={item.path}
                    className={`mobile-more__row${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={closeMenu}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
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
          aria-expanded={menuOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="mobile-dock__icon"><Menu aria-hidden="true" /></span>
          <span className="mobile-dock__label">Menu</span>
        </button>
      </nav>
    </div>
  );
}

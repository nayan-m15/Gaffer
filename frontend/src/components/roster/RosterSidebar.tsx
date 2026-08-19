import { useState, useCallback } from "react";
import { LayoutDashboard, Users, CalendarDays, BarChart3, X, Menu } from "lucide-react";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { brand } from "@/data/brand";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  isActive?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <LayoutDashboard className="size-5" /> },
  { label: "Roster", href: "/athletes", icon: <Users className="size-5" />, isActive: true },
  { label: "Events", href: "/events", icon: <CalendarDays className="size-5" /> },
  { label: "Stats", href: "#stats", icon: <BarChart3 className="size-5" /> },
];

interface RosterSidebarProps {
  className?: string;
}

/**
 * RosterSidebar — branded dashboard sidebar for authenticated pages.
 *
 * Desktop: fixed left sidebar.
 * Mobile: collapsible slide-out drawer triggered by a hamburger button.
 */
export function RosterSidebar({ className }: RosterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleMobile = useCallback(() => setMobileOpen((open) => !open), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <>
      {/* Mobile toggle — sits in the top-left of the main content area. */}
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        onClick={toggleMobile}
        aria-label={mobileOpen ? "Close sidebar" : "Open sidebar"}
        aria-expanded={mobileOpen}
        className="fixed left-4 top-4 z-50 md:hidden"
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

      {/* Mobile overlay backdrop. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar shell. */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          className,
        )}
      >
        {/* Logo / wordmark */}
        <div className="flex items-center gap-3 px-6 py-6">
          <SportLogo size={36} className="shrink-0" />
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight text-sidebar-foreground">
              {brand.name.toUpperCase()}
            </p>
            <p className="text-[10px] font-semibold tracking-widest text-brand">
              COACH COMMAND
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Dashboard navigation" className="flex-1 px-4 py-4">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  onClick={closeMobile}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                    item.isActive
                      ? "border-l-2 border-brand bg-brand/10 text-brand"
                      : "border-l-2 border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  {item.icon}
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Coach profile */}
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
              CM
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-sidebar-foreground">Coach Marcus</p>
              <p className="text-xs text-muted-foreground">Greenfield FC</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Menu, X, Sun, Moon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SportLogo } from "@/components/brand/SportLogo";
import { useTheme } from "@/hooks/useTheme";
import { brand } from "@/data/brand";
import { cn } from "@/lib/utils";

/**
 * Desktop navigation link descriptors.
 *
 * `href` values are anchors — they will be updated when the corresponding
 * landing-page sections are built in later phases.
 */
const NAV_LINKS = [
  { label: "Public Dashboard", href: "/public-dashboard" },
  { label: "Philosophy", href: "/#philosophy" },
  { label: "Roster", href: "/#roster" },
  { label: "Tactics", href: "/#tactics" },
  { label: "Matchday", href: "/#matchday" },
  { label: "Analytics", href: "/#analytics" },
] as const;

/**
 * Navbar — Sticky top navigation bar for the landing page.
 *
 * Features:
 * - Sticky positioning with a subtle backdrop blur.
 * - Responsive: collapses into a mobile slide-down menu.
 * - Theme toggle (light ↔ dark) via the `useTheme` hook.
 * - Accessible keyboard navigation and ARIA attributes.
 *
 * The "Get Started" CTA uses the brand emerald primary colour.
 */
export function Navbar() {
  const { theme, toggleTheme } = useTheme();

  /** Whether the mobile hamburger menu is currently expanded. */
  const [mobileOpen, setMobileOpen] = useState(false);

  /** Tracks scroll position so we can add a stronger background when scrolled. */
  const [scrolled, setScrolled] = useState(false);

  /* ── Listen for scroll events to adjust the navbar background ────────── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Close the mobile menu when the viewport grows to desktop ────────── */
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** Prevent body scroll when mobile menu is open. */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-colors duration-200",
        scrolled
          ? "border-b border-border bg-background/80 backdrop-blur-md"
          : "bg-transparent",
      )}
    >
      <nav
        aria-label="Main navigation"
        className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        {/* ── Logo + wordmark ──────────────────────────────────────────── */}
        <a
          href="/"
          className="flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-80"
        >
          <SportLogo size={30} className="rounded" />
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            {brand.name}
          </span>
        </a>

        {/* ── Desktop actions ──────────────────────────────────────────── */}
        <div className="hidden items-center gap-3 md:flex">
          <a
            href="/public-dashboard"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Public Dashboard
          </a>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>

          <a
            href="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Log In
          </a>

          <a href="/signup" className={buttonVariants()}>
            Get Started
          </a>
        </div>

        {/* ── Mobile hamburger + theme toggle ──────────────────────────── */}
        <div className="flex items-center gap-1 md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={toggleMobile}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </Button>
        </div>
      </nav>

      {/* ── Mobile slide-down menu ──────────────────────────────────────── */}
      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out md:hidden",
          mobileOpen
            ? "max-h-96 opacity-100"
            : "max-h-0 opacity-0",
        )}
      >
        <div className="border-t border-border bg-background px-4 pb-6 pt-4">
          {/* Navigation links */}
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Divider */}
          <div className="my-4 h-px bg-border" />

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <a
              href="/login"
              className="block rounded-md px-3 py-2.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Log In
            </a>
            <a
              href="/signup"
              className={cn(buttonVariants(), "w-full")}
              onClick={() => setMobileOpen(false)}
            >
              Get Started
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

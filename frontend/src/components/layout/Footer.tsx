import { SportLogo } from "@/components/brand/SportLogo";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

interface FooterProps {
  /** Determines where legal pages return the user. Defaults to the coach dashboard. */
  variant?: "coach" | "player";
  className?: string;
}

const LEGAL_FOOTER_LINKS = [
  { label: "Terms of Service", path: "/terms-of-service.html" },
  { label: "Privacy Policy", path: "/privacy-policy.html" },
] as const;

/**
 * Application footer for authenticated views.
 *
 * Rendered once inside AppShell (coach) and PlayerShell (player) so it
 * appears consistently at the bottom of every signed-in page. Legal links
 * preserve the active app area as their return destination.
 */
export function Footer({ variant = "coach", className }: FooterProps) {
  const year = new Date().getFullYear();
  const returnTo = variant === "player" ? "/player/dashboard" : "/dashboard";

  return (
    <footer className={cn("mt-3 hidden w-full rounded-t-xl border-t border-border bg-background px-3 py-2 text-[10px] text-muted-foreground supports-backdrop-filter:bg-background/50 supports-backdrop-filter:backdrop-blur-md sm:mt-8 sm:px-10 sm:py-3 sm:text-sm lg:block", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <div className="flex items-center gap-1.5">
            <SportLogo size={16} className="rounded" />
            <span className="font-display text-[10px] font-bold tracking-wide text-foreground">
              Gaffer
            </span>
          </div>
          <nav aria-label="Legal navigation">
            <ul className="flex items-center gap-3">
              {LEGAL_FOOTER_LINKS.map((link) => (
                <li key={link.path}>
                  <a
                    href={`${link.path}?returnTo=${encodeURIComponent(returnTo)}`}
                    className="inline-flex min-h-8 items-center rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="sm:hidden">@Gaffer {year} all rights reserved.</p>

        <div className="hidden items-center gap-2 sm:flex">
          <SportLogo size={20} className="rounded" />
          <span className="font-display text-xs font-bold tracking-wide text-foreground">
            Gaffer
          </span>
          <span aria-hidden="true">·</span>
          <span>
            &copy; {year} Gaffer. All rights reserved.
          </span>
        </div>

        <nav aria-label="Legal navigation" className="hidden sm:block">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {LEGAL_FOOTER_LINKS.map((link) => (
              <li key={link.path}>
                <a
                  href={`${link.path}?returnTo=${encodeURIComponent(returnTo)}`}
                  className="inline-flex min-h-8 items-center rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <span className="hidden text-xs sm:inline">v{APP_VERSION}</span>
      </div>
    </footer>
  );
}

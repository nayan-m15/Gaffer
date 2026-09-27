import { Link } from "react-router-dom";
import { SportLogo } from "@/components/brand/SportLogo";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

interface FooterLink {
  label: string;
  path: string;
}

interface FooterProps {
  /** Which navigation set to render. Defaults to the coach link set. */
  variant?: "coach" | "player";
  className?: string;
}

const COACH_FOOTER_LINKS: FooterLink[] = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Roster", path: "/athletes" },
  { label: "Events", path: "/events" },
  { label: "Live Logger", path: "/live-logger" },
  { label: "Stats", path: "/statistics" },
  { label: "Team", path: "/team" },
];

const PLAYER_FOOTER_LINKS: FooterLink[] = [
  { label: "Dashboard", path: "/player/dashboard" },
  { label: "Team", path: "/player/team" },
  { label: "Events", path: "/player/events" },
  { label: "Standings", path: "/player/standings" },
];

const LEGAL_FOOTER_LINKS: FooterLink[] = [
  { label: "Terms of Service", path: "/terms-of-service.html" },
  { label: "Privacy Policy", path: "/privacy-policy.html" },
];

/**
 * Application footer for authenticated views.
 *
 * Rendered once inside AppShell (coach) and PlayerShell (player) so it
 * appears consistently at the bottom of every signed-in page. The link
 * set mirrors whichever Sidebar variant is active — coach links point at
 * roster/events/live-logger/stats/team-tactics, player links point at the
 * read-only /player/* routes.
 */
export function Footer({ variant = "coach", className }: FooterProps) {
  const year = new Date().getFullYear();
  const returnTo = variant === "player" ? "/player/dashboard" : "/dashboard";
  const links = [
    ...(variant === "player" ? PLAYER_FOOTER_LINKS : COACH_FOOTER_LINKS),
    ...LEGAL_FOOTER_LINKS,
  ];

  return (
    <footer className={cn("mx-auto mt-3 w-full max-w-[1600px] border-t border-border/50 px-3 py-2 text-[10px] text-muted-foreground sm:mt-8 sm:px-10 sm:py-6 sm:text-sm", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <div className="flex items-center gap-1.5">
            <SportLogo size={16} className="rounded" />
            <span className="font-display text-[10px] font-bold tracking-wide text-foreground">
              Gaffer
            </span>
          </div>
          <nav aria-label="Legal links" className="flex items-center gap-3">
            <a
              href={`/terms-of-service.html?returnTo=${encodeURIComponent(returnTo)}`}
              className="transition-colors hover:text-foreground"
            >
              T&apos;s&amp;C&apos;s
            </a>
            <a
              href={`/privacy-policy.html?returnTo=${encodeURIComponent(returnTo)}`}
              className="transition-colors hover:text-foreground"
            >
              Privacy policy
            </a>
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

        <nav aria-label="Footer navigation" className="hidden sm:block">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {links.map((link) => (
              <li key={link.path}>
                {link.path.endsWith(".html") ? (
                  <a
                    href={`${link.path}?returnTo=${encodeURIComponent(returnTo)}`}
                    className="transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    to={link.path}
                    className="transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <span className="hidden text-xs sm:inline">v{APP_VERSION}</span>
      </div>
    </footer>
  );
}

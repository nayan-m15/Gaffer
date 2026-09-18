import { Link } from "react-router-dom";
import { SportLogo } from "@/components/brand/SportLogo";
import { APP_VERSION } from "@/lib/version";

interface FooterLink {
  label: string;
  path: string;
}

interface FooterProps {
  /** Which navigation set to render. Defaults to the coach link set. */
  variant?: "coach" | "player";
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
export function Footer({ variant = "coach" }: FooterProps) {
  const year = new Date().getFullYear();
  const returnTo = variant === "player" ? "/player/dashboard" : "/dashboard";
  const links = [
    ...(variant === "player" ? PLAYER_FOOTER_LINKS : COACH_FOOTER_LINKS),
    ...LEGAL_FOOTER_LINKS,
  ];

  return (
    <footer className="mx-auto mt-8 w-full max-w-[1600px] border-t border-border/50 px-6 py-6 text-sm text-muted-foreground sm:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <SportLogo size={20} className="rounded" />
          <span className="font-display text-xs font-bold tracking-wide text-foreground">
            GAFFER
          </span>
          <span aria-hidden="true">·</span>
          <span>
            &copy; {year} Gaffer. All rights reserved.
          </span>
        </div>

        <nav aria-label="Footer navigation">
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

        <span className="text-xs">v{APP_VERSION}</span>
      </div>
    </footer>
  );
}

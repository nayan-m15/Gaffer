import { Link } from "react-router-dom";
import { SportLogo } from "@/components/brand/SportLogo";
import { APP_VERSION } from "@/lib/version";

interface FooterLink {
  label: string;
  path: string;
}

const FOOTER_LINKS: FooterLink[] = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Features", path: "/#features" },
  { label: "How It Works", path: "/#how-it-works" },
];

/**
 * Application footer for authenticated views.
 *
 * Rendered once inside AppShell so it appears consistently at the bottom
 * of every signed-in page (Dashboard, Roster, Events, Stats, Team).
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border px-6 py-6 text-sm text-muted-foreground sm:px-8">
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
            {FOOTER_LINKS.map((link) => (
              <li key={link.path}>
                <Link
                  to={link.path}
                  className="transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <span className="text-xs">v{APP_VERSION}</span>
      </div>
    </footer>
  );
}

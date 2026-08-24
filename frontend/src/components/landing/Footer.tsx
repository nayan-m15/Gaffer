import { SportLogo } from "@/components/brand/SportLogo";
import { brand } from "@/data/brand";

/**
 * Public-site footer links.
 *
 * Only routes that actually exist in the app — there's no Terms of
 * Service / Privacy Policy page yet, so those aren't linked here.
 */
const FOOTER_LINKS = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Log In", href: "/login" },
  { label: "Get Started", href: "/signup" },
] as const;

/**
 * Footer — Shared marketing-site footer.
 *
 * Used at the bottom of the public pages (Landing, Features, How It Works).
 * Always rendered with the same dark cinematic treatment as the Features /
 * How It Works stadium backdrop (bg-[#0B1218], white/opacity text) so it
 * looks identical everywhere it's used, regardless of the site theme toggle.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-[#0B1218]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Brand + copyright */}
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="flex items-center gap-1.5 text-white transition-opacity hover:opacity-80"
            >
              <SportLogo size={18} className="rounded" />
              <span className="text-xs font-semibold tracking-tight">
                {brand.name}
              </span>
            </a>
            <span aria-hidden="true" className="text-white/20">
              &middot;
            </span>
            <span className="text-xs text-white/35">
              &copy; {year} All rights reserved.
            </span>
          </div>

          {/* Links */}
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-xs text-white/60 transition-colors hover:text-white"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}

import { SportLogo } from "@/components/brand/SportLogo";
import { brand } from "@/data/brand";

/**
 * Landing-page footer navigation.
 *
 * Anchors to the three core chapters of the landing-page story.  The `href`
 * values are root-relative so the links also resolve when the footer is
 * rendered from another public route.
 */
const FOOTER_LINKS = [
  { label: "Philosophy", href: "/#philosophy" },
  { label: "Tactical Pitch", href: "/#tactics" },
  { label: "Analytics", href: "/#analytics" },
] as const;

/**
 * Footer — custom marketing footer for the landing page.
 *
 * A brand block (logo, wordmark, tagline, copyright) on the left with a
 * chapter navigation column on the right.  Every colour goes through the
 * semantic theme tokens (`background`, `foreground`, `muted-foreground`,
 * `border`, `brand`) so the footer follows the navbar's light / dark toggle
 * driven by the `.dark` class on `<html>`.
 *
 * Rendered with `relative z-10` — the same layer as `<main>` — so it paints
 * above the fixed stadium backdrop behind the page.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="animate-on-scroll relative z-10 border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between lg:gap-16">
          {/* ── Brand block ─────────────────────────────────────────────── */}
          <div className="max-w-sm">
            <a
              href="/#home"
              className="inline-flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-80"
            >
              <SportLogo size={32} className="rounded" />
              <span className="font-display text-lg font-bold tracking-tight">
                {brand.name}
              </span>
            </a>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {brand.tagline}
            </p>

            <p className="mt-6 text-xs text-muted-foreground">
              &copy; {year} {brand.name}. All rights reserved.
            </p>
          </div>

          {/* ── Chapter navigation ──────────────────────────────────────── */}
          <nav aria-label="Footer navigation" className="shrink-0">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-brand">
              Explore
            </p>

            <ul className="mt-4 space-y-3">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="group inline-flex items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className="h-px w-3 rounded-full bg-border transition-all duration-200 group-hover:w-5 group-hover:bg-brand"
                    />
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

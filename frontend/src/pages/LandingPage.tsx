import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Footer } from "@/components/landing/Footer";

/**
 * LandingPage — Top-level page component for the marketing landing page.
 *
 * Phase 1 currently renders only:
 *   1. Navbar (sticky, responsive, with theme toggle)
 *   2. Hero section (headline, CTAs, dashboard mockup)
 *   3. Footer (brand, site links, copyright)
 *
 * Future phases will append additional sections between the Hero and
 * Footer (features, how-it-works, statistics, calendar, final CTA, etc.).
 *
 * `main` is a flex column so the Hero (itself `flex-1`) fills exactly the
 * space between the navbar and the footer while there's only one section.
 * Once more sections land below it, drop `flex-1` from Hero so it sizes to
 * its own content instead of stretching to fill the page.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex flex-1 flex-col">
        <Hero />

        {/* ── Phase 2+ sections will be inserted here ───────────────────── */}
      </main>

      <Footer />
    </div>
  );
}

import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";

/**
 * LandingPage — Top-level page component for the marketing landing page.
 *
 * Phase 1 currently renders only:
 *   1. Navbar (sticky, responsive, with theme toggle)
 *   2. Hero section (headline, CTAs, dashboard mockup)
 *
 * Future phases will append additional sections below the Hero (features,
 * how-it-works, statistics, calendar, final CTA, footer, etc.).
 */
export default function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />

      {/* ── Phase 2+ sections will be inserted here ─────────────────────── */}
    </>
  );
}

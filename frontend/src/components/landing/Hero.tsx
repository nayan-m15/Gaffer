import { ArrowRight, LogIn } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/data/brand";
import { cn } from "@/lib/utils";

/**
 * Hero — The primary marketing section at the top of the landing page.
 *
 * Composition (all breakpoints):
 * ┌──────────────────────────────────────────────────┐
 * │              [Eyebrow badge]                     │
 * │              Headline                            │
 * │              Description                         │
 * │         [Get Started]  [Log In]                  │
 * │         Free — no credit card                    │
 * └──────────────────────────────────────────────────┘
 *
 * The background uses a dark cinematic treatment with visible football-pitch
 * markings, a subtle grass tint and floodlight gradients to evoke a matchday
 * atmosphere without competing with the headline or CTA buttons.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-[#0B1218]"
    >
      {/* ── Atmospheric background layer ──────────────────────────────── */}
      <HeroBackground />

      {/* ── Content grid ──────────────────────────────────────────────── */}
      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8 lg:pb-32 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          {/* Eyebrow */}
          <span
            className="mb-5 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-white/70 backdrop-blur-sm animate-fade-in"
          >
            <span className="size-1.5 rounded-full bg-brand animate-pulse-subtle" />
            For Amateur Football Coaches
          </span>

          {/* Headline — exact wording from the product spec */}
          <h1
            id="hero-heading"
            className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.5rem] xl:text-6xl animate-fade-in-up"
          >
            {brand.tagline}
          </h1>

          {/* Supporting description */}
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg animate-fade-in-up animation-delay-150">
            {brand.description}
          </p>

          {/* CTA buttons */}
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center animate-fade-in-up animation-delay-300">
            <a
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full gap-2 bg-brand text-brand-foreground font-semibold hover:bg-brand-light shadow-lg shadow-brand/20 sm:w-auto",
              )}
            >
              Get Started
              <ArrowRight className="size-4" />
            </a>

            <a
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto",
              )}
            >
              <LogIn className="size-4" />
              Log In
            </a>
          </div>

          {/* Trust signal */}
          <p className="mt-5 text-xs text-white/30 animate-fade-in-up animation-delay-450">
            Free to get started — no credit card required.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Private — Hero background
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Renders the dark atmospheric football-pitch background.
 *
 * Uses layered CSS gradients and visible geometric pitch markings to create a
 * matchday feel without any external images.  The effect is purely decorative
 * and hidden from assistive technology.
 */
function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Base gradient — dark with a cool blue-teal undertone */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1218] via-[#0A1419] to-[#0B1218]" />

      {/* Subtle grass / pitch-green tint — gives the feel of a real pitch */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/[0.08] via-emerald-800/[0.06] to-emerald-900/[0.04]" />

      {/* Floodlight glow — top centre (brighter for atmosphere) */}
      <div className="absolute left-1/2 top-0 h-[600px] w-[1000px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 blur-[150px]" />

      {/* Secondary warm floodlight — lower sides for depth */}
      <div className="absolute -left-20 top-1/3 h-[300px] w-[400px] rounded-full bg-brand/5 blur-[120px]" />
      <div className="absolute -right-20 top-1/3 h-[300px] w-[400px] rounded-full bg-brand/5 blur-[120px]" />

      {/* Softer vignette — lets pitch markings show through */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,#0B1218_100%)]" />

      {/* ── Full pitch markings SVG ─────────────────────────────────────── */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.07]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Outer boundary — touchlines and goal lines */}
        <rect
          x="100" y="60" width="1000" height="680"
          stroke="white" strokeWidth="2" fill="none"
        />

        {/* Halfway line */}
        <line x1="600" y1="60" x2="600" y2="740" stroke="white" strokeWidth="2" />

        {/* Centre circle */}
        <circle cx="600" cy="400" r="95" stroke="white" strokeWidth="2" fill="none" />

        {/* Centre spot */}
        <circle cx="600" cy="400" r="5" fill="white" />

        {/* Left penalty area */}
        <rect x="100" y="220" width="170" height="360" stroke="white" strokeWidth="2" fill="none" />

        {/* Left goal area (six-yard box) */}
        <rect x="100" y="310" width="60" height="180" stroke="white" strokeWidth="2" fill="none" />

        {/* Left penalty spot */}
        <circle cx="210" cy="400" r="4" fill="white" />

        {/* Left penalty arc */}
        <path d="M 270 310 A 95 95 0 0 1 270 490" stroke="white" strokeWidth="2" fill="none" />

        {/* Right penalty area */}
        <rect x="930" y="220" width="170" height="360" stroke="white" strokeWidth="2" fill="none" />

        {/* Right goal area (six-yard box) */}
        <rect x="1040" y="310" width="60" height="180" stroke="white" strokeWidth="2" fill="none" />

        {/* Right penalty spot */}
        <circle cx="990" cy="400" r="4" fill="white" />

        {/* Right penalty arc */}
        <path d="M 930 310 A 95 95 0 0 0 930 490" stroke="white" strokeWidth="2" fill="none" />

        {/* Corner arcs */}
        <path d="M 100 75 A 15 15 0 0 1 115 60" stroke="white" strokeWidth="2" fill="none" />
        <path d="M 1085 60 A 15 15 0 0 1 1100 75" stroke="white" strokeWidth="2" fill="none" />
        <path d="M 115 740 A 15 15 0 0 1 100 725" stroke="white" strokeWidth="2" fill="none" />
        <path d="M 1100 725 A 15 15 0 0 1 1085 740" stroke="white" strokeWidth="2" fill="none" />
      </svg>
    </div>
  );
}

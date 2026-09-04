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
      className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col justify-center items-center overflow-hidden bg-background pb-12"
    >
      {/* ── Atmospheric background layer ──────────────────────────────── */}
      <HeroBackground />

      {/* ── Content grid ──────────────────────────────────────────────── */}
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Eyebrow */}
          <span
            className="mb-5 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground animate-fade-in"
          >
            <span className="size-1.5 rounded-full bg-brand animate-pulse-subtle" />
            For Amateur Football Coaches
          </span>

          {/* Headline — exact wording from the product spec */}
          <h1
            id="hero-heading"
            className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem] xl:text-6xl animate-fade-in-up"
          >
            {brand.tagline}
          </h1>

          {/* Supporting description */}
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg animate-fade-in-up animation-delay-150">
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
                "w-full gap-2 sm:w-auto",
              )}
            >
              <LogIn className="size-4" />
              Log In
            </a>
          </div>

          {/* Trust signal */}
          <p className="mt-5 text-xs text-muted-foreground animate-fade-in-up animation-delay-450">
            Free to get started — no credit card required.
          </p>
        </div>
      </div>

      {/* Scroll indicator prompt */}
      <a
        href="#philosophy"
        className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-muted-foreground text-[10px] sm:text-xs font-mono tracking-widest uppercase transition-colors hover:text-foreground animate-bounce-slow"
        aria-label="Scroll to explore"
      >
        <span>Scroll to enter</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </a>
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
      {/* Base gradient — theme-aware background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />

      {/* Subtle grass / pitch-green tint — gives the feel of a real pitch */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/[0.06] via-emerald-800/[0.04] to-emerald-900/[0.02] dark:from-emerald-900/[0.08] dark:via-emerald-800/[0.06] dark:to-emerald-900/[0.04]" />

      {/* Floodlight glow — top centre (brighter for atmosphere) */}
      <div className="absolute left-1/2 top-0 h-[600px] w-[1000px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-[150px] dark:bg-brand/15" />

      {/* Secondary warm floodlight — lower sides for depth */}
      <div className="absolute -left-20 top-1/3 h-[300px] w-[400px] rounded-full bg-brand/5 blur-[120px]" />
      <div className="absolute -right-20 top-1/3 h-[300px] w-[400px] rounded-full bg-brand/5 blur-[120px]" />

      {/* Softer vignette — lets pitch markings show through */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,var(--background)_100%)]" />

      {/* ── Full pitch markings SVG ─────────────────────────────────────── */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.04] dark:opacity-[0.07]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Outer boundary — touchlines and goal lines */}
        <rect
          x="100" y="60" width="1000" height="680"
          stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground"
        />

        {/* Halfway line */}
        <line x1="600" y1="60" x2="600" y2="740" stroke="currentColor" strokeWidth="2" className="text-foreground" />

        {/* Centre circle */}
        <circle cx="600" cy="400" r="95" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />

        {/* Centre spot */}
        <circle cx="600" cy="400" r="5" fill="currentColor" className="text-foreground" />

        {/* Left penalty area */}
        <rect x="100" y="220" width="170" height="360" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />

        {/* Left goal area (six-yard box) */}
        <rect x="100" y="310" width="60" height="180" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />

        {/* Left penalty spot */}
        <circle cx="210" cy="400" r="4" fill="currentColor" className="text-foreground" />

        {/* Left penalty arc */}
        <path d="M 270 310 A 95 95 0 0 1 270 490" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />

        {/* Right penalty area */}
        <rect x="930" y="220" width="170" height="360" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />

        {/* Right goal area (six-yard box) */}
        <rect x="1040" y="310" width="60" height="180" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />

        {/* Right penalty spot */}
        <circle cx="990" cy="400" r="4" fill="currentColor" className="text-foreground" />

        {/* Right penalty arc */}
        <path d="M 930 310 A 95 95 0 0 0 930 490" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />

        {/* Corner arcs */}
        <path d="M 100 75 A 15 15 0 0 1 115 60" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />
        <path d="M 1085 60 A 15 15 0 0 1 1100 75" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />
        <path d="M 115 740 A 15 15 0 0 1 100 725" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />
        <path d="M 1100 725 A 15 15 0 0 1 1085 740" stroke="currentColor" strokeWidth="2" fill="none" className="text-foreground" />
      </svg>
    </div>
  );
}

/**
 * SVG-based responsive football pitch visualization.
 *
 * Supports two orientations:
 * - **vertical** (mobile/tablet): 2:3 aspect ratio, attack direction top-to-bottom
 * - **horizontal** (desktop): 3:2 aspect ratio, attack direction left-to-right
 *
 * Renders standard football markings using CSS variables from the existing
 * design system so the pitch looks correct in both light and dark modes.
 *
 * Includes a decorative city skyline background that sits behind the pitch.
 *
 * Children are rendered as an overlay layer positioned absolutely over the
 * pitch surface, allowing player cards to be placed via percentage coordinates.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CitySkyline } from "./CitySkyline";

interface FootballPitchProps {
  children?: ReactNode;
  className?: string;
  /** When true, renders a landscape pitch (attack left-to-right). */
  horizontal?: boolean;
}

export function FootballPitch({ children, className, horizontal = false }: FootballPitchProps) {
  return (
    <div className={cn("relative mx-auto w-full", className)}>
      {/* City skyline backdrop behind the pitch */}
      <CitySkyline className="absolute inset-x-0 bottom-0 top-[10%] pointer-events-none z-0" />

      <div
        className={cn(
          "relative z-[1] mx-auto w-full",
          horizontal
            ? "aspect-[3/2] max-w-[860px]"
            : "aspect-[2/3] max-w-[540px]",
        )}
      >
        {/* Pitch surface */}
        <div
          className="absolute inset-0 rounded-lg border border-border/40 overflow-hidden"
          style={{
            background: horizontal
              ? "linear-gradient(to right, color-mix(in oklch, var(--primary) 12%, var(--background)) 0%, color-mix(in oklch, var(--primary) 8%, var(--background)) 100%)"
              : "linear-gradient(to bottom, color-mix(in oklch, var(--primary) 12%, var(--background)) 0%, color-mix(in oklch, var(--primary) 8%, var(--background)) 100%)",
          }}
        >
          {horizontal ? <HorizontalMarkings /> : <VerticalMarkings />}
        </div>

        {/* Player overlay layer */}
        <div className="absolute inset-0" role="group" aria-label="Pitch positions">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Vertical pitch markings (mobile/tablet) ────────────────────────────── */
/* viewBox 100 x 150 — opponent goal at top, own goal at bottom              */

function VerticalMarkings() {
  return (
    <svg
      viewBox="0 0 100 150"
      className="absolute inset-0 size-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Outer boundary */}
      <rect x="2" y="2" width="96" height="146" fill="none" stroke="currentColor" strokeWidth="0.4" className="text-muted-foreground/25" />
      {/* Halfway line */}
      <line x1="2" y1="75" x2="98" y2="75" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      {/* Centre circle + spot */}
      <circle cx="50" cy="75" r="12" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <circle cx="50" cy="75" r="0.6" className="fill-muted-foreground/25" />

      {/* Top penalty area */}
      <rect x="17" y="2" width="66" height="24" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <rect x="30" y="2" width="40" height="10" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <circle cx="50" cy="18" r="0.5" className="fill-muted-foreground/25" />
      <path d="M 37 26 A 12 12 0 0 0 63 26" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <rect x="38" y="-1.5" width="24" height="3.5" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/30" />

      {/* Top corner arcs */}
      <path d="M 2 5.5 A 3.5 3.5 0 0 0 5.5 2" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <path d="M 94.5 2 A 3.5 3.5 0 0 0 98 5.5" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />

      {/* Bottom penalty area */}
      <rect x="17" y="124" width="66" height="24" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <rect x="30" y="138" width="40" height="10" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <circle cx="50" cy="132" r="0.5" className="fill-muted-foreground/25" />
      <path d="M 37 124 A 12 12 0 0 1 63 124" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <rect x="38" y="148" width="24" height="3.5" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/30" />

      {/* Bottom corner arcs */}
      <path d="M 5.5 148 A 3.5 3.5 0 0 0 2 144.5" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <path d="M 98 144.5 A 3.5 3.5 0 0 0 94.5 148" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
    </svg>
  );
}

/* ─── Horizontal pitch markings (desktop) ────────────────────────────────── */
/* viewBox 150 x 100 — own goal at left, opponent goal at right              */

function HorizontalMarkings() {
  return (
    <svg
      viewBox="0 0 150 100"
      className="absolute inset-0 size-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Outer boundary */}
      <rect x="2" y="2" width="146" height="96" fill="none" stroke="currentColor" strokeWidth="0.4" className="text-muted-foreground/25" />
      {/* Halfway line */}
      <line x1="75" y1="2" x2="75" y2="98" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      {/* Centre circle + spot */}
      <circle cx="75" cy="50" r="12" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <circle cx="75" cy="50" r="0.6" className="fill-muted-foreground/25" />

      {/* Left penalty area (own end) */}
      <rect x="2" y="17" width="24" height="66" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <rect x="2" y="30" width="10" height="40" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <circle cx="18" cy="50" r="0.5" className="fill-muted-foreground/25" />
      <path d="M 26 37 A 12 12 0 0 1 26 63" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <rect x="-1.5" y="38" width="3.5" height="24" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/30" />

      {/* Left corner arcs */}
      <path d="M 5.5 2 A 3.5 3.5 0 0 0 2 5.5" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <path d="M 2 94.5 A 3.5 3.5 0 0 0 5.5 98" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />

      {/* Right penalty area (opponent end) */}
      <rect x="124" y="17" width="24" height="66" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <rect x="138" y="30" width="10" height="40" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <circle cx="132" cy="50" r="0.5" className="fill-muted-foreground/25" />
      <path d="M 124 37 A 12 12 0 0 0 124 63" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <rect x="148" y="38" width="3.5" height="24" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/30" />

      {/* Right corner arcs */}
      <path d="M 144.5 2 A 3.5 3.5 0 0 1 148 5.5" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
      <path d="M 148 94.5 A 3.5 3.5 0 0 1 144.5 98" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/20" />
    </svg>
  );
}

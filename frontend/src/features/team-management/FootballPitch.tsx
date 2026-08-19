/**
 * SVG-based responsive football pitch visualization.
 *
 * Renders standard football markings (boundary, halfway line, centre circle,
 * penalty areas, goal areas, goals, corner arcs) using CSS variables from the
 * existing design system so the pitch looks correct in both light and dark modes.
 *
 * The pitch is oriented with the opponent's goal at the top (y = 0) and
 * the own goal at the bottom (y = 100).
 *
 * Children are rendered as an overlay layer positioned absolutely over the
 * pitch surface, allowing player cards to be placed via percentage coordinates.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FootballPitchProps {
  children?: ReactNode;
  className?: string;
}

export function FootballPitch({ children, className }: FootballPitchProps) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[540px]",
        // ~2:3 aspect ratio for a vertical pitch view
        "aspect-[2/3]",
        className,
      )}
    >
      {/* Pitch surface */}
      <div
        className="absolute inset-0 rounded-lg border border-border/40"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in oklch, var(--primary) 12%, var(--background)) 0%, color-mix(in oklch, var(--primary) 8%, var(--background)) 100%)",
        }}
      >
        {/* SVG pitch markings */}
        <svg
          viewBox="0 0 100 150"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Outer boundary */}
          <rect
            x="2"
            y="2"
            width="96"
            height="146"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
            className="text-muted-foreground/25"
          />

          {/* Halfway line */}
          <line
            x1="2"
            y1="75"
            x2="98"
            y2="75"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Centre circle */}
          <circle
            cx="50"
            cy="75"
            r="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Centre spot */}
          <circle
            cx="50"
            cy="75"
            r="0.6"
            className="fill-muted-foreground/25"
          />

          {/* ─── Top half (opponent's end) ──────────────────────────────── */}

          {/* Top penalty area */}
          <rect
            x="17"
            y="2"
            width="66"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Top goal area */}
          <rect
            x="30"
            y="2"
            width="40"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Top penalty spot */}
          <circle
            cx="50"
            cy="18"
            r="0.5"
            className="fill-muted-foreground/25"
          />

          {/* Top penalty arc */}
          <path
            d="M 37 26 A 12 12 0 0 0 63 26"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Top goal */}
          <rect
            x="38"
            y="-1.5"
            width="24"
            height="3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/30"
          />

          {/* Top-left corner arc */}
          <path
            d="M 2 5.5 A 3.5 3.5 0 0 0 5.5 2"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Top-right corner arc */}
          <path
            d="M 94.5 2 A 3.5 3.5 0 0 0 98 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* ─── Bottom half (own end) ──────────────────────────────────── */}

          {/* Bottom penalty area */}
          <rect
            x="17"
            y="124"
            width="66"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Bottom goal area */}
          <rect
            x="30"
            y="138"
            width="40"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Bottom penalty spot */}
          <circle
            cx="50"
            cy="132"
            r="0.5"
            className="fill-muted-foreground/25"
          />

          {/* Bottom penalty arc */}
          <path
            d="M 37 124 A 12 12 0 0 1 63 124"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Bottom goal */}
          <rect
            x="38"
            y="148"
            width="24"
            height="3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/30"
          />

          {/* Bottom-left corner arc */}
          <path
            d="M 5.5 148 A 3.5 3.5 0 0 0 2 144.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />

          {/* Bottom-right corner arc */}
          <path
            d="M 98 144.5 A 3.5 3.5 0 0 0 94.5 148"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            className="text-muted-foreground/20"
          />
        </svg>
      </div>

      {/* Player overlay layer */}
      <div className="absolute inset-0" role="group" aria-label="Pitch positions">
        {children}
      </div>
    </div>
  );
}

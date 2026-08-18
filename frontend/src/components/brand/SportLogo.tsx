/**
 * SportLogo — Custom SVG brand mark for the Sport Coaching Tool.
 *
 * The mark combines three visual ideas:
 *   1. A football (the circle with inner pentagon seams).
 *   2. A tactical pitch (the thin horizontal lines behind the ball).
 *   3. A directional / play element (the subtle forward chevron).
 *
 * The component accepts an optional `size` prop (in px) so it can be rendered
 * at navbar, favicon or hero scale.  It inherits its foreground colour from
 * `currentColor` so it automatically adapts to light and dark themes.
 */

interface SportLogoProps {
  /** Width & height in pixels — defaults to 32 (navbar size). */
  size?: number;
  /** Additional CSS class names forwarded to the root `<svg>`. */
  className?: string;
}

export function SportLogo({ size = 32, className }: SportLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* ── Tactical pitch lines ──────────────────────────────────────── */}
      <line
        x1="4" y1="12" x2="36" y2="12"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.2"
      />
      <line
        x1="4" y1="28" x2="36" y2="28"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.2"
      />
      {/* Centre line */}
      <line
        x1="20" y1="6" x2="20" y2="34"
        stroke="currentColor"
        strokeWidth="0.75"
        opacity="0.12"
      />

      {/* ── Football outline ──────────────────────────────────────────── */}
      <circle
        cx="20" cy="20" r="10"
        stroke="currentColor"
        strokeWidth="2"
      />

      {/* ── Inner pentagon seam pattern ───────────────────────────────── */}
      <polygon
        points="20,13 25.5,17 23.5,23.5 16.5,23.5 14.5,17"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />

      {/* ── Forward / play chevron ────────────────────────────────────── */}
      <polyline
        points="28,16 33,20 28,24"
        stroke="var(--brand, #00D99A)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Brand configuration for the Sport Coaching Tool.
 *
 * Centralises the product name, tagline and design tokens so they can be
 * updated in a single place and referenced throughout every component.
 */

export const brand = {
  /** Display name shown in the navbar, hero and meta tags. */
  name: "GAFFER",

  /** Primary marketing tagline — do not alter wording without product approval. */
  tagline: "The football coaching platform built for the touchline.",

  /** Short supporting copy used in the hero description. */
  description:
    "Manage your squad, track matches in real time and build a complete history of your team\u2019s performance \u2014 all from one place.",
} as const;

/**
 * Colour tokens that map to the brand palette defined in the spec.
 *
 * These hex values are mirrored in `index.css` as CSS custom properties so
 * Tailwind and shadcn/ui components can consume them.  Keep this object as
 * the single source of truth for brand colours.
 */
export const brandColors = {
  /* ── Primary accent — emerald / teal ─────────────────────────────────── */
  /** Primary emerald — CTA buttons, logo accent, active states. */
  primary: "#16d99a",
  /** Darker emerald — hover / pressed states. */
  primaryDark: "#10bf88",
  /** Lighter emerald — highlights and secondary emphasis. */
  primaryLight: "#48e3af",

  /* ── Dark-mode surfaces ──────────────────────────────────────────────── */
  /** Near-black page background. */
  darkBackground: "#090A0B",
  /** Neutral graphite surface for cards / panels. */
  darkSurface: "#111315",
  /** Elevated dark surface for nested elements. */
  darkSurfaceElevated: "#1A1D1F",
  /** Subtle border colour in dark mode. */
  darkBorder: "#2A2E31",

  /* ── Light-mode surfaces ─────────────────────────────────────────────── */
  /** Warm off-white used for light-mode backgrounds. */
  lightBackground: "#F5F3F0",
  /** Pure white surface for light-mode cards. */
  lightSurface: "#FFFFFF",
  /** Subtle border colour in light mode. */
  lightBorder: "#D9D6D2",

  /* ── Typography ──────────────────────────────────────────────────────── */
  /** Primary text colour in light mode. */
  darkText: "#171717",
  /** Primary text colour in dark mode. */
  lightText: "#ecefed",
  /** Secondary / muted text. */
  mutedText: "#9ca39f",

  /* ── Semantic status colours ─────────────────────────────────────────── */
  /** Warning / draw / neutral — amber. */
  warning: "#d6a447",
  /** Danger / error / loss — red (reserved for negative states only). */
  danger: "#e36a6d",
} as const;

/**
 * Brand configuration for the Sport Coaching Tool.
 *
 * Centralises the product name, tagline and design tokens so they can be
 * updated in a single place and referenced throughout every component.
 */

export const brand = {
  /** Display name shown in the navbar, hero and meta tags. */
  name: "Sport Coaching Tool",

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
  primary: "#00D99A",
  /** Darker emerald — hover / pressed states. */
  primaryDark: "#00CFA0",
  /** Lighter emerald — highlights and secondary emphasis. */
  primaryLight: "#20E6A6",

  /* ── Dark-mode surfaces ──────────────────────────────────────────────── */
  /** Near-black background with blue-gray undertone. */
  darkBackground: "#0B1218",
  /** Dark blue-gray surface for cards / panels. */
  darkSurface: "#17212B",
  /** Elevated dark surface for nested elements. */
  darkSurfaceElevated: "#1A2530",
  /** Subtle border colour in dark mode. */
  darkBorder: "#233747",

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
  lightText: "#E8ECEF",
  /** Secondary / muted text. */
  mutedText: "#8E9BA8",

  /* ── Semantic status colours ─────────────────────────────────────────── */
  /** Warning / draw / neutral — amber. */
  warning: "#FFBE2E",
  /** Danger / error / loss — red (reserved for negative states only). */
  danger: "#FF5B5F",
} as const;

/**
 * Where the mini pitch lives inside its SVG viewBox, and how the shared 0–100
 * pitch space maps onto it.
 *
 * The viewBox is roughly a real pitch's 68 × 105 proportions with a little room
 * around the touchlines for the markers, and the opponent's goal is at the top so
 * it matches every other pitch in the app.
 */

/**
 * The drawn area. Taller than the playing area below so the goalkeeper's
 * caption sits on the grass behind the goal rather than off the edge.
 */
export const PITCH_VIEWBOX = { width: 100, height: 146 } as const;

/** The playing area inside the viewBox, in SVG units. */
export const PITCH_BOX = {
  left: 3,
  top: 3,
  width: 94,
  height: 134,
} as const;

/** Pitch space x (0 = left touchline, 100 = right) → SVG units. */
export function toSvgX(x: number): number {
  return PITCH_BOX.left + (x / 100) * PITCH_BOX.width;
}

/** Pitch space y (0 = opponent's goal, 100 = our own) → SVG units. */
export function toSvgY(y: number): number {
  return PITCH_BOX.top + (y / 100) * PITCH_BOX.height;
}

/**
 * Marker colours for the four position roles, shared by every pitch rendering
 * in the app (the Confirm Squad formation preview and the Team Tactics mini
 * pitch) so a centre back is the same colour wherever a coach sees one.
 *
 * The values are fixed hex rather than theme tokens because they always sit on
 * the dark green pitch, not on the page background.
 */

import type { PositionRole } from "./types";

export interface RoleMarker {
  /** Marker fill. */
  fill: string;
  /** Soft outer glow, used to lift the marker off the pitch stripes. */
  glow: string;
}

export const ROLE_MARKER: Record<PositionRole, RoleMarker> = {
  GK: { fill: "#38bdf8", glow: "rgba(56, 189, 248, 0.55)" },
  DEF: { fill: "#72a7d5", glow: "rgba(59, 130, 246, 0.55)" },
  MID: { fill: "#8b5cf6", glow: "rgba(139, 92, 246, 0.55)" },
  FWD: { fill: "#f97316", glow: "rgba(249, 115, 22, 0.55)" },
};

/** Muted marker used for opposition players on a tactical preview. */
export const OPPONENT_MARKER = {
  fill: "#9ca3af",
  stroke: "rgba(255, 255, 255, 0.45)",
} as const;

/**
 * Types for the live tactical preview shown beside the Team Tactics controls.
 *
 * Positions use the same pitch space as the rest of the app (see
 * `features/team-management/types.ts`): x 0–100 left→right touchline, y 0–100
 * with the opponent's goal at y = 0 and our own goal at y = 100. The mini pitch
 * does the mapping into SVG units, so every function in `tacticalPositioning`
 * stays in that shared space.
 */

import type { PositionRole } from "@/features/team-management/types";

/**
 * Which tactical control the coach most recently touched. The preview panel
 * explains that setting and the mini pitch switches to the scenario that
 * demonstrates it.
 *
 * The names match the `GamePlanTactics` field they describe, so a control can
 * declare its own key without a lookup table.
 */
export type ActiveTacticalSetting =
  | "defensiveStyle"
  | "defensiveWidth"
  | "defensiveDepth"
  | "offensiveStyle"
  | "offensiveWidth"
  | "playersInBox"
  | "cornersCommitment"
  | "freeKicksCommitment";

/** Which situation the mini pitch is drawing. */
export type TacticalScenario =
  | "defensive"
  | "attacking"
  | "corner"
  | "freeKick";

/**
 * One marker on the mini pitch. `id` is stable across tactical changes — open
 * play, corners and free kicks all reposition the same formation slots — so the
 * SVG groups are reused and React keeps the CSS transition running instead of
 * remounting the marker.
 */
export interface TacticalPlayer {
  id: string;
  /** Short position caption ("LB", "ST") drawn under the marker. */
  label: string;
  role: PositionRole;
  x: number;
  y: number;
  /** Set for players doing the thing the current tactic describes (pressing). */
  highlighted?: boolean;
  /** Reserved for the real-player pass: which athlete fills this slot. */
  playerId?: string | null;
}

/** A muted opposition marker, drawn only where it explains the tactic. */
export interface TacticalOpponent {
  id: string;
  x: number;
  y: number;
  /** The opponent on the ball, drawn slightly stronger. */
  onBall?: boolean;
}

/** Everything the mini pitch needs to draw one tactical situation. */
export interface TacticalShape {
  scenario: TacticalScenario;
  players: TacticalPlayer[];
  opponents: TacticalOpponent[];
  /** Ball position, or null when the situation has no meaningful ball. */
  ball: { x: number; y: number } | null;
}

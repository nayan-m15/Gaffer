/**
 * Type definitions for the Team Management / Tactical Board feature.
 *
 * These types model formations, pitch positions, lineup state, and the
 * drag-and-drop interactions used to configure a starting XI.
 */

/* ─── Formation types ─────────────────────────────────────────────────── */

/** Role category for a position on the pitch. */
export type PositionRole = "GK" | "DEF" | "MID" | "FWD";

/**
 * A single position slot within a formation.
 *
 * Coordinates are expressed as percentages (0–100) relative to the pitch
 * container so that rendering remains responsive at every viewport size.
 *
 * - `x`: horizontal position (0 = left touchline, 100 = right touchline)
 * - `y`: vertical position (0 = opponent goal, 100 = own goal)
 */
export interface FormationPosition {
  /** Stable identifier unique within a formation (e.g. "433-lb", "433-cm1"). */
  id: string;
  /** Short display label shown on the pitch (e.g. "LB", "CM"). */
  label: string;
  /** Role category used for remapping on formation changes. */
  role: PositionRole;
  /** Horizontal percentage (0–100). */
  x: number;
  /** Vertical percentage (0–100). */
  y: number;
}

/** A complete formation definition (e.g. 4-3-3, 4-4-2). */
export interface Formation {
  /** Unique identifier used as the formation key (e.g. "4-3-3"). */
  id: string;
  /** Human-readable name (e.g. "4-3-3"). */
  name: string;
  /** Exactly 11 positions including one goalkeeper. */
  positions: FormationPosition[];
}

/* ─── Lineup state ─────────────────────────────────────────────────────── */

/**
 * Maps formation position IDs to athlete IDs.
 *
 * A `null` value means the position slot is currently unoccupied.
 */
export type PitchAssignments = Record<string, string | null>;

/** Complete tactical lineup state managed by the useLineupState hook. */
export interface LineupState {
  /** ID of the currently selected formation. */
  formationId: string;
  /** Position-to-athlete mapping for the starting XI. */
  assignments: PitchAssignments;
  /** Athlete IDs currently on the substitutes bench. */
  substituteIds: string[];
}

/**
 * A previously saved lineup, as loaded from the backend.
 *
 * Used to hydrate `useLineupState` on first load so a coach's saved XI
 * survives a page reload.
 */
export type SavedLineup = LineupState;

/* ─── Drag-and-drop ────────────────────────────────────────────────────── */

/** Describes the item being dragged during a DnD interaction. */
export interface DragItem {
  /** ID of the athlete being dragged. */
  athleteId: string;
  /** Whether the drag originated from the pitch or the substitutes area. */
  source: "pitch" | "subs";
  /** If source is "pitch", the position ID the player was occupying. */
  positionId?: string;
}

/** Payload stored in the DataTransfer object during native HTML5 DnD. */
export interface DragPayload {
  athleteId: string;
  source: "pitch" | "subs";
  positionId: string | null;
}

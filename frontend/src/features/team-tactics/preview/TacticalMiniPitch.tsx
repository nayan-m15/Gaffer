/**
 * The team's mini pitch, shared by the Tactics and Roles screens.
 *
 * In `tactics` mode it draws the shape the current settings produce, re-rendering
 * as a slider moves. In `roles` mode it draws the formation's own shape with the
 * starting XI on it, highlights the player holding the selected role, and lets a
 * coach click or tab onto a team-mate to hand them that role. Both modes share
 * the pitch markings, the coordinate mapping, the markers and the animation —
 * only the shape and the marker contents differ.
 *
 * All the position maths lives in `tacticalPositioning`; this file maps the
 * shared 0–100 pitch space onto SVG units and draws markers.
 *
 * Markers are `<g>` elements positioned with a CSS transform and keyed by their
 * formation slot id, so React reuses the same node when a tactic changes and the
 * browser tweens the move instead of snapping it.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { athleteShortName } from "@/features/team-management/athlete-display";
import {
  OPPONENT_MARKER,
  ROLE_MARKER,
} from "@/features/team-management/role-colors";
import type { Formation } from "@/features/team-management/types";
import type { BackendAthlete } from "@/services/athletes";
import type { GamePlanTactics } from "@/services/gamePlans";
import { PITCH_VIEWBOX, toSvgX, toSvgY } from "./pitchGeometry";
import { calculateTacticalShape, formationShape } from "./tacticalPositioning";
import { TacticalPitchLines } from "./TacticalPitchLines";
import type {
  ActiveTacticalSetting,
  TacticalOpponent,
  TacticalPlayer,
} from "./tacticalTypes";

/** Marker geometry, in SVG units. */
const PLAYER_RADIUS = 3.4;
const OPPONENT_RADIUS = 2.9;
const BALL_RADIUS = 1.6;
const LABEL_OFFSET = 7.2;
const NAME_OFFSET = 11;
const HIGHLIGHT_RADIUS = 5.3;
const FOCUS_RADIUS = 6.6;
const HIGHLIGHT_COLOR = "#fbbf24";
const BADGE_OFFSET = { x: 3.6, y: -3.6 };

/** Who the pitch is drawn for. */
export type PitchMode = "tactics" | "roles";

/** Everything the roles mode needs; ignored in tactics mode. */
export interface PitchRolesConfig {
  /** Formation slot id → athlete id, straight off the squad board. */
  assignments: Record<string, string | null>;
  athleteById: Map<string, BackendAthlete>;
  /** The athlete holding the role currently being edited, if any. */
  highlightedAthleteId?: string | null;
  /** Short code for that role, drawn as a badge on the highlighted player. */
  badge?: string;
  /** Clicking or pressing a player hands them the selected role. */
  onSelectAthlete?: (athleteId: string) => void;
  /** Verb for the marker's accessible name, e.g. "Assign as captain". */
  selectActionLabel?: string;
}

interface TacticalMiniPitchProps {
  /** The coach's selected formation — 5-, 7- or 11-a-side, custom shapes too. */
  formation: Formation;
  tactics: GamePlanTactics;
  /** Which control the preview is explaining; picks the scenario. */
  activeSetting: ActiveTacticalSetting;
  /** Sentence describing the drawn shape, for screen readers. */
  ariaLabel: string;
  mode?: PitchMode;
  roles?: PitchRolesConfig;
  className?: string;
}

function markerTransform(x: number, y: number): React.CSSProperties {
  return { transform: `translate(${toSvgX(x)}px, ${toSvgY(y)}px)` };
}

export function TacticalMiniPitch({
  formation,
  tactics,
  activeSetting,
  ariaLabel,
  mode = "tactics",
  roles,
  className,
}: TacticalMiniPitchProps) {
  const shape = useMemo(
    () =>
      mode === "roles"
        ? { players: formationShape(formation), opponents: [], ball: null }
        : calculateTacticalShape(formation, tactics, activeSetting),
    [formation, tactics, activeSetting, mode],
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-primary/40",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${PITCH_VIEWBOX.width} ${PITCH_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
        role={mode === "roles" ? "group" : "img"}
        aria-label={ariaLabel}
      >
        <TacticalPitchLines />

        {/* Opposition first, so our players always read on top of them. */}
        {shape.opponents.map((opponent) => (
          <OpponentMarker key={opponent.id} opponent={opponent} />
        ))}

        {shape.players.map((player) =>
          mode === "roles" && roles ? (
            <RolePlayerMarker key={player.id} player={player} roles={roles} />
          ) : (
            <PlayerMarker key={player.id} player={player} />
          ),
        )}

        {shape.ball && (
          <g
            className="tactical-marker"
            style={markerTransform(shape.ball.x, shape.ball.y)}
            aria-hidden
          >
            <circle
              r={BALL_RADIUS}
              fill="#ffffff"
              stroke="#0b2318"
              strokeWidth={0.5}
            />
          </g>
        )}
      </svg>
    </div>
  );
}

/* ─── Markers ───────────────────────────────────────────────────────────── */

/** Position caption drawn under a marker (and the name under that, in roles). */
function MarkerCaption({
  text,
  y,
  muted = false,
}: {
  text: string;
  y: number;
  muted?: boolean;
}) {
  return (
    <text
      y={y}
      textAnchor="middle"
      fontSize={3.2}
      fontWeight={700}
      fill={muted ? "rgba(255,255,255,0.75)" : "#ffffff"}
      stroke="#0b2318"
      strokeWidth={0.9}
      style={{ paintOrder: "stroke" }}
    >
      {text}
    </text>
  );
}

function PlayerMarker({ player }: { player: TacticalPlayer }) {
  const marker = ROLE_MARKER[player.role];

  return (
    <g
      className="tactical-marker"
      style={markerTransform(player.x, player.y)}
      aria-hidden
    >
      {player.highlighted && (
        <circle
          r={HIGHLIGHT_RADIUS}
          fill="none"
          stroke={HIGHLIGHT_COLOR}
          strokeWidth={0.7}
          strokeOpacity={0.9}
        />
      )}
      <circle
        r={PLAYER_RADIUS}
        fill={marker.fill}
        stroke="#ffffff"
        strokeWidth={0.6}
      />
      <MarkerCaption text={player.label} y={LABEL_OFFSET} />
    </g>
  );
}

/**
 * A marker on the Roles pitch: the athlete filling the slot, with their squad
 * number inside and their name beneath. Empty slots stay on the pitch as a
 * hollow marker so the shape still reads, but cannot be given a role.
 */
function RolePlayerMarker({
  player,
  roles,
}: {
  player: TacticalPlayer;
  roles: PitchRolesConfig;
}) {
  const athleteId = roles.assignments[player.id] ?? null;
  const athlete = athleteId ? roles.athleteById.get(athleteId) : undefined;
  const marker = ROLE_MARKER[player.role];
  const isHighlighted =
    roles.highlightedAthleteId != null &&
    athlete?.id === roles.highlightedAthleteId;

  const selectable = athlete != null && roles.onSelectAthlete != null;
  const select = selectable
    ? () => roles.onSelectAthlete?.(athlete.id)
    : undefined;

  return (
    <g
      className={cn("tactical-marker", selectable && "cursor-pointer")}
      style={markerTransform(player.x, player.y)}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-pressed={selectable ? isHighlighted : undefined}
      aria-label={
        selectable
          ? `${roles.selectActionLabel ?? "Select"}: ${athleteShortName(athlete)}, ${player.label}`
          : undefined
      }
      aria-hidden={selectable ? undefined : true}
      onClick={select}
      onKeyDown={(event) => {
        if (!select) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
    >
      {selectable && (
        <circle
          className="tactical-marker-focus"
          r={FOCUS_RADIUS}
          fill="none"
          stroke="var(--ring)"
          strokeWidth={0.9}
        />
      )}
      {isHighlighted && (
        <circle
          r={HIGHLIGHT_RADIUS}
          fill="none"
          stroke={HIGHLIGHT_COLOR}
          strokeWidth={0.9}
        />
      )}
      <circle
        r={PLAYER_RADIUS}
        fill={athlete ? marker.fill : "transparent"}
        fillOpacity={athlete ? 1 : 0}
        stroke={athlete ? "#ffffff" : "rgba(255,255,255,0.45)"}
        strokeWidth={0.6}
        strokeDasharray={athlete ? undefined : "1.4 1.2"}
      />

      {/* Squad number inside the marker, as on the squad board. */}
      {athlete?.squadNumber != null && (
        <text
          y={1.2}
          textAnchor="middle"
          fontSize={3.4}
          fontWeight={700}
          fill="#ffffff"
          pointerEvents="none"
        >
          {athlete.squadNumber}
        </text>
      )}

      <MarkerCaption text={player.label} y={LABEL_OFFSET} />
      {athlete && (
        <MarkerCaption text={athleteShortName(athlete)} y={NAME_OFFSET} muted />
      )}

      {/* Only the role being edited is badged, so the pitch stays readable. */}
      {isHighlighted && roles.badge && (
        <g pointerEvents="none">
          <circle
            cx={BADGE_OFFSET.x}
            cy={BADGE_OFFSET.y}
            r={2.3}
            fill={HIGHLIGHT_COLOR}
            stroke="#0b2318"
            strokeWidth={0.4}
          />
          <text
            x={BADGE_OFFSET.x}
            y={BADGE_OFFSET.y + 0.9}
            textAnchor="middle"
            fontSize={2.4}
            fontWeight={700}
            fill="#0b2318"
          >
            {roles.badge}
          </text>
        </g>
      )}
    </g>
  );
}

function OpponentMarker({ opponent }: { opponent: TacticalOpponent }) {
  return (
    <g
      className="tactical-marker"
      style={markerTransform(opponent.x, opponent.y)}
      aria-hidden
    >
      <circle
        r={OPPONENT_RADIUS}
        fill={OPPONENT_MARKER.fill}
        fillOpacity={opponent.onBall ? 0.95 : 0.6}
        stroke={OPPONENT_MARKER.stroke}
        strokeWidth={0.5}
        strokeDasharray={opponent.onBall ? undefined : "1.4 1.2"}
      />
    </g>
  );
}

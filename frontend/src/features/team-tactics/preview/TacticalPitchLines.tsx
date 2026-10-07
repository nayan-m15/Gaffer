/**
 * The mini pitch's turf and markings — everything that does not move when a
 * tactic changes.
 *
 * Drawn in the mini pitch's own SVG units (see `pitchGeometry`), with the
 * opponent's goal at the top so it matches every other pitch in the app. The
 * greens are the same ones the Confirm Squad formation preview uses.
 */

import { PITCH_BOX, PITCH_VIEWBOX } from "./pitchGeometry";

const RIGHT = PITCH_BOX.left + PITCH_BOX.width;
const BOTTOM = PITCH_BOX.top + PITCH_BOX.height;
const HALFWAY = PITCH_BOX.top + PITCH_BOX.height / 2;

/** Penalty area: 40.32 m of a 68 m width, 16.5 m of a 105 m length. */
const PENALTY_AREA = { width: 55.8, depth: 21 };
/** Goal area: 18.32 m wide, 5.5 m deep. */
const GOAL_AREA = { width: 25.4, depth: 7 };
const GOAL = { width: 10.2, depth: 1.8 };
const PENALTY_SPOT_DEPTH = 14;
const CENTRE_CIRCLE_RADIUS = 12.6;
const CORNER_RADIUS = 2.4;

const STRIPE_COUNT = 8;
const LINE = "rgba(255, 255, 255, 0.3)";
const LINE_WIDTH = 0.4;

function centred(width: number) {
  return { x: 50 - width / 2, width };
}

export function TacticalPitchLines() {
  const stripeWidth = PITCH_BOX.width / STRIPE_COUNT;
  const penalty = centred(PENALTY_AREA.width);
  const goalArea = centred(GOAL_AREA.width);
  const goal = centred(GOAL.width);

  return (
    <g aria-hidden>
      {/* Turf and mowing stripes run to the edge of the frame, matching the
          squad formation preview; the markings below sit inside them. */}
      <rect
        x={0}
        y={0}
        width={PITCH_VIEWBOX.width}
        height={PITCH_VIEWBOX.height}
        fill="#143322"
      />
      {Array.from({ length: STRIPE_COUNT }, (_, index) => (
        <rect
          key={index}
          x={PITCH_BOX.left + index * stripeWidth}
          y={0}
          width={stripeWidth}
          height={PITCH_VIEWBOX.height}
          fill={index % 2 === 0 ? "#1b4d36" : "#164530"}
        />
      ))}

      <g fill="none" stroke={LINE} strokeWidth={LINE_WIDTH}>
        {/* Boundary, halfway line and centre circle. */}
        <rect
          x={PITCH_BOX.left}
          y={PITCH_BOX.top}
          width={PITCH_BOX.width}
          height={PITCH_BOX.height}
        />
        <line
          x1={PITCH_BOX.left}
          y1={HALFWAY}
          x2={RIGHT}
          y2={HALFWAY}
        />
        <circle cx={50} cy={HALFWAY} r={CENTRE_CIRCLE_RADIUS} />

        {/* Penalty areas, goal areas and goals at both ends. */}
        {[
          { boxY: PITCH_BOX.top, sign: 1 },
          { boxY: BOTTOM, sign: -1 },
        ].map(({ boxY, sign }) => (
          <g key={sign}>
            <rect
              x={penalty.x}
              y={sign === 1 ? boxY : boxY - PENALTY_AREA.depth}
              width={penalty.width}
              height={PENALTY_AREA.depth}
            />
            <rect
              x={goalArea.x}
              y={sign === 1 ? boxY : boxY - GOAL_AREA.depth}
              width={goalArea.width}
              height={GOAL_AREA.depth}
            />
            <rect
              x={goal.x}
              y={sign === 1 ? boxY - GOAL.depth : boxY}
              width={goal.width}
              height={GOAL.depth}
            />
          </g>
        ))}

        {/* Corner arcs. */}
        <path
          d={`M ${PITCH_BOX.left} ${PITCH_BOX.top + CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${PITCH_BOX.left + CORNER_RADIUS} ${PITCH_BOX.top}`}
        />
        <path
          d={`M ${RIGHT - CORNER_RADIUS} ${PITCH_BOX.top} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${RIGHT} ${PITCH_BOX.top + CORNER_RADIUS}`}
        />
        <path
          d={`M ${PITCH_BOX.left + CORNER_RADIUS} ${BOTTOM} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${PITCH_BOX.left} ${BOTTOM - CORNER_RADIUS}`}
        />
        <path
          d={`M ${RIGHT} ${BOTTOM - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${RIGHT - CORNER_RADIUS} ${BOTTOM}`}
        />
      </g>

      {/* Centre and penalty spots. */}
      <g fill={LINE}>
        <circle cx={50} cy={HALFWAY} r={0.8} />
        <circle cx={50} cy={PITCH_BOX.top + PENALTY_SPOT_DEPTH} r={0.7} />
        <circle cx={50} cy={BOTTOM - PENALTY_SPOT_DEPTH} r={0.7} />
      </g>
    </g>
  );
}

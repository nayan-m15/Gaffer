/**
 * Deterministic position maths for the tactical mini pitch.
 *
 * Every function here is pure and works in the shared 0–100 pitch space
 * (opponent's goal at y = 0, our own goal at y = 100) so the result can be fed
 * straight to `<TacticalMiniPitch>` or, later, to any other renderer. Nothing
 * in here simulates football: a tactic setting maps onto a shape by a fixed
 * formula, and the same settings always produce the same picture.
 *
 * The transformations are formation-agnostic — they read the extremes of
 * whatever formation is passed in rather than assuming a back four — so the
 * preview follows the coach's selected 5-, 7- or 11-a-side shape.
 */

import type {
  Formation,
  FormationPosition,
} from "@/features/team-management/types";
import type { GamePlanTactics } from "@/services/gamePlans";
import { SETTING_SLIDER_META, toTacticPercent } from "../tactics-options.ts";
import type {
  ActiveTacticalSetting,
  TacticalOpponent,
  TacticalPlayer,
  TacticalScenario,
  TacticalShape,
} from "./tacticalTypes";

/* ─── Shared constants ──────────────────────────────────────────────────── */

const PITCH_CENTER_X = 50;

/** Keeps every marker comfortably inside the touchlines and goal lines. */
const MIN_COORDINATE = 6;
const MAX_COORDINATE = 94;

/**
 * How horizontally compressed or stretched the shape gets at the ends of the
 * Width slider, relative to the formation's own spacing at its neutral value.
 */
const WIDTH_MULTIPLIER = { low: 0.52, neutral: 1, high: 1.2 };

/**
 * How far the block slides along the pitch at the ends of the Depth slider.
 * Positive is toward our own goal, so dropping off is the larger move — a low
 * block has to pull the forwards a long way back, while a high line is capped
 * by the opponent's goal line.
 */
const DEPTH_SHIFT = { low: 26, neutral: 0, high: -15 };

/**
 * Share of the depth shift taken by the players nearest the direction of
 * travel. Pushing the block up moves the back line most and the forwards least
 * (and the other way round when dropping off), which is what makes the lines
 * compress at both ends of the slider instead of the whole team sliding
 * rigidly off the pitch.
 */
const TRAILING_WEIGHT = 0.22;

/** The goalkeeper only ever edges off the line. */
const GOALKEEPER_SHIFT = { low: 3, neutral: 0, high: -4 };
const GOALKEEPER_RANGE = { min: 88, max: 96 };

/**
 * Extra depth, in slider percentage points, that each defensive style applies
 * on top of the Depth slider. This is what makes "Constant pressure" sit higher
 * than "Drop back" at the same Depth value.
 */
const DEFENSIVE_STYLE_DEPTH_BIAS: Record<
  GamePlanTactics["defensiveStyle"],
  number
> = {
  drop_back: -18,
  balanced: 0,
  pressure_on_heavy_touch: 4,
  press_after_possession_loss: 10,
  constant_pressure: 22,
};

/**
 * How far up the pitch each offensive style commits the team, as a reading on
 * the same 0–100 depth scale the defensive slider uses. Every one of them sits
 * above 50 — the team is in possession.
 */
const OFFENSIVE_STYLE_DEPTH: Record<
  GamePlanTactics["offensiveStyle"],
  number
> = {
  possession: 66,
  balanced: 76,
  fast_build_up: 94,
  long_ball: 84,
};

/** Defensive styles that are best explained with an opponent on the ball. */
const PRESSING_STYLES = new Set<GamePlanTactics["defensiveStyle"]>([
  "pressure_on_heavy_touch",
  "press_after_possession_loss",
  "constant_pressure",
]);

/**
 * How far from the ball a player can be and still be shown closing it down.
 * Without it the "nearest N" would reach a striker standing on the halfway line.
 */
const PRESS_RADIUS = 32;

/** How many of our players close the ball down, per pressing style. */
const PRESSERS_BY_STYLE: Partial<
  Record<GamePlanTactics["defensiveStyle"], number>
> = {
  pressure_on_heavy_touch: 2,
  press_after_possession_loss: 4,
  constant_pressure: 3,
};

/** Where the opponent in possession stands, per pressing style. */
const PRESS_TARGET: Partial<
  Record<GamePlanTactics["defensiveStyle"], { x: number; y: number }>
> = {
  pressure_on_heavy_touch: { x: 56, y: 52 },
  press_after_possession_loss: { x: 46, y: 44 },
  constant_pressure: { x: 52, y: 70 },
};

/* ─── Small numeric helpers ─────────────────────────────────────────────── */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * clamp(t, 0, 1);
}

/** Keeps a marker on the pitch. */
export function clampPitchCoordinate(value: number): number {
  return clamp(value, MIN_COORDINATE, MAX_COORDINATE);
}

/**
 * Interpolates across a slider whose midpoint carries its own value, so 0 → low,
 * 50 → neutral and 100 → high without the neutral reading drifting.
 */
export function pivotLerp(
  percent: number,
  range: { low: number; neutral: number; high: number },
): number {
  const p = clamp(percent, 0, 100);
  return p <= 50
    ? lerp(range.low, range.neutral, p / 50)
    : lerp(range.neutral, range.high, (p - 50) / 50);
}

/** Reads one slider field off a tactics object as a 0–100 percentage. */
export function tacticPercent(
  tactics: GamePlanTactics,
  field: keyof typeof SETTING_SLIDER_META,
): number {
  return toTacticPercent(tactics[field], SETTING_SLIDER_META[field]);
}

/* ─── Width ─────────────────────────────────────────────────────────────── */

/**
 * Compresses or expands a player's horizontal position about the centre of the
 * pitch. The multiplier applies to the whole outfield shape, not just the wide
 * players, so a narrow setting visibly funnels the entire team inward.
 */
export function transformWidth(
  baseX: number,
  widthPercent: number,
  extraSpread = 1,
): number {
  const multiplier = pivotLerp(widthPercent, WIDTH_MULTIPLIER) * extraSpread;
  return PITCH_CENTER_X + (baseX - PITCH_CENTER_X) * multiplier;
}

/* ─── Depth ─────────────────────────────────────────────────────────────── */

/** The deepest and most advanced outfield y values in a formation. */
export interface DepthBounds {
  deepest: number;
  highest: number;
}

export function outfieldDepthBounds(
  positions: FormationPosition[],
): DepthBounds {
  const ys = positions
    .filter((position) => position.role !== "GK")
    .map((position) => position.y);
  if (ys.length === 0) return { deepest: 80, highest: 20 };
  return { deepest: Math.max(...ys), highest: Math.min(...ys) };
}

/**
 * Where a player sits between the most advanced (0) and the deepest (1) player
 * in the formation.
 */
function depthRank(baseY: number, bounds: DepthBounds): number {
  const span = bounds.deepest - bounds.highest;
  if (span <= 0) return 0.5;
  return clamp((baseY - bounds.highest) / span, 0, 1);
}

/**
 * Moves one outfield player along the pitch for a given Depth percentage.
 *
 * Our own goal is at y = 100 and the opponent's at y = 0, so a higher line is a
 * *smaller* y — hence the negative shift at the top of the slider.
 */
export function transformDepth(
  baseY: number,
  depthPercent: number,
  bounds: DepthBounds,
): number {
  const shift = pivotLerp(depthPercent, DEPTH_SHIFT);
  const rank = depthRank(baseY, bounds);
  // Going higher (shift < 0) the deepest players lead; dropping off, the
  // forwards lead. Either way the trailing line moves least, so the block
  // becomes more compact at both ends of the slider.
  const lead = shift < 0 ? rank : 1 - rank;
  const weight = TRAILING_WEIGHT + (1 - TRAILING_WEIGHT) * lead;
  return baseY + shift * weight;
}

/** The goalkeeper edges off the line but never joins the outfield shift. */
export function transformGoalkeeperDepth(
  baseY: number,
  depthPercent: number,
): number {
  const shifted = baseY + pivotLerp(depthPercent, GOALKEEPER_SHIFT);
  return clamp(shifted, GOALKEEPER_RANGE.min, GOALKEEPER_RANGE.max);
}

/* ─── Open-play shapes ──────────────────────────────────────────────────── */

function toPlayer(
  position: FormationPosition,
  x: number,
  y: number,
): TacticalPlayer {
  return {
    id: position.id,
    label: position.label,
    role: position.role,
    x: clampPitchCoordinate(x),
    y: clampPitchCoordinate(y),
  };
}

/**
 * Applies a width and a depth percentage to every slot in a formation. Width
 * runs first so the depth weighting always sees the player's own line, then
 * both results are clamped onto the pitch.
 */
function applyWidthAndDepth(
  positions: FormationPosition[],
  widthPercent: number,
  depthPercent: number,
  spreadFor?: (position: FormationPosition) => number,
): TacticalPlayer[] {
  const bounds = outfieldDepthBounds(positions);
  return positions.map((position) => {
    const isGoalkeeper = position.role === "GK";
    const x = transformWidth(
      position.x,
      widthPercent,
      isGoalkeeper ? 1 : (spreadFor?.(position) ?? 1),
    );
    const y = isGoalkeeper
      ? transformGoalkeeperDepth(position.y, depthPercent)
      : transformDepth(position.y, depthPercent, bounds);
    return toPlayer(position, x, y);
  });
}

/**
 * The formation's own shape, with no tactical transform applied — what the
 * Roles screen draws, where the sliders are irrelevant and the coach needs to
 * recognise the lineup they picked on the squad board.
 */
export function formationShape(formation: Formation): TacticalPlayer[] {
  return formation.positions.map((position) =>
    toPlayer(position, position.x, position.y),
  );
}

/**
 * The out-of-possession shape: Defensive Width and Depth applied to the
 * formation, biased by the chosen defensive style.
 */
export function calculateDefensiveShape(
  formation: Formation,
  tactics: GamePlanTactics,
): TacticalPlayer[] {
  const widthPercent = tacticPercent(tactics, "defensiveWidth");
  const depthPercent = clamp(
    tacticPercent(tactics, "defensiveDepth") +
      DEFENSIVE_STYLE_DEPTH_BIAS[tactics.defensiveStyle],
    0,
    100,
  );
  return applyWidthAndDepth(formation.positions, widthPercent, depthPercent);
}

/**
 * Extra horizontal spread for the players a coach expects to stretch the pitch
 * in possession: wingers most, then wide defenders and wide midfielders.
 */
function attackingSpread(widthPercent: number) {
  const bias = (widthPercent - 50) / 50;
  return (position: FormationPosition): number => {
    if (position.role === "GK") return 1;
    const offset = Math.abs(position.x - PITCH_CENTER_X);
    if (position.role === "FWD" && offset > 12) return 1 + bias * 0.22;
    if (offset > 20) return 1 + bias * 0.12;
    return 1 + bias * 0.05;
  };
}

/**
 * The in-possession shape: Offensive Width, the offensive style's commitment up
 * the pitch, and finally Players in Box advancing the front runners.
 */
export function calculateAttackingShape(
  formation: Formation,
  tactics: GamePlanTactics,
): TacticalPlayer[] {
  const widthPercent = tacticPercent(tactics, "offensiveWidth");
  const depthPercent = OFFENSIVE_STYLE_DEPTH[tactics.offensiveStyle];
  const shape = applyWidthAndDepth(
    formation.positions,
    widthPercent,
    depthPercent,
    attackingSpread(widthPercent),
  );
  return calculatePlayersInBoxShape(shape, tactics);
}

/* ─── Players in box ────────────────────────────────────────────────────── */

/** Vertical band and horizontal span of the opponent's penalty area. */
const BOX_BAND = { near: 20, far: 8 };
const BOX_SPAN = { left: 24, right: 76 };

/** How many players get into the box across the Players in Box slider. */
export function playersInBoxCount(tactics: GamePlanTactics): number {
  return Math.round(lerp(1, 6, tacticPercent(tactics, "playersInBox") / 100));
}

/**
 * Advances the most forward outfield players into the opponent's box, in order,
 * leaving everyone else where the width/depth pass put them.
 *
 * Takes a shape rather than a formation so it composes with
 * `calculateAttackingShape` instead of repeating its maths.
 */
export function calculatePlayersInBoxShape(
  shape: TacticalPlayer[],
  tactics: GamePlanTactics,
): TacticalPlayer[] {
  const count = playersInBoxCount(tactics);
  const runners = shape
    .filter((player) => player.role !== "GK")
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, count)
    .map((player) => player.id);
  const order = new Map(runners.map((id, index) => [id, index]));

  return shape.map((player) => {
    const index = order.get(player.id);
    if (index === undefined) return player;
    return {
      ...player,
      x: clampPitchCoordinate(
        lerp(BOX_SPAN.left, BOX_SPAN.right, fanOrder(index, runners.length)),
      ),
      y: clampPitchCoordinate(boxDepth(index, BOX_BAND)),
      highlighted: true,
    };
  });
}

/**
 * Spreads N runners outward from the middle of the box — centre first, then
 * alternating right and left — so adding a runner never reshuffles the ones
 * already there and no two share a position.
 */
function fanOrder(index: number, total: number): number {
  if (total <= 1) return 0.5;
  const step = Math.ceil(index / 2);
  const side = index % 2 === 1 ? 1 : -1;
  const maxStep = Math.ceil((total - 1) / 2);
  return clamp(0.5 + (side * step) / (maxStep * 2), 0, 1);
}

/**
 * Staggers runners across three depths inside the box — near post, penalty spot,
 * edge — so a crowded box still reads as individual players.
 */
function boxDepth(index: number, band: { near: number; far: number }): number {
  return band.far + ((index % 3) * (band.near - band.far)) / 2;
}

/* ─── Set-piece scenarios ───────────────────────────────────────────────── */

/** Attacking corner, taken from the left flag at the top of the pitch. */
const CORNER_BALL = { x: 8, y: 8 };
/** Direct free kick, central and just outside the opponent's box. */
const FREE_KICK_BALL = { x: 50, y: 27 };

/** Where players held back against the counter wait. */
const COVER_BAND = { near: 52, far: 74 };

/**
 * Reshapes the squad for an attacking corner: a taker at the flag, a chosen
 * number of bodies in the box, and the rest holding a covering line against the
 * counter.
 */
export function calculateCornerShape(
  formation: Formation,
  tactics: GamePlanTactics,
): TacticalPlayer[] {
  const percent = tacticPercent(tactics, "cornersCommitment");
  return setPieceShape(formation, CORNER_BALL, commitmentToBoxCount(percent), {
    near: 20,
    far: 10,
    left: 30,
    right: 72,
  });
}

/**
 * Reshapes the squad for an attacking free kick: bodies committed to the box as
 * the slider rises, the remainder behind the ball.
 */
export function calculateFreeKickShape(
  formation: Formation,
  tactics: GamePlanTactics,
): TacticalPlayer[] {
  const percent = tacticPercent(tactics, "freeKicksCommitment");
  return setPieceShape(
    formation,
    FREE_KICK_BALL,
    commitmentToBoxCount(percent),
    // Ahead of the wall (which stands 9 units in front of the ball), not on it.
    { near: 16, far: 8, left: 28, right: 72 },
  );
}

/** Low commitment sends 2 players into the box, high commitment 6. */
export function commitmentToBoxCount(percent: number): number {
  return Math.round(lerp(2, 6, percent / 100));
}

/**
 * Shared set-piece layout. Keeps every original slot id so markers animate
 * across from open play rather than popping in.
 */
function setPieceShape(
  formation: Formation,
  ball: { x: number; y: number },
  inBox: number,
  box: { near: number; far: number; left: number; right: number },
): TacticalPlayer[] {
  const outfield = formation.positions
    .filter((position) => position.role !== "GK")
    .slice()
    // The most advanced players take the ball and the box; the deepest cover.
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const taker = outfield[0];
  const attackers = outfield.slice(1, 1 + Math.min(inBox, outfield.length - 1));
  const coverers = outfield.slice(1 + attackers.length);

  const placed = new Map<string, { x: number; y: number }>();

  if (taker) placed.set(taker.id, { x: ball.x, y: ball.y + 4 });

  attackers.forEach((position, index) => {
    placed.set(position.id, {
      x: lerp(box.left, box.right, fanOrder(index, attackers.length)),
      y: boxDepth(index, box),
    });
  });

  coverers.forEach((position, index) => {
    const slot = coverers.length === 1 ? 0.5 : index / (coverers.length - 1);
    placed.set(position.id, {
      x: lerp(22, 78, slot),
      y: index % 2 === 0 ? COVER_BAND.near : COVER_BAND.far,
    });
  });

  return formation.positions.map((position) => {
    if (position.role === "GK") {
      return toPlayer(position, position.x, position.y);
    }
    const target = placed.get(position.id) ?? position;
    const player = toPlayer(position, target.x, target.y);
    return { ...player, highlighted: player.y < 30 };
  });
}

/* ─── Opponents and the ball ────────────────────────────────────────────── */

/**
 * A ring of muted opponents around the player on the ball — enough to read the
 * situation, not enough to clutter the pitch.
 */
function pressOpponents(target: { x: number; y: number }): TacticalOpponent[] {
  return [
    { id: "opp-ball", x: target.x, y: target.y, onBall: true },
    { id: "opp-1", x: target.x - 20, y: target.y + 10 },
    { id: "opp-2", x: target.x + 20, y: target.y + 10 },
    { id: "opp-3", x: target.x + 4, y: target.y + 22 },
  ].map((opponent) => ({
    ...opponent,
    x: clampPitchCoordinate(opponent.x),
    y: clampPitchCoordinate(opponent.y),
  }));
}

/**
 * Opponents defending a corner: a keeper and two posts. Deliberately only three,
 * and held tight to the goal line, so our own bodies in the box stay readable.
 */
function boxOpponents(): TacticalOpponent[] {
  return [
    { id: "opp-gk", x: 50, y: 7 },
    { id: "opp-1", x: 41, y: 9 },
    { id: "opp-2", x: 59, y: 9 },
  ];
}

/** A four-man wall between the ball and the goal, plus their goalkeeper. */
function wallOpponents(ball: { x: number; y: number }): TacticalOpponent[] {
  const wall = [-6, -2, 2, 6].map((offset, index) => ({
    id: `opp-${index + 1}`,
    x: clampPitchCoordinate(ball.x + offset),
    y: clampPitchCoordinate(ball.y - 9),
  }));
  return [{ id: "opp-gk", x: 50, y: 8 }, ...wall];
}

/** Marks the `count` players closest to the ball as the ones closing it down. */
function highlightNearest(
  players: TacticalPlayer[],
  target: { x: number; y: number },
  count: number,
): TacticalPlayer[] {
  const distance = (player: TacticalPlayer) =>
    (player.x - target.x) ** 2 + (player.y - target.y) ** 2;
  const nearest = new Set(
    players
      .filter(
        (player) =>
          player.role !== "GK" && distance(player) <= PRESS_RADIUS ** 2,
      )
      .sort((a, b) => distance(a) - distance(b))
      .slice(0, count)
      .map((player) => player.id),
  );
  return players.map((player) =>
    nearest.has(player.id) ? { ...player, highlighted: true } : player,
  );
}

/* ─── Scenario selection ────────────────────────────────────────────────── */

/** Which situation each control is best demonstrated in. */
export function scenarioForSetting(
  setting: ActiveTacticalSetting,
): TacticalScenario {
  switch (setting) {
    case "cornersCommitment":
      return "corner";
    case "freeKicksCommitment":
      return "freeKick";
    case "offensiveStyle":
    case "offensiveWidth":
    case "playersInBox":
      return "attacking";
    default:
      return "defensive";
  }
}

/**
 * Builds the whole picture for the control the coach is currently on: the
 * scenario, our shape within it, any opposition markers that help explain it,
 * and the ball.
 */
export function calculateTacticalShape(
  formation: Formation,
  tactics: GamePlanTactics,
  setting: ActiveTacticalSetting,
): TacticalShape {
  const scenario = scenarioForSetting(setting);

  if (scenario === "corner") {
    return {
      scenario,
      players: calculateCornerShape(formation, tactics),
      opponents: boxOpponents(),
      ball: CORNER_BALL,
    };
  }

  if (scenario === "freeKick") {
    return {
      scenario,
      players: calculateFreeKickShape(formation, tactics),
      opponents: wallOpponents(FREE_KICK_BALL),
      ball: FREE_KICK_BALL,
    };
  }

  if (scenario === "attacking") {
    return {
      scenario,
      players: calculateAttackingShape(formation, tactics),
      opponents: [],
      ball: null,
    };
  }

  const players = calculateDefensiveShape(formation, tactics);

  // Opponents only appear where they carry the explanation — the pressing
  // styles. The plain Width and Depth previews stay uncluttered.
  const target =
    setting === "defensiveStyle" && PRESSING_STYLES.has(tactics.defensiveStyle)
      ? PRESS_TARGET[tactics.defensiveStyle]
      : undefined;

  if (!target) {
    return { scenario, players, opponents: [], ball: null };
  }

  return {
    scenario,
    players: highlightNearest(
      players,
      target,
      PRESSERS_BY_STYLE[tactics.defensiveStyle] ?? 2,
    ),
    opponents: pressOpponents(target),
    ball: target,
  };
}

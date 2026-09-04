/**
 * Static option data for the Team Tactics screen — the defensive / offensive
 * style choices and their live-updating explanatory copy, plus the tab list.
 *
 * Every style description names both sides of the trade-off, mirroring FIFA's
 * own tactics UI (higher pressing = faster ball-winning but more fatigue and
 * space conceded, etc.).
 */

import type {
  DefensiveStyle,
  GamePlanTactics,
  OffensiveStyle,
} from "@/services/gamePlans";

export interface StyleOption<T extends string> {
  value: T;
  label: string;
  /** One-line trade-off shown under the select, FIFA-style. */
  description: string;
}

export const DEFENSIVE_STYLE_OPTIONS: StyleOption<DefensiveStyle>[] = [
  {
    value: "drop_back",
    label: "Drop back",
    description:
      "Team sits deep and holds shape, inviting pressure but limiting space in behind.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description:
      "Team presses toward the middle third with no strong bias — a neutral shape.",
  },
  {
    value: "pressure_on_heavy_touch",
    label: "Pressure on heavy touch",
    description:
      "Players hold shape until an opponent's poor touch, then step out to pressure.",
  },
  {
    value: "press_after_possession_loss",
    label: "Press after possession loss",
    description:
      "The whole team counter-presses for a few seconds after losing the ball — wins it back quickly but tires players and risks gaps.",
  },
  {
    value: "constant_pressure",
    label: "Constant pressure",
    description:
      "Team closes down all over the pitch — fastest ball recovery, but drains stamina and leaves space in behind.",
  },
];

export const OFFENSIVE_STYLE_OPTIONS: StyleOption<OffensiveStyle>[] = [
  {
    value: "possession",
    label: "Possession",
    description:
      "Short passing and support runs to keep the ball rather than break early.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description:
      "Some players make attacking runs while the team keeps its shape on the ball.",
  },
  {
    value: "fast_build_up",
    label: "Fast build up",
    description:
      "All attackers run and even defenders push up — most threat forward, most exposed at the back.",
  },
  {
    value: "long_ball",
    label: "Long ball",
    description:
      "Forwards break in behind early, even before the defence has settled — direct, route-one football.",
  },
];

export function defensiveStyleDescription(value: DefensiveStyle): string {
  return (
    DEFENSIVE_STYLE_OPTIONS.find((o) => o.value === value)?.description ?? ""
  );
}

export function offensiveStyleDescription(value: OffensiveStyle): string {
  return (
    OFFENSIVE_STYLE_OPTIONS.find((o) => o.value === value)?.description ?? ""
  );
}

/** Endpoint captions shown at the two ends of a slider track. */
export interface SliderMeta {
  min: number;
  max: number;
  lowLabel: string;
  highLabel: string;
}

export const SLIDER_META = {
  width: { min: 1, max: 10, lowLabel: "Narrow", highLabel: "Wide" },
  depth: { min: 1, max: 10, lowLabel: "Deep", highLabel: "High" },
  playersInBox: { min: 0, max: 10, lowLabel: "Few", highLabel: "Many" },
  commitment: { min: 0, max: 10, lowLabel: "Low", highLabel: "High" },
} satisfies Record<string, SliderMeta>;

/** Tactical settings shown within the Team page. Squad and formation are
 * configured and saved by the Team lineup board, so they are not duplicated. */
export const TACTICS_TABS = [
  "Tactics",
  "Roles",
  "Instructions",
] as const;

export type TacticsTab = (typeof TACTICS_TABS)[number];

/**
 * Tactical values a brand-new game plan starts from — matches the backend
 * column defaults so a freshly created plan and a locally-initialised one
 * agree. The squad half (formation, starting XI, bench) starts from a blank
 * board instead, via `useLineupState`.
 */
export const DEFAULT_GAME_PLAN_TACTICS: GamePlanTactics = {
  defensiveStyle: "balanced",
  defensiveWidth: 5,
  defensiveDepth: 5,
  offensiveStyle: "balanced",
  offensiveWidth: 5,
  playersInBox: 4,
  cornersCommitment: 3,
  freeKicksCommitment: 3,
  captainId: null,
  freeKickTakerId: null,
  penaltyTakerId: null,
  cornerTakerId: null,
};

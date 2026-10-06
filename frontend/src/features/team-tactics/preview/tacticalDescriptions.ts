/**
 * Human-readable labels and preview copy for the Team Tactics screen.
 *
 * Keeping the wording in a configuration layer means the preview panel is a
 * lookup rather than a chain of `if` blocks, and the same label helpers feed
 * both the slider rows and the panel heading.
 */

import type { GamePlanTactics } from "@/services/gamePlans";
import {
  defensiveStyleDescription,
  offensiveStyleDescription,
  DEFENSIVE_STYLE_OPTIONS,
  OFFENSIVE_STYLE_OPTIONS,
  SETTING_SLIDER_META,
} from "../tactics-options";
import {
  commitmentToBoxCount,
  playersInBoxCount,
  tacticPercent,
} from "./tacticalPositioning";
import type { ActiveTacticalSetting } from "./tacticalTypes";

/* ─── Value labels ──────────────────────────────────────────────────────── */

/** Band boundaries shared by every slider label (§ "Tactical value labels"). */
const BANDS = [20, 40, 60, 80];

/**
 * Picks the band a 0–100 reading falls into. The slider itself stays on its
 * stored integer scale — this is only the caption.
 */
function bandLabel(percent: number, labels: readonly [
  string,
  string,
  string,
  string,
  string,
]): string {
  const index = BANDS.findIndex((upper) => percent <= upper);
  return labels[index === -1 ? labels.length - 1 : index];
}

export function getWidthLabel(percent: number): string {
  return bandLabel(percent, [
    "Very narrow",
    "Narrow",
    "Balanced",
    "Wide",
    "Very wide",
  ]);
}

export function getDepthLabel(percent: number): string {
  return bandLabel(percent, [
    "Very deep",
    "Deep",
    "Balanced",
    "High",
    "Very high",
  ]);
}

export function getCommitmentLabel(percent: number): string {
  return bandLabel(percent, [
    "Very low",
    "Low",
    "Balanced",
    "High",
    "Very high",
  ]);
}

/** Which label helper describes each slider field. */
const LABEL_BY_FIELD: Record<
  keyof typeof SETTING_SLIDER_META,
  (percent: number) => string
> = {
  defensiveWidth: getWidthLabel,
  defensiveDepth: getDepthLabel,
  offensiveWidth: getWidthLabel,
  playersInBox: getCommitmentLabel,
  cornersCommitment: getCommitmentLabel,
  freeKicksCommitment: getCommitmentLabel,
};

/**
 * The descriptive caption for one slider field, e.g. "Wide" — pass the stored
 * value and the field it belongs to.
 */
export function tacticValueLabel(
  tactics: GamePlanTactics,
  field: keyof typeof SETTING_SLIDER_META,
): string {
  return LABEL_BY_FIELD[field](tacticPercent(tactics, field));
}

/* ─── Preview copy ──────────────────────────────────────────────────────── */

/** Static title and explanation for each tactical control. */
const PREVIEW_CONFIG: Record<
  ActiveTacticalSetting,
  { title: string; description: string }
> = {
  defensiveStyle: {
    title: "Defensive style",
    description:
      "Sets when your players leave their shape to go after the ball.",
  },
  defensiveWidth: {
    title: "Defensive width",
    description:
      "Controls how horizontally compact your team is when defending. Narrow funnels opponents to the flanks and protects the middle; wide covers the touchlines but opens gaps between your players.",
  },
  defensiveDepth: {
    title: "Defensive depth",
    description:
      "Controls how high your defensive line operates. A high line squeezes opponents into their own half but concedes space in behind; a deep line protects that space and invites pressure instead.",
  },
  offensiveStyle: {
    title: "Offensive style",
    description:
      "Sets how directly your team moves the ball forward once it wins possession.",
  },
  offensiveWidth: {
    title: "Attacking width",
    description:
      "Controls how wide your team positions itself while attacking. Wide stretches the opposition back line and opens crossing angles; narrow packs the central areas for combination play.",
  },
  playersInBox: {
    title: "Players in box",
    description:
      "Controls how many players gamble on getting into the opponent's box. More bodies means more chances on the end of a cross, and fewer players left to stop the counter.",
  },
  cornersCommitment: {
    title: "Corners",
    description:
      "Controls how many players you send forward for an attacking corner. The rest hold a covering line behind the ball.",
  },
  freeKicksCommitment: {
    title: "Free kicks",
    description:
      "Controls how many players push into the box for an attacking free kick, and how many stay behind the ball.",
  },
};

/** What the preview panel renders above the mini pitch. */
export interface TacticalPreviewCopy {
  title: string;
  description: string;
  /** Live reading of the setting, e.g. "7 · Wide" or "Constant pressure". */
  value: string;
  /** Second line of detail, only where a setting has one worth showing. */
  detail: string | null;
}

/** Caption for the current scenario, shown as the mini pitch's sub-heading. */
export const SCENARIO_LABEL = {
  defensive: "Out of possession",
  attacking: "In possession",
  corner: "Attacking corner",
  freeKick: "Attacking free kick",
} as const;

/**
 * Resolves the title, value and explanation for whichever control the coach is
 * currently on. Style settings borrow the live trade-off copy already shown
 * under their dropdown so the two never drift apart.
 */
export function tacticalPreviewCopy(
  setting: ActiveTacticalSetting,
  tactics: GamePlanTactics,
): TacticalPreviewCopy {
  const config = PREVIEW_CONFIG[setting];

  if (setting === "defensiveStyle") {
    return {
      ...config,
      value:
        DEFENSIVE_STYLE_OPTIONS.find((o) => o.value === tactics.defensiveStyle)
          ?.label ?? "",
      detail: defensiveStyleDescription(tactics.defensiveStyle),
    };
  }

  if (setting === "offensiveStyle") {
    return {
      ...config,
      value:
        OFFENSIVE_STYLE_OPTIONS.find((o) => o.value === tactics.offensiveStyle)
          ?.label ?? "",
      detail: offensiveStyleDescription(tactics.offensiveStyle),
    };
  }

  const meta = SETTING_SLIDER_META[setting];
  const value = `${tactics[setting]} · ${tacticValueLabel(tactics, setting)}`;

  return {
    ...config,
    value,
    detail: scenarioDetail(setting, tactics) ?? `Scale ${meta.min}–${meta.max}.`,
  };
}

/** Extra context that only makes sense for some sliders. */
function scenarioDetail(
  setting: ActiveTacticalSetting,
  tactics: GamePlanTactics,
): string | null {
  if (setting === "playersInBox") {
    return `${playerCount(playersInBoxCount(tactics))} gambling on getting into the box.`;
  }
  if (setting === "cornersCommitment" || setting === "freeKicksCommitment") {
    const count = commitmentToBoxCount(tacticPercent(tactics, setting));
    return `${playerCount(count)} in the box — assign your taker on the Roles tab.`;
  }
  return null;
}

function playerCount(count: number): string {
  return `${count} ${count === 1 ? "player" : "players"}`;
}

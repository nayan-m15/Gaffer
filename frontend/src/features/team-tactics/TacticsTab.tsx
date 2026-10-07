/**
 * The Tactics tab — a two-column workspace: the defensive and attacking
 * controls on the left, and a live explanation plus tactical mini pitch on the
 * right that follows whichever control the coach last touched.
 *
 * The controls still edit the same `GamePlanTactics` object on the backend's
 * stored 1–10 / 0–10 scale; the preview normalises those values to 0–100 for its
 * own maths and captions.
 */

import { useState } from "react";
import type { Formation } from "@/features/team-management/types";
import type { GamePlanTactics } from "@/services/gamePlans";
import { StyleField } from "./StyleField";
import { TacticalRow } from "./TacticalRow";
import { TacticsSlider } from "./TacticsSlider";
import { tacticValueLabel } from "./preview/tacticalDescriptions";
import { TacticalPreviewPanel } from "./preview/TacticalPreviewPanel";
import type { ActiveTacticalSetting } from "./preview/tacticalTypes";
import {
  DEFENSIVE_STYLE_OPTIONS,
  OFFENSIVE_STYLE_OPTIONS,
  SETTING_SLIDER_META,
  SLIDER_META,
  type SliderMeta,
} from "./tactics-options";

/** The tactical settings edited with a slider rather than a dropdown. */
type SliderSetting = keyof typeof SETTING_SLIDER_META;

interface TacticsTabProps {
  content: GamePlanTactics;
  /** The plan's selected formation — the shape the preview draws. */
  formation: Formation;
  onChange: (patch: Partial<GamePlanTactics>) => void;
  disabled?: boolean;
}

function TacticalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function TacticsTab({
  content,
  formation,
  onChange,
  disabled,
}: TacticsTabProps) {
  const [activeSetting, setActiveSetting] =
    useState<ActiveTacticalSetting>("defensiveStyle");

  /** Shared wiring for one slider row: highlight, preview focus, band caption. */
  const sliderRow = (
    setting: SliderSetting,
    label: string,
    ariaLabel: string,
    meta: SliderMeta,
    onSliderChange: (value: number) => void,
  ) => (
    <TacticalRow
      key={setting}
      active={activeSetting === setting}
      onActivate={() => setActiveSetting(setting)}
    >
      <TacticsSlider
        label={label}
        ariaLabel={ariaLabel}
        value={content[setting]}
        meta={meta}
        valueLabel={tacticValueLabel(content, setting)}
        onChange={onSliderChange}
        showEndLabels
        disabled={disabled}
      />
    </TacticalRow>
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-6">
        <TacticalSection title="Defensive tactics">
          <TacticalRow
            active={activeSetting === "defensiveStyle"}
            onActivate={() => setActiveSetting("defensiveStyle")}
          >
            <StyleField
              label="Defensive style"
              value={content.defensiveStyle}
              options={DEFENSIVE_STYLE_OPTIONS}
              onChange={(defensiveStyle) => onChange({ defensiveStyle })}
              disabled={disabled}
              hideDescription
            />
          </TacticalRow>
          {sliderRow(
            "defensiveWidth",
            "Width",
            "Defensive width",
            SLIDER_META.width,
            (defensiveWidth) => onChange({ defensiveWidth }),
          )}
          {sliderRow(
            "defensiveDepth",
            "Depth",
            "Defensive depth",
            SLIDER_META.depth,
            (defensiveDepth) => onChange({ defensiveDepth }),
          )}
        </TacticalSection>

        <TacticalSection title="Attacking tactics">
          <TacticalRow
            active={activeSetting === "offensiveStyle"}
            onActivate={() => setActiveSetting("offensiveStyle")}
          >
            <StyleField
              label="Build-up style"
              value={content.offensiveStyle}
              options={OFFENSIVE_STYLE_OPTIONS}
              onChange={(offensiveStyle) => onChange({ offensiveStyle })}
              disabled={disabled}
              hideDescription
            />
          </TacticalRow>
          {sliderRow(
            "offensiveWidth",
            "Width",
            "Attacking width",
            SLIDER_META.width,
            (offensiveWidth) => onChange({ offensiveWidth }),
          )}
          {sliderRow(
            "playersInBox",
            "Players in box",
            "Players in box",
            SLIDER_META.playersInBox,
            (playersInBox) => onChange({ playersInBox }),
          )}
          {sliderRow(
            "cornersCommitment",
            "Corners",
            "Corner commitment",
            SLIDER_META.commitment,
            (cornersCommitment) => onChange({ cornersCommitment }),
          )}
          {sliderRow(
            "freeKicksCommitment",
            "Free kicks",
            "Free kick commitment",
            SLIDER_META.commitment,
            (freeKicksCommitment) => onChange({ freeKicksCommitment }),
          )}
        </TacticalSection>
      </div>

      {/* ── Live preview ──────────────────────────────────────────────────── */}
      <TacticalPreviewPanel
        formation={formation}
        tactics={content}
        activeSetting={activeSetting}
        className="min-w-0 lg:sticky lg:top-6 lg:self-start"
      />
    </div>
  );
}

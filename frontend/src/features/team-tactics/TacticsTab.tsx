/**
 * The Tactics tab — the core defensive / offensive sliders and style
 * dropdowns, laid out as two cards (Defence, Offence) exactly like FIFA's
 * Custom Tactics screen.
 */

import type { GamePlanTactics } from "@/services/gamePlans";
import { StyleField } from "./StyleField";
import { TacticsSlider } from "./TacticsSlider";
import {
  DEFENSIVE_STYLE_OPTIONS,
  OFFENSIVE_STYLE_OPTIONS,
  SLIDER_META,
} from "./tactics-options";

interface TacticsTabProps {
  content: GamePlanTactics;
  onChange: (patch: Partial<GamePlanTactics>) => void;
  disabled?: boolean;
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function TacticsTab({ content, onChange, disabled }: TacticsTabProps) {
  return (
    <div className="space-y-6">
      <SectionCard title="Defence">
        <StyleField
          label="Defensive style"
          value={content.defensiveStyle}
          options={DEFENSIVE_STYLE_OPTIONS}
          onChange={(defensiveStyle) => onChange({ defensiveStyle })}
          disabled={disabled}
        />
        <TacticsSlider
          label="Width"
          value={content.defensiveWidth}
          meta={SLIDER_META.width}
          onChange={(defensiveWidth) => onChange({ defensiveWidth })}
          disabled={disabled}
        />
        <TacticsSlider
          label="Depth"
          value={content.defensiveDepth}
          meta={SLIDER_META.depth}
          onChange={(defensiveDepth) => onChange({ defensiveDepth })}
          disabled={disabled}
        />
      </SectionCard>

      <SectionCard title="Offence">
        <StyleField
          label="Offensive style"
          value={content.offensiveStyle}
          options={OFFENSIVE_STYLE_OPTIONS}
          onChange={(offensiveStyle) => onChange({ offensiveStyle })}
          disabled={disabled}
        />
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <TacticsSlider
            label="Width"
            value={content.offensiveWidth}
            meta={SLIDER_META.width}
            onChange={(offensiveWidth) => onChange({ offensiveWidth })}
            disabled={disabled}
          />
          <TacticsSlider
            label="Players in box"
            value={content.playersInBox}
            meta={SLIDER_META.playersInBox}
            onChange={(playersInBox) => onChange({ playersInBox })}
            disabled={disabled}
          />
          <TacticsSlider
            label="Corners"
            value={content.cornersCommitment}
            meta={SLIDER_META.commitment}
            onChange={(cornersCommitment) => onChange({ cornersCommitment })}
            disabled={disabled}
          />
          <TacticsSlider
            label="Free kicks"
            value={content.freeKicksCommitment}
            meta={SLIDER_META.commitment}
            onChange={(freeKicksCommitment) =>
              onChange({ freeKicksCommitment })
            }
            disabled={disabled}
          />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Higher Corners / Free kicks commitment sends more players forward for
          set pieces — more bodies in the box, but more exposure to the
          counter if the ball is cleared. Assign your takers on the{" "}
          <span className="font-medium text-foreground">Roles</span> tab.
        </p>
      </SectionCard>
    </div>
  );
}

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import { cn } from "@/lib/utils";
import { bodyRegionLabel } from "./body-regions";
import { recoveryTone } from "./injury-model";
import type { RecoveryGroup, RecoveryReading } from "./types";

/**
 * A minimal front-facing body glyph, filled in proportion to the group's
 * recovery.
 *
 * Deliberately schematic rather than a second 3D canvas: seven live WebGL
 * contexts on one page would cost far more than these read-at-a-glance
 * silhouettes are worth.
 */
const GROUP_SHAPES: Record<RecoveryGroup, string> = {
  // Paths are drawn in a 40 × 72 viewBox so every glyph lines up.
  head_neck: "M20 4a5 5 0 110 10 5 5 0 010-10zm-2 11h4v4h-4z",
  shoulders: "M11 21a5 4 0 018 0l-1 5-7-1zm18 0a5 4 0 00-8 0l1 5 7-1z",
  arms: "M9 22l3 1-2 16-3-1zm22 0l-3 1 2 16 3-1z",
  chest: "M13 21h14l-1 11H14z",
  core: "M14 33h12l-1 10H15z",
  back: "M13 21h14l-1 11H14zM14 33h12l-1 9H15z",
  legs: "M15 44h4l-1 24h-4zm6 0h4l1 24h-4z",
};

/** The body outline every glyph is drawn inside. */
const BODY_OUTLINE =
  "M20 3a5.5 5.5 0 015.5 5.5A5.5 5.5 0 0120 14a5.5 5.5 0 01-5.5-5.5A5.5 5.5 0 0120 3zm-7 17a7 5 0 0114 0v14l-1 10 1 24h-5l-2-22-2 22h-5l1-24-1-10z";

function RecoveryGlyph({
  group,
  percent,
}: {
  group: RecoveryGroup;
  percent: number;
}) {
  const clipId = useId();
  // The glyph fills from the bottom up, so a 61% reading is visibly emptier
  // than a 92% one even before the number is read.
  const fillHeight = (percent / 100) * 72;

  return (
    <svg
      viewBox="0 0 40 72"
      className="h-16 w-auto"
      role="presentation"
      aria-hidden="true"
    >
      <clipPath id={clipId}>
        <rect x="0" y={72 - fillHeight} width="40" height={fillHeight} />
      </clipPath>
      <path d={BODY_OUTLINE} className="fill-border/50" />
      <path d={GROUP_SHAPES[group]} className="fill-muted-foreground/35" />
      <path
        d={GROUP_SHAPES[group]}
        clipPath={`url(#${clipId})`}
        className={cn(
          percent >= 90 && "fill-emerald-400",
          percent >= 70 && percent < 90 && "fill-amber-400",
          percent < 70 && "fill-red-500",
        )}
      />
    </svg>
  );
}

interface MuscleRecoveryStripProps {
  readings: readonly RecoveryReading[];
  className?: string;
}

/**
 * Per-region recovery, derived from the athlete's injury records.
 *
 * These are NOT physiological or training-load measurements, and the panel
 * says so: a region with no open injury reads 100% because nothing is known
 * to be wrong with it, not because anything was measured. The disclosure is
 * part of the component rather than page copy so it cannot be reused without
 * the caveat.
 */
export function MuscleRecoveryStrip({
  readings,
  className,
}: MuscleRecoveryStripProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <AppCard className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Muscle recovery
          </h3>
          <button
            type="button"
            onClick={() => setShowInfo((open) => !open)}
            aria-expanded={showInfo}
            aria-label="How these percentages are calculated"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {showInfo && (
        <p className="mt-2 rounded-lg border border-border/60 bg-card/60 p-3 text-xs leading-relaxed text-muted-foreground">
          Derived from this athlete&apos;s injury records and rehab progress —
          not from training-load or physiological measurements. A region with
          no open injury reads 100% because nothing is recorded against it. An
          injured region climbs toward 100% as its projected return
          approaches, and a recently-returned one ramps back up over a
          fortnight.
        </p>
      )}

      <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {readings.map((reading) => {
          const tone = recoveryTone(reading.percent);

          return (
            <li
              key={reading.group}
              className="flex flex-col items-center gap-1.5 text-center"
            >
              <RecoveryGlyph
                group={reading.group}
                percent={reading.percent}
              />
              <p className="text-[11px] font-medium text-muted-foreground">
                {reading.label}
              </p>
              <p
                className={cn(
                  "w-full rounded-md border px-1 py-0.5 text-[11px] font-bold",
                  tone.className,
                )}
              >
                {reading.percent}%
              </p>
              {reading.affectedRegions.length > 0 && (
                <p className="text-[10px] leading-tight text-muted-foreground">
                  {reading.affectedRegions
                    .map((region) => bodyRegionLabel(region))
                    .join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </AppCard>
  );
}

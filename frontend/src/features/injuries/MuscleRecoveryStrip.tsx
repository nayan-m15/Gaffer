import { useEffect, useId, useState } from "react";
import { Info } from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import { cn } from "@/lib/utils";
import { bodyRegionLabel } from "./body-regions";
import { recoveryTone } from "./injury-model";
import { getSmoothPlayerSnapshot } from "./smooth-player-snapshot";
import type { RecoveryGroup, RecoveryReading } from "./types";

/**
 * Where each group's recovery fill sits, layered over the real mannequin
 * snapshot below rather than a hand-drawn outline of its own.
 */
const GROUP_SHAPES: Record<RecoveryGroup, string> = {
  // Paths are drawn in a 40 × 72 viewBox so every glyph lines up — calibrated
  // against the actual rendered mannequin's proportions (head top ≈ y2,
  // shoulders ≈ y14, arms/hips ≈ y43, feet ≈ y70), not a generic figure.
  head_neck: "M20 2a4 4 0 110 8 4 4 0 010-8zm-2.5 8h5v4h-5z",
  shoulders: "M8 13h8v6H8zM24 13h8v6h-8z",
  arms: "M7 14l3 1-2 27-3-1zM33 14l-3 1 2 27 3-1z",
  chest: "M13 19h14l-1 10H14z",
  core: "M14 29h12l-1 9H15z",
  // A front view can't distinguish the back from the chest/core it's
  // layered over, so it reuses their combined outline.
  back: "M13 19h14l-1 10H14zM14 29h12l-1 9H15z",
  legs: "M14 43h5l-1 26h-5zM21 43h5l1 26h-5z",
};

/** The flat fallback outline shown until the mannequin snapshot is ready. */
const BODY_OUTLINE =
  "M20 3a5.5 5.5 0 015.5 5.5A5.5 5.5 0 0120 14a5.5 5.5 0 01-5.5-5.5A5.5 5.5 0 0120 3zm-7 17a7 5 0 0114 0v14l-1 10 1 24h-5l-2-22-2 22h-5l1-24-1-10z";

/** Tailwind's `red-700` (#b91c1c) as an sRGB feColorMatrix output row, so the
 * recoloured mannequin matches the 3D model's own hover-red exactly. */
const HIGHLIGHT_COLOR_MATRIX =
  "0 0 0 0 0.725  0 0 0 0 0.110  0 0 0 0 0.110  0 0 0 1 0";

function RecoveryGlyph({
  group,
  percent,
  snapshotUrl,
}: {
  group: RecoveryGroup;
  percent: number;
  /** The shared smooth_player.glb render, once available (see
   * `smooth-player-snapshot.ts`) — null while it's still loading. */
  snapshotUrl: string | null;
}) {
  const groupClipId = useId();
  const filterId = useId();
  // Same two-tone language as the 3D model: a near-white body at rest, and
  // its dark-red hover colour once a region needs attention — no
  // traffic-light amber tier here, and nothing drawn at all once ready.
  const needsHighlight = percent < 90;
  // The whole group glows at once rather than filling bottom-up: a "legs"
  // reading covers both legs' quad/hamstring/knee/calf/ankle at once, so a
  // partial-height reveal within that band would land on whichever sub-part
  // happens to sit lowest (the ankle) regardless of which one is actually
  // hurt. Intensity carries the magnitude instead — lower percent glows
  // stronger — without implying a location the data doesn't have.
  const highlightOpacity = 0.4 + 0.6 * (1 - percent / 100);

  if (!snapshotUrl) {
    // Loading placeholder: no raster snapshot exists yet to recolour, so
    // this falls back to the old hand-drawn block until it resolves.
    return (
      <svg
        viewBox="0 0 40 72"
        className="h-16 w-auto"
        role="presentation"
        aria-hidden="true"
      >
        <path d={BODY_OUTLINE} className="fill-white/20" />
        {needsHighlight && (
          <path
            d={GROUP_SHAPES[group]}
            className="fill-red-700"
            opacity={highlightOpacity}
          />
        )}
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 40 72"
      className="h-16 w-auto"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={groupClipId}>
          <path d={GROUP_SHAPES[group]} />
        </clipPath>
        {/* Recolours the mannequin's own pixels to the highlight red,
         * keeping its alpha — so the highlight hugs the actual silhouette
         * instead of a synthetic block sitting on top of it. */}
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={HIGHLIGHT_COLOR_MATRIX} />
        </filter>
      </defs>

      <image href={snapshotUrl} x="0" y="0" width="40" height="72" opacity="0.9" />

      {needsHighlight && (
        <g clipPath={`url(#${groupClipId})`}>
          <image
            href={snapshotUrl}
            x="0"
            y="0"
            width="40"
            height="72"
            filter={`url(#${filterId})`}
            opacity={highlightOpacity}
          />
        </g>
      )}
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
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSmoothPlayerSnapshot()
      .then((url) => {
        if (!cancelled) {
          setSnapshotUrl(url);
        }
      })
      .catch((error) => {
        console.error("Failed to render the mannequin snapshot.", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
                snapshotUrl={snapshotUrl}
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

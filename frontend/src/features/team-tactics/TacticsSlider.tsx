/**
 * A single 1–10 (or 0–10) tactics slider: caption + current value on one row,
 * a discrete range track below. Modeled on FIFA's segmented tactics sliders —
 * the underlying value is always an integer.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { SliderMeta } from "./tactics-options";

interface TacticsSliderProps {
  label: string;
  value: number;
  meta: SliderMeta;
  onChange: (value: number) => void;
  /** Show "Narrow / Wide"-style captions under the track. */
  showEndLabels?: boolean;
  disabled?: boolean;
  className?: string;
}

export function TacticsSlider({
  label,
  value,
  meta,
  onChange,
  showEndLabels = false,
  disabled = false,
  className,
}: TacticsSliderProps) {
  const id = useId();
  const { min, max } = meta;
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="text-sm font-medium text-muted-foreground"
        >
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${value} of ${max}`}
        className="tactics-slider"
        style={
          {
            "--tactics-slider-fill": `${pct}%`,
          } as React.CSSProperties
        }
      />

      {showEndLabels && (
        <div className="flex justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          <span>{meta.lowLabel}</span>
          <span>{meta.highLabel}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The in-match tactics sheet in the live logger.
 *
 * A coach changes shape mid-game the same way whether the team is eleven or
 * down to ten, so nothing here is gated on how many players are on the pitch —
 * only the squad size the match was locked at is fixed, which is why the
 * formation list is filtered to that count.
 *
 * Applying does not touch the saved game plan. It logs one `tactical_change`
 * event carrying only what the coach actually changed; the timeline stays the
 * record of what the team switched to and when.
 *
 * Styled to the logger's own visual language rather than the app shell's: a
 * full-screen, glanceable, thumb-driven surface with the clock running.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getFormationOptionsForPlayerCount } from "@/features/team-management/formations";
import type { FormationPlayerCount } from "@/features/team-management/types";
import {
  DEFENSIVE_STYLE_OPTIONS,
  OFFENSIVE_STYLE_OPTIONS,
  SLIDER_META,
} from "@/features/team-tactics/tactics-options";
import type { SliderMeta } from "@/features/team-tactics/tactics-options";
import type { GamePlanSnapshot } from "@/services/gamePlans";
import type { MatchSquadAthlete, MatchTacticalChange } from "./types";

interface LiveTacticsSheetProps {
  /** The shape in force right now — the starting plan plus earlier changes. */
  plan: Partial<GamePlanSnapshot> | undefined;
  /** Squad size the match was locked at; the formation list never leaves it. */
  playerCount: FormationPlayerCount;
  /** Players currently on the pitch, for handing over the armband. */
  onPitch: MatchSquadAthlete[];
  minute: number;
  /** Logs one tactical_change event with just the fields that moved. */
  onApply: (change: MatchTacticalChange) => void;
  onClose: () => void;
}

const SLIDERS: {
  field: keyof MatchTacticalChange & keyof typeof FIELD_META;
  label: string;
}[] = [
  { field: "defensiveWidth", label: "Defensive width" },
  { field: "defensiveDepth", label: "Defensive depth" },
  { field: "offensiveWidth", label: "Attacking width" },
  { field: "playersInBox", label: "Players in box" },
];

const FIELD_META = {
  defensiveWidth: SLIDER_META.width,
  defensiveDepth: SLIDER_META.depth,
  offensiveWidth: SLIDER_META.width,
  playersInBox: SLIDER_META.playersInBox,
} satisfies Record<string, SliderMeta>;

export function LiveTacticsSheet({
  plan,
  playerCount,
  onPitch,
  minute,
  onApply,
  onClose,
}: LiveTacticsSheetProps) {
  /** Only what the coach has touched in this sheet — the event is a delta. */
  const [draft, setDraft] = useState<MatchTacticalChange>({});

  const formationOptions = useMemo(
    () => getFormationOptionsForPlayerCount(playerCount),
    [playerCount],
  );

  const current = { ...plan, ...draft };
  const changedCount = Object.keys(draft).length;

  const set = <K extends keyof MatchTacticalChange>(
    field: K,
    value: MatchTacticalChange[K],
  ) => setDraft((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-tactics-title"
        className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#2a2e31] bg-[#090a0b] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <p
          id="live-tactics-title"
          className="font-oswald text-2xl tracking-widest text-[#16d99a]"
        >
          TACTICS
        </p>
        <p className="mt-1 text-sm text-[#9ca39f]">
          {minute}&apos; &middot; {playerCount}-a-side
        </p>

        {/* ── Formation ─────────────────────────────────────────────────── */}
        <p className="mt-5 font-oswald text-xs tracking-[0.2em] text-[#9ca39f]">
          FORMATION
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {formationOptions.map((option) => {
            const active = current.formationId === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => set("formationId", option.value)}
                className={cn(
                  "rounded-lg border px-2 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "border-[#16d99a] bg-[#16d99a]/15 text-[#16d99a]"
                    : "border-[#2a2e31] bg-[#121415] text-[#d5dad7]",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {/* ── Styles ────────────────────────────────────────────────────── */}
        <StyleRow
          caption="DEFENSIVE STYLE"
          options={DEFENSIVE_STYLE_OPTIONS}
          value={current.defensiveStyle}
          onChange={(value) => set("defensiveStyle", value)}
        />
        <StyleRow
          caption="BUILD-UP STYLE"
          options={OFFENSIVE_STYLE_OPTIONS}
          value={current.offensiveStyle}
          onChange={(value) => set("offensiveStyle", value)}
        />

        {/* ── Sliders ───────────────────────────────────────────────────── */}
        {SLIDERS.map(({ field, label }) => {
          const meta = FIELD_META[field];
          const value = (current[field] as number | undefined) ?? meta.neutral;
          return (
            <div key={field} className="mt-5">
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor={`live-tactic-${field}`}
                  className="font-oswald text-xs tracking-[0.2em] text-[#9ca39f]"
                >
                  {label.toUpperCase()}
                </label>
                <span className="text-sm font-semibold tabular-nums text-[#d5dad7]">
                  {value}
                </span>
              </div>
              <input
                id={`live-tactic-${field}`}
                type="range"
                min={meta.min}
                max={meta.max}
                step={1}
                value={value}
                aria-label={label}
                onChange={(event) => set(field, Number(event.target.value))}
                className="tactics-slider mt-2"
                style={
                  {
                    "--tactics-slider-fill": `${
                      ((value - meta.min) / (meta.max - meta.min)) * 100
                    }%`,
                  } as React.CSSProperties
                }
              />
              <div className="flex justify-between text-[10px] font-medium uppercase tracking-wide text-[#6f7673]">
                <span>{meta.lowLabel}</span>
                <span>{meta.highLabel}</span>
              </div>
            </div>
          );
        })}

        {/* ── Armband ───────────────────────────────────────────────────── */}
        {onPitch.length > 0 && (
          <>
            <p className="mt-5 font-oswald text-xs tracking-[0.2em] text-[#9ca39f]">
              CAPTAIN
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {onPitch.map((athlete) => {
                const active = current.captainId === athlete.id;
                return (
                  <button
                    key={athlete.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set("captainId", athlete.id)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-[#16d99a] bg-[#16d99a]/15 text-[#16d99a]"
                        : "border-[#2a2e31] bg-[#121415] text-[#d5dad7]",
                    )}
                  >
                    {athlete.squadNumber != null && `${athlete.squadNumber} `}
                    {athlete.lastName.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#2a2e31] bg-[#121415] px-3 py-3 font-oswald text-sm tracking-widest text-[#9ca39f]"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={changedCount === 0}
            onClick={() => onApply(draft)}
            className="flex-1 rounded-lg bg-[#16d99a] px-3 py-3 font-oswald text-sm tracking-widest text-[#06130e] disabled:opacity-40"
          >
            APPLY{changedCount > 0 ? ` (${changedCount})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function StyleRow<T extends string>({
  caption,
  options,
  value,
  onChange,
}: {
  caption: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <>
      <p className="mt-5 font-oswald text-xs tracking-[0.2em] text-[#9ca39f]">
        {caption}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-[#16d99a] bg-[#16d99a]/15 text-[#16d99a]"
                  : "border-[#2a2e31] bg-[#121415] text-[#d5dad7]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

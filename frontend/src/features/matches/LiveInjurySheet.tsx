import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BODY_REGIONS,
  COMMON_BODY_REGIONS,
  INJURY_TYPE_LABELS,
  SEVERITIES,
  SEVERITY_GRADES,
  SEVERITY_LABELS,
  bodyRegionLabel,
  injuryTypesForRegion,
} from "@/features/injuries/body-regions";
import { useInjuryProtocol } from "@/features/injuries/hooks";
import { returnWindowLabel } from "@/features/injuries/injury-model";
import type {
  BodyRegion,
  InjurySeverity,
  InjuryType,
} from "@/features/injuries/types";
import type { MatchSquadAthlete } from "./types";

export interface LiveInjurySpec {
  bodyRegion: BodyRegion;
  injuryType: InjuryType;
  severity: InjurySeverity;
}

interface LiveInjurySheetProps {
  athlete: MatchSquadAthlete;
  minute: number;
  /** Logs the match event and creates the injury record. */
  onConfirm: (spec: LiveInjurySpec) => void;
  /** Logs the match event alone, exactly as the logger did before. */
  onSkip: () => void;
  onClose: () => void;
}

function lastName(athlete: MatchSquadAthlete) {
  return athlete.lastName;
}

/**
 * The injury-specification step in the live logger.
 *
 * Three taps — region, kind, severity — and it is deliberately skippable.
 * The clock is running and a mandatory substitution is waiting behind this
 * sheet, so a coach who has no time to classify the injury must be able to
 * log it and move on; the record can be completed afterwards on the Injury
 * & Recovery page.
 *
 * Styled to the logger's own visual language rather than the app shell's:
 * this is a full-screen, glanceable, thumb-driven surface.
 */
export function LiveInjurySheet({
  athlete,
  minute,
  onConfirm,
  onSkip,
  onClose,
}: LiveInjurySheetProps) {
  const [bodyRegion, setBodyRegion] = useState<BodyRegion | null>(null);
  const [injuryType, setInjuryType] = useState<InjuryType | null>(null);
  const [severity, setSeverity] = useState<InjurySeverity | null>(null);

  /* Only the plausible types for the chosen region are offered; a head
   * injury is not a "strain", and mid-match is the wrong moment to scroll a
   * starting lineup. */
  const typeOptions = useMemo(
    () => (bodyRegion ? injuryTypesForRegion(bodyRegion).slice(0, 4) : []),
    [bodyRegion],
  );

  const protocol = useInjuryProtocol({ bodyRegion, injuryType, severity });
  const complete = bodyRegion && injuryType && severity;

  const squadLabel =
    athlete.squadNumber != null ? `#${athlete.squadNumber} ` : "";

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
        aria-labelledby="live-injury-title"
        className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#2a2e31] bg-[#090a0b] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <p
          id="live-injury-title"
          className="font-oswald text-2xl tracking-widest text-[#e36a6d]"
        >
          INJURY
        </p>
        <p className="mt-1 text-sm text-[#9ca39f]">
          {squadLabel}
          {lastName(athlete).toUpperCase()} &middot; {minute}&apos;
        </p>

        {/* 1. Region */}
        <p className="mt-5 font-oswald text-xs tracking-[0.2em] text-[#9ca39f]">
          WHERE?
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {COMMON_BODY_REGIONS.map((region) => (
            <button
              key={region}
              type="button"
              onClick={() => {
                setBodyRegion(region);
                // A region change can invalidate the chosen kind, so the
                // next two steps reset rather than carry a stale pick.
                setInjuryType(null);
                setSeverity(null);
              }}
              aria-pressed={bodyRegion === region}
              className={cn(
                "rounded-xl border-2 py-3 text-sm font-semibold tracking-wide transition-colors",
                bodyRegion === region
                  ? "border-[#e36a6d] bg-[#e36a6d]/15 text-white"
                  : "border-[#3e4448] bg-[#111315] text-[#c7ccc9]",
              )}
            >
              {bodyRegionLabel(region)}
            </button>
          ))}
        </div>
        <label className="mt-2 block">
          <span className="sr-only">Another body region</span>
          <select
            value={
              bodyRegion && !COMMON_BODY_REGIONS.includes(bodyRegion)
                ? bodyRegion
                : ""
            }
            onChange={(event) => {
              setBodyRegion(event.target.value as BodyRegion);
              setInjuryType(null);
              setSeverity(null);
            }}
            className="h-11 w-full rounded-xl border-2 border-[#3e4448] bg-[#111315] px-3 text-sm text-[#c7ccc9]"
          >
            <option value="" disabled>
              Somewhere else&hellip;
            </option>
            {/* Every region stays reachable; the grid above is only the
                fast path for the common ones. */}
            {BODY_REGIONS.map((region) => (
              <option key={region} value={region}>
                {bodyRegionLabel(region)}
              </option>
            ))}
          </select>
        </label>

        {/* 2. Kind */}
        {bodyRegion && (
          <>
            <p className="mt-5 font-oswald text-xs tracking-[0.2em] text-[#9ca39f]">
              WHAT KIND?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {typeOptions.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setInjuryType(type)}
                  aria-pressed={injuryType === type}
                  className={cn(
                    "rounded-xl border-2 py-3 text-sm font-semibold tracking-wide transition-colors",
                    injuryType === type
                      ? "border-[#e36a6d] bg-[#e36a6d]/15 text-white"
                      : "border-[#3e4448] bg-[#111315] text-[#c7ccc9]",
                  )}
                >
                  {INJURY_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </>
        )}

        {/* 3. Severity */}
        {injuryType && (
          <>
            <p className="mt-5 font-oswald text-xs tracking-[0.2em] text-[#9ca39f]">
              HOW BAD?
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {SEVERITIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSeverity(option)}
                  aria-pressed={severity === option}
                  className={cn(
                    "rounded-xl border-2 py-3 transition-colors",
                    severity === option
                      ? "border-[#e36a6d] bg-[#e36a6d]/15 text-white"
                      : "border-[#3e4448] bg-[#111315] text-[#c7ccc9]",
                  )}
                >
                  <span className="block text-sm font-semibold">
                    {SEVERITY_LABELS[option]}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[#9ca39f]">
                    {SEVERITY_GRADES[option]}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* The estimate, resolved by the backend from the same guidance table
            that gets persisted on the record. */}
        {complete && (
          <div
            className="mt-5 rounded-xl border border-[#3e4448] bg-[#111315] px-4 py-3"
            aria-live="polite"
          >
            <p className="font-oswald text-xs tracking-[0.2em] text-[#9ca39f]">
              ESTIMATED RETURN
            </p>
            <p className="mt-0.5 font-oswald text-xl tracking-widest text-white">
              {protocol.data
                ? returnWindowLabel(
                    protocol.data.minDays,
                    protocol.data.maxDays,
                  ).toUpperCase()
                : "…"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#9ca39f]">
              A planning range, not medical advice. Adjustable on the record.
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-2.5">
          <button
            type="button"
            disabled={!complete}
            onClick={() =>
              complete &&
              onConfirm({
                bodyRegion: bodyRegion!,
                injuryType: injuryType!,
                severity: severity!,
              })
            }
            className="rounded-2xl border-2 border-[#16d99a] bg-[#16d99a]/10 py-5 font-oswald text-lg tracking-widest text-[#16d99a] disabled:border-[#3e4448] disabled:bg-[#111315] disabled:text-[#54606d]"
          >
            LOG &amp; SUBSTITUTE
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-2xl border border-[#3e4448] bg-[#111315] py-4 font-oswald tracking-widest text-[#c7ccc9]"
          >
            SKIP DETAILS
          </button>
          <p className="text-center text-[11px] text-[#9ca39f]">
            Skipping still logs the injury and the substitution. Add the
            details later on the Injury &amp; Recovery page.
          </p>
        </div>
      </div>
    </div>
  );
}

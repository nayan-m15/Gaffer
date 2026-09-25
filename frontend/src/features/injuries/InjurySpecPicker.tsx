import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BODY_REGIONS,
  COMMON_BODY_REGIONS,
  INJURY_TYPE_LABELS,
  SEVERITIES,
  SEVERITY_GRADES,
  SEVERITY_LABELS,
  bodyRegionLabel,
  injuryTypesForRegion,
} from "./body-regions";
import { returnWindowLabel } from "./injury-model";
import type {
  BodyRegion,
  InjuryProtocolPreview,
  InjurySeverity,
  InjuryType,
} from "./types";

/** Static — computed once, not per render, since `BODY_REGIONS` never changes. */
const BODY_REGION_ITEMS: Record<string, string> = Object.fromEntries(
  BODY_REGIONS.map((region) => [region, bodyRegionLabel(region)]),
);

export interface InjurySpec {
  bodyRegion: BodyRegion | null;
  injuryType: InjuryType | null;
  severity: InjurySeverity | null;
}

interface InjurySpecPickerProps {
  value: InjurySpec;
  onChange: (next: InjurySpec) => void;
  /** Live guidance for the current selection, once all three are chosen. */
  preview?: InjuryProtocolPreview;
  isPreviewLoading?: boolean;
  className?: string;
}

function ChoiceButton({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
        selected
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-border/70 bg-card/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The three-step diagnosis picker: region, then kind, then severity.
 *
 * The common regions are offered as buttons with every region behind a
 * select, and the kinds are ordered likeliest-first for the chosen region —
 * a head injury leads with concussion, a hamstring with strain. The live
 * logger has its own sheet built to the logger's visual language, so this
 * one is free to be the roomy, unhurried version.
 */
export function InjurySpecPicker({
  value,
  onChange,
  preview,
  isPreviewLoading = false,
  className,
}: InjurySpecPickerProps) {
  const typeOptions = value.bodyRegion
    ? injuryTypesForRegion(value.bodyRegion)
    : [];

  const selectRegion = (bodyRegion: BodyRegion) => {
    // A region change can invalidate the chosen kind (a "concussion" does
    // not survive a switch to the hamstring), so the later steps reset.
    onChange({ bodyRegion, injuryType: null, severity: null });
  };

  return (
    <div className={cn("space-y-4", className)}>
      <fieldset>
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          1. Body region
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {COMMON_BODY_REGIONS.map((region) => (
            <ChoiceButton
              key={region}
              selected={value.bodyRegion === region}
              onClick={() => selectRegion(region)}
            >
              {bodyRegionLabel(region)}
            </ChoiceButton>
          ))}
        </div>
        <Select
          items={BODY_REGION_ITEMS}
          value={
            value.bodyRegion &&
            !COMMON_BODY_REGIONS.includes(value.bodyRegion)
              ? value.bodyRegion
              : null
          }
          onValueChange={(region) => region && selectRegion(region as BodyRegion)}
        >
          <SelectTrigger
            aria-label="Body region"
            className="mt-2 h-9 w-full justify-between rounded-lg border-border/70 bg-card/70 px-2 text-sm text-foreground"
          >
            <SelectValue placeholder="Another region…" />
          </SelectTrigger>
          <SelectContent>
            {BODY_REGIONS.map((region) => (
              <SelectItem key={region} value={region}>
                {bodyRegionLabel(region)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </fieldset>

      <fieldset disabled={!value.bodyRegion} className="disabled:opacity-45">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          2. Kind of injury
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {typeOptions.map((type) => (
            <ChoiceButton
              key={type}
              selected={value.injuryType === type}
              onClick={() => onChange({ ...value, injuryType: type })}
            >
              {INJURY_TYPE_LABELS[type]}
            </ChoiceButton>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!value.injuryType} className="disabled:opacity-45">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          3. Severity
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {SEVERITIES.map((severity) => (
            <ChoiceButton
              key={severity}
              selected={value.severity === severity}
              onClick={() => onChange({ ...value, severity })}
              className="flex flex-col items-center gap-0.5 py-2"
            >
              <span>{SEVERITY_LABELS[severity]}</span>
              <span className="text-[10px] font-normal opacity-70">
                {SEVERITY_GRADES[severity]}
              </span>
            </ChoiceButton>
          ))}
        </div>
      </fieldset>

      {/* The live estimate. Resolved by the backend from the same guidance
          table that will be persisted, so the preview cannot disagree with
          the record. */}
      <div
        className="rounded-lg border border-border/70 bg-card/60 px-3 py-2.5"
        aria-live="polite"
      >
        {isPreviewLoading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2
              className="size-3.5 animate-spin text-primary"
              aria-hidden="true"
            />
            Estimating return time&hellip;
          </p>
        ) : preview ? (
          <>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Estimated return
            </p>
            <p className="text-sm font-semibold text-foreground">
              {returnWindowLabel(preview.minDays, preview.maxDays)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Guidance range for planning, not medical advice. A coach can
              adjust it on the record.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Choose a region, kind and severity to see an estimated return.
          </p>
        )}
      </div>
    </div>
  );
}

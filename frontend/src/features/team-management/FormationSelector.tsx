/**
 * Match-format + formation selectors for the Team Management toolbar, rendered
 * as two labelled fields ("Players" and "Formation").
 *
 * Switching format chooses that format's default formation. The lineup hook
 * remaps existing starters and moves overflow players to the bench.
 *
 * The two fields are exported separately as well as together, because the
 * phone layout splits them up: the formation sits in the one visible control
 * row and the match format moves into the options popover beside it.
 */

import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  FORMAT_OPTIONS,
  getDefaultFormationIdForPlayerCount,
  getFormationOptionsForPlayerCount,
  getFormationPlayerCount,
} from "./formations";
import { ToolbarDivider, ToolbarField } from "./ToolbarField";

import type { FormationPlayerCount } from "./types";

interface FormationSelectorProps {
  value: string;
  onChange: (formationId: string) => void;
}

interface FieldProps {
  value: string;
  onChange: (formationId: string) => void;
  /** Drops the caption above the control; the select keeps its aria-label. */
  hideLabel?: boolean;
  className?: string;
}

/**
 * Wraps a control in its toolbar caption, or returns it bare when the caller
 * has no room for one.
 */
function Field({
  label,
  htmlFor,
  hideLabel,
  children,
}: {
  label: string;
  htmlFor: string;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  if (hideLabel) return <>{children}</>;
  return (
    <ToolbarField label={label} htmlFor={htmlFor}>
      {children}
    </ToolbarField>
  );
}

/** How many players a side — 5, 7 or 11. */
export function MatchFormatField({
  value,
  onChange,
  hideLabel,
  className,
}: FieldProps) {
  const playerCount = getFormationPlayerCount(value);

  return (
    <Field label="Players" htmlFor="format-select" hideLabel={hideLabel}>
      <Select
        value={String(playerCount)}
        onValueChange={(val) => {
          const next = Number(val) as FormationPlayerCount;

          if (next === 5 || next === 7 || next === 11) {
            onChange(getDefaultFormationIdForPlayerCount(next));
          }
        }}
      >
        <SelectTrigger
          id="format-select"
          aria-label="Select match format"
          className={cn("h-8 w-[4.5rem] font-semibold", className)}
        >
          <SelectValue placeholder="Players" />
        </SelectTrigger>

        <SelectContent>
          {FORMAT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Which shape those players line up in. */
export function FormationField({
  value,
  onChange,
  hideLabel,
  className,
}: FieldProps) {
  const playerCount = getFormationPlayerCount(value);
  const formationOptions = getFormationOptionsForPlayerCount(playerCount);

  return (
    <Field label="Formation" htmlFor="formation-select" hideLabel={hideLabel}>
      <Select
        value={value}
        onValueChange={(val) => {
          if (val) {
            onChange(val);
          }
        }}
      >
        <SelectTrigger
          id="formation-select"
          aria-label="Select formation"
          className={cn("h-8 w-32 font-semibold", className)}
        >
          <SelectValue placeholder="Select formation" />
        </SelectTrigger>

        <SelectContent
          alignItemWithTrigger={false}
          className="max-h-[min(20rem,var(--available-height))]"
        >
          {formationOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function FormationSelector({ value, onChange }: FormationSelectorProps) {
  return (
    <>
      <MatchFormatField value={value} onChange={onChange} />
      <ToolbarDivider />
      <FormationField value={value} onChange={onChange} />
    </>
  );
}

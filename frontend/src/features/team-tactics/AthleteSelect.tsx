/**
 * A single-athlete picker used by the role cards (captain, penalty taker, …).
 * Includes an explicit "None" entry so a role can be cleared.
 *
 * The caller may suppress the visible caption when the surrounding card already
 * names the role; the accessible name still comes from `label` either way.
 */

import { useId, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { athleteOptionLabel } from "@/features/team-management/athlete-display";
import type { BackendAthlete } from "@/services/athletes";

/** Sentinel for the "no athlete assigned" option. */
export const NO_ATHLETE_VALUE = "__none__";

interface AthleteSelectProps {
  label: string;
  value: string | null;
  athletes: BackendAthlete[];
  onChange: (athleteId: string | null) => void;
  /** Hide the caption when the surrounding card already carries the role name. */
  hideLabel?: boolean;
  /** Fired when the list opens — lets a card become the active one on focus. */
  onOpen?: () => void;
  /** Explicit trigger id, when something outside needs to point at it. */
  triggerId?: string;
  disabled?: boolean;
  /** Extra classes for the trigger. */
  className?: string;
}

export function AthleteSelect({
  label,
  value,
  athletes,
  onChange,
  hideLabel = false,
  onOpen,
  triggerId,
  disabled,
  className,
}: AthleteSelectProps) {
  const generatedId = useId();
  const id = triggerId ?? generatedId;

  const items = useMemo(() => {
    const map: Record<string, string> = { [NO_ATHLETE_VALUE]: "None" };
    for (const a of athletes) map[a.id] = athleteOptionLabel(a);
    return map;
  }, [athletes]);

  return (
    <div className="flex flex-col gap-2">
      {!hideLabel && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-muted-foreground"
        >
          {label}
        </label>
      )}
      <Select
        items={items}
        value={value ?? NO_ATHLETE_VALUE}
        onValueChange={(val) => {
          if (!val) return;
          onChange(val === NO_ATHLETE_VALUE ? null : val);
        }}
        onOpenChange={(open) => {
          if (open) onOpen?.();
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={label}
          className={cn("h-11 w-full", className)}
        >
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ATHLETE_VALUE}>None</SelectItem>
          {athletes.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {athleteOptionLabel(a)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * A single-athlete picker used by the Roles tab (captain, penalty taker, …).
 * Includes an explicit "None" entry so a role can be cleared.
 */

import { useId, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BackendAthlete } from "@/services/athletes";

/** Sentinel for the "no athlete assigned" option. */
export const NO_ATHLETE_VALUE = "__none__";

function athleteLabel(a: BackendAthlete): string {
  const name = `${a.firstName} ${a.lastName}`.trim();
  return a.squadNumber != null ? `${a.squadNumber} · ${name}` : name;
}

interface AthleteSelectProps {
  label: string;
  value: string | null;
  athletes: BackendAthlete[];
  onChange: (athleteId: string | null) => void;
  disabled?: boolean;
}

export function AthleteSelect({
  label,
  value,
  athletes,
  onChange,
  disabled,
}: AthleteSelectProps) {
  const id = useId();

  const items = useMemo(() => {
    const map: Record<string, string> = { [NO_ATHLETE_VALUE]: "None" };
    for (const a of athletes) map[a.id] = athleteLabel(a);
    return map;
  }, [athletes]);

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-sm font-medium text-muted-foreground"
      >
        {label}
      </label>
      <Select
        items={items}
        value={value ?? NO_ATHLETE_VALUE}
        onValueChange={(val) => {
          if (!val) return;
          onChange(val === NO_ATHLETE_VALUE ? null : val);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={label} className="h-11 w-full">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ATHLETE_VALUE}>None</SelectItem>
          {athletes.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {athleteLabel(a)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

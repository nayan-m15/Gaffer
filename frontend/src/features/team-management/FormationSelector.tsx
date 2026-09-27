/**
 * Match-format + formation selectors for the Team Management page.
 *
 * Switching format chooses that format's default formation. The lineup hook
 * remaps existing starters and moves overflow players to the bench.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FORMAT_OPTIONS,
  getDefaultFormationIdForPlayerCount,
  getFormationOptionsForPlayerCount,
  getFormationPlayerCount,
} from "./formations";
import type { FormationPlayerCount } from "./types";

interface FormationSelectorProps {
  value: string;
  onChange: (formationId: string) => void;
}

export function FormationSelector({ value, onChange }: FormationSelectorProps) {
  const playerCount = getFormationPlayerCount(value);
  const formationOptions = getFormationOptionsForPlayerCount(playerCount);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor="format-select"
        className="text-xs font-medium text-muted-foreground"
      >
        Format
      </label>
      <Select
        value={String(playerCount)}
        onValueChange={(val) => {
          const next = Number(val) as FormationPlayerCount;
          if (next === 5 || next === 7 || next === 11) {
            onChange(getDefaultFormationIdForPlayerCount(next));
          }
        }}
      >
        <SelectTrigger id="format-select" aria-label="Select match format">
          <SelectValue placeholder="Select format" />
        </SelectTrigger>
        <SelectContent>
          {FORMAT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label
        htmlFor="formation-select"
        className="text-xs font-medium text-muted-foreground"
      >
        Formation
      </label>
      <Select
        value={value}
        onValueChange={(val) => {
          if (val) onChange(val);
        }}
      >
        <SelectTrigger id="formation-select" aria-label="Select formation">
          <SelectValue placeholder="Select formation" />
        </SelectTrigger>
        <SelectContent>
          {formationOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

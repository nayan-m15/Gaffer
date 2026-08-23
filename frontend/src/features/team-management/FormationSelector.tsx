/**
 * Formation selector dropdown for the Team Management page.
 *
 * Uses the existing Select component from the design system and lists
 * all supported football formations.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMATION_OPTIONS } from "./formations";

interface FormationSelectorProps {
  value: string;
  onChange: (formationId: string) => void;
}

export function FormationSelector({ value, onChange }: FormationSelectorProps) {
  return (
    <div className="flex items-center gap-2">
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
          {FORMATION_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Match-format + formation selectors for the Team Management toolbar, rendered
 * as two labelled fields ("Players" and "Formation").
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
import { ToolbarDivider, ToolbarField } from "./ToolbarField";

import type { FormationPlayerCount } from "./types";

interface FormationSelectorProps {
  value: string;
  onChange: (formationId: string) => void;
}

export function FormationSelector({
  value,
  onChange,
}: FormationSelectorProps) {
  const playerCount = getFormationPlayerCount(value);

  const formationOptions =
    getFormationOptionsForPlayerCount(playerCount);

  return (
    <>
      <ToolbarField label="Players" htmlFor="format-select">
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
            className="h-8 w-[4.5rem] font-semibold"
          >
            <SelectValue placeholder="Players" />
          </SelectTrigger>

          <SelectContent>
            {FORMAT_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={String(option.value)}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ToolbarField>

      <ToolbarDivider />

      <ToolbarField label="Formation" htmlFor="formation-select">
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
            className="h-8 w-32 font-semibold"
          >
            <SelectValue placeholder="Select formation" />
          </SelectTrigger>

          <SelectContent
            alignItemWithTrigger={false}
            className="max-h-[min(20rem,var(--available-height))]"
          >
            {formationOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ToolbarField>
    </>
  );
}

/**
 * Lineup selector dropdown for the Team Management page.
 *
 * Lists the team's saved lineups by name plus a "New lineup" entry that
 * clears the board so the coach can start a fresh one.
 */

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BackendLineup } from "@/services/lineups";

/** Sentinel value for the "New lineup" entry (blank board, nothing selected). */
export const NEW_LINEUP_VALUE = "__new__";

interface LineupSelectorProps {
  lineups: BackendLineup[];
  selectedLineupId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
}

export function LineupSelector({
  lineups,
  selectedLineupId,
  onSelect,
  disabled,
}: LineupSelectorProps) {
  // Maps each option value to its label so <SelectValue> can render the
  // selected lineup's name even while the dropdown (and its items) is closed.
  const items = useMemo(() => {
    const map: Record<string, string> = { [NEW_LINEUP_VALUE]: "New lineup" };
    for (const lineup of lineups) {
      map[lineup.id] = lineup.name;
    }
    return map;
  }, [lineups]);

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="lineup-select"
        className="text-xs font-medium text-muted-foreground"
      >
        Lineup
      </label>
      <Select
        items={items}
        value={selectedLineupId ?? NEW_LINEUP_VALUE}
        onValueChange={(val) => {
          if (!val) return;
          onSelect(val === NEW_LINEUP_VALUE ? null : val);
        }}
        disabled={disabled}
      >
        <SelectTrigger id="lineup-select" aria-label="Select lineup">
          <SelectValue placeholder="New lineup" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NEW_LINEUP_VALUE}>New lineup</SelectItem>
          {lineups.map((lineup) => (
            <SelectItem key={lineup.id} value={lineup.id}>
              {lineup.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

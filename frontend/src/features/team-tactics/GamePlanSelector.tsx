/**
 * The "Game plan" field in the Team Management toolbar. Lists the team's saved
 * plans plus a "New game plan" entry that starts a fresh one from the default
 * settings.
 */

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToolbarField } from "@/features/team-management/ToolbarField";
import { cn } from "@/lib/utils";
import type { BackendGamePlan } from "@/services/gamePlans";

/** Sentinel value for the "New game plan" entry. */
export const NEW_GAME_PLAN_VALUE = "__new__";

interface GamePlanSelectorProps {
  gamePlans: BackendGamePlan[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  /** Widens the trigger when the field is stacked in a popover. */
  className?: string;
}

export function GamePlanSelector({
  gamePlans,
  selectedId,
  onSelect,
  disabled,
  className,
}: GamePlanSelectorProps) {
  const items = useMemo(() => {
    const map: Record<string, string> = {
      [NEW_GAME_PLAN_VALUE]: "New game plan",
    };
    for (const plan of gamePlans) map[plan.id] = plan.name;
    return map;
  }, [gamePlans]);

  return (
    <ToolbarField label="Game Plan" htmlFor="game-plan-select">
      <Select
        items={items}
        value={selectedId ?? NEW_GAME_PLAN_VALUE}
        onValueChange={(val) => {
          if (!val) return;
          onSelect(val === NEW_GAME_PLAN_VALUE ? null : val);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id="game-plan-select"
          aria-label="Select game plan"
          className={cn("h-8 w-36 font-semibold", className)}
        >
          <SelectValue placeholder="New game plan" />
        </SelectTrigger>
        <SelectContent>
          {gamePlans.map((plan) => (
            <SelectItem key={plan.id} value={plan.id}>
              {plan.name}
            </SelectItem>
          ))}
          {gamePlans.length > 0 && <SelectSeparator />}
          <SelectItem value={NEW_GAME_PLAN_VALUE}>New game plan…</SelectItem>
        </SelectContent>
      </Select>
    </ToolbarField>
  );
}

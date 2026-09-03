/**
 * The "Game plan" dropdown in the Team Tactics header. Lists the team's saved
 * tactical profiles plus a "New game plan" entry that starts a fresh one from
 * the default settings.
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
import type { BackendGamePlan } from "@/services/gamePlans";

/** Sentinel value for the "New game plan" entry. */
export const NEW_GAME_PLAN_VALUE = "__new__";

interface GamePlanSelectorProps {
  gamePlans: BackendGamePlan[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
}

export function GamePlanSelector({
  gamePlans,
  selectedId,
  onSelect,
  disabled,
}: GamePlanSelectorProps) {
  const items = useMemo(() => {
    const map: Record<string, string> = {
      [NEW_GAME_PLAN_VALUE]: "New game plan",
    };
    for (const plan of gamePlans) map[plan.id] = plan.name;
    return map;
  }, [gamePlans]);

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="game-plan-select"
        className="text-xs font-medium leading-tight text-muted-foreground"
      >
        Game
        <br />
        plan
      </label>
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
          className="h-10 min-w-44 font-semibold"
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
    </div>
  );
}

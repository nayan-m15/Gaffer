/**
 * One role on the assignment grid: a button that makes the role the one being
 * edited, with a player picker beneath it.
 *
 * The card body and the picker are separate controls on purpose — the card
 * selects which role the pitch is explaining, the picker assigns a player
 * without needing the pitch at all.
 */

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { athleteFullName } from "@/features/team-management/athlete-display";
import { AthleteSelect } from "@/features/team-tactics/AthleteSelect";
import type { BackendAthlete } from "@/services/athletes";
import type { RoleDefinition, TeamRole } from "./roleConfig";

interface RoleAssignmentCardProps {
  role: TeamRole;
  definition: RoleDefinition;
  icon: LucideIcon;
  athlete: BackendAthlete | null;
  /** Everyone who may hold a role — the team's athletes, as the backend allows. */
  athletes: BackendAthlete[];
  selected: boolean;
  onSelect: () => void;
  onAssign: (athleteId: string | null) => void;
  disabled?: boolean;
}

export function RoleAssignmentCard({
  role,
  definition,
  icon: Icon,
  athlete,
  athletes,
  selected,
  onSelect,
  onAssign,
  disabled,
}: RoleAssignmentCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-3 transition-colors",
        selected
          ? "border-primary bg-primary/[0.07]"
          : "border-border bg-surface-nested",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex items-start gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block text-[11px] font-semibold uppercase tracking-[0.1em]",
              selected ? "text-primary" : "text-muted-foreground",
            )}
          >
            {definition.label}
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
            {athlete ? athleteFullName(athlete) : "Unassigned"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {athlete?.position ?? "No player selected"}
          </span>
        </span>
      </button>

      <AthleteSelect
        label={definition.label}
        hideLabel
        value={athlete?.id ?? null}
        athletes={athletes}
        onChange={(athleteId) => {
          onSelect();
          onAssign(athleteId);
        }}
        onOpen={onSelect}
        disabled={disabled}
        triggerId={`role-${role}-select`}
        className="h-9"
      />
    </div>
  );
}

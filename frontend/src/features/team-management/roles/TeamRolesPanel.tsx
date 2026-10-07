/**
 * The Roles section of Team Management: the six leadership and set-piece
 * assignments on the left, and the role's explanation plus the team's pitch on
 * the right.
 *
 * The pitch is the same `TacticalMiniPitch` the Tactics screen draws, in its
 * roles mode — same markings, coordinates, markers and animation, fed the
 * current formation and the starting XI from the shared game-plan editor. Role
 * changes go through the editor's normal `patch`, so they ride the existing
 * Save and dirty-state flow with the rest of the plan.
 */

import { useMemo, useState } from "react";
import {
  CircleDot,
  CornerUpLeft,
  CornerUpRight,
  Send,
  Star,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TacticalMiniPitch } from "@/features/team-tactics/preview/TacticalMiniPitch";
import type { GamePlanEditor } from "@/features/team-tactics/useGamePlanEditor";
import { athleteFullName } from "../athlete-display";
import { RoleAssignmentCard } from "./RoleAssignmentCard";
import {
  ROLE_CONFIG,
  ROLE_ORDER,
  roleAssignee,
  roleAssignmentPatch,
  type TeamRole,
} from "./roleConfig";

const ROLE_ICON: Record<TeamRole, LucideIcon> = {
  captain: Star,
  shortFreeKick: Target,
  longFreeKick: Send,
  penalties: CircleDot,
  leftCorner: CornerUpLeft,
  rightCorner: CornerUpRight,
};

interface TeamRolesPanelProps {
  editor: GamePlanEditor;
  /** Assistant mode: roles are readable but not editable. */
  readOnly?: boolean;
}

export default function TeamRolesPanel({
  editor,
  readOnly = false,
}: TeamRolesPanelProps) {
  const {
    athletes,
    content,
    patch,
    saving,
    lineup,
    saveError,
    clearSaveError,
  } = editor;
  const [selectedRole, setSelectedRole] = useState<TeamRole>("captain");

  const athleteById = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
    [athletes],
  );

  const definition = ROLE_CONFIG[selectedRole];
  const assignedId = roleAssignee(content, selectedRole);
  const assigned = assignedId ? (athleteById.get(assignedId) ?? null) : null;
  const disabled = saving || readOnly;

  const assign = (athleteId: string | null) => {
    if (disabled) return;
    patch(roleAssignmentPatch(selectedRole, athleteId));
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
      {/* Save is reachable from every section, so every section has to be
          able to say why one was refused. */}
      {saveError && (
        <p
          role="alert"
          className="cursor-pointer rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive lg:col-span-2"
          onClick={clearSaveError}
        >
          {saveError} (dismiss)
        </p>
      )}

      {/* ── Role assignments ──────────────────────────────────────────────── */}
      <section className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Role assignments
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a role to see what it does, then choose a player here or tap one
          on the pitch.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLE_ORDER.map((role) => {
            const athleteId = roleAssignee(content, role);
            return (
              <RoleAssignmentCard
                key={role}
                role={role}
                definition={ROLE_CONFIG[role]}
                icon={ROLE_ICON[role]}
                athlete={athleteId ? (athleteById.get(athleteId) ?? null) : null}
                athletes={athletes}
                selected={selectedRole === role}
                onSelect={() => setSelectedRole(role)}
                onAssign={(nextId) =>
                  !disabled && patch(roleAssignmentPatch(role, nextId))
                }
                disabled={disabled}
              />
            );
          })}
        </div>
      </section>

      {/* ── Explanation + pitch ───────────────────────────────────────────── */}
      <aside
        className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Player roles
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {lineup.formation.name}
          </span>
        </div>

        <h3 className="mt-3 text-lg font-semibold text-foreground">
          {definition.label}
        </h3>
        <p
          className={cn(
            "mt-1 text-sm font-semibold",
            assigned ? "text-primary" : "text-muted-foreground",
          )}
        >
          {assigned ? athleteFullName(assigned) : "Unassigned"}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {definition.description}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">
          {assigned && !lineup.pitchAthleteIds.has(assigned.id)
            ? `${athleteFullName(assigned)} is not in the starting lineup, so they are not shown on the pitch.`
            : "Select a player on the pitch to give them this role."}
        </p>

        <TacticalMiniPitch
          formation={lineup.formation}
          tactics={content}
          activeSetting="defensiveStyle"
          mode="roles"
          roles={{
            assignments: lineup.assignments,
            athleteById,
            highlightedAthleteId: assignedId,
            badge: definition.badge,
            onSelectAthlete: disabled ? undefined : assign,
            selectActionLabel: `Assign as ${definition.label.toLowerCase()}`,
          }}
          ariaLabel={`Starting ${lineup.formation.name}. ${definition.label}: ${
            assigned ? athleteFullName(assigned) : "unassigned"
          }.`}
          className="mx-auto mt-4 w-full max-w-[380px]"
        />
      </aside>
    </div>
  );
}

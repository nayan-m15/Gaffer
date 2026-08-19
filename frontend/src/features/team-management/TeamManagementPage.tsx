/**
 * Team Management page — the tactical board where a coach configures their
 * starting XI, selects a formation, positions players on the pitch, and
 * manages substitutes through drag-and-drop.
 *
 * Data is loaded from the existing athlete API via TanStack Query. No dummy
 * data is used; empty and loading states are handled explicitly.
 */

import { useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  RotateCcw,
  Wand2,
  Save,
  Users,
  ShieldAlert,
  Loader2,
} from "lucide-react";

import { useAthletes } from "./api";
import { useLineupState } from "./useLineupState";
import { FootballPitch } from "./FootballPitch";
import { PitchPlayer } from "./PitchPlayer";
import { FormationSelector } from "./FormationSelector";
import { SubstitutesArea } from "./SubstitutesArea";
import type { BackendAthlete } from "@/services/athletes";

export default function TeamManagementPage() {
  const { data: athletes, isLoading, isError, refetch } = useAthletes();
  const emptyRef = useRef<BackendAthlete[]>([]);
  const athleteList = athletes ?? emptyRef.current;

  const lineup = useLineupState(athleteList);

  /* ── Lookup helpers ──────────────────────────────────────────────────────── */

  const athleteMap = useMemo(() => {
    const map = new Map<string, BackendAthlete>();
    for (const a of athleteList) {
      map.set(a.id, a);
    }
    return map;
  }, [athleteList]);

  const getAthlete = (id: string | null) =>
    id ? athleteMap.get(id) ?? null : null;

  const substituteAthletes = useMemo(
    () => lineup.substituteIds.map((id) => athleteMap.get(id)).filter(Boolean) as BackendAthlete[],
    [lineup.substituteIds, athleteMap],
  );

  /* ── Loading state ───────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading squad...</p>
        </div>
      </div>
    );
  }

  /* ── Error state ─────────────────────────────────────────────────────────── */

  if (isError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="size-8 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">
            Failed to load squad
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Something went wrong while fetching your athletes. Please try again.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  /* ── Empty state ─────────────────────────────────────────────────────────── */

  if (athleteList.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Users className="size-10 text-muted-foreground/50" />
          <h2 className="text-lg font-semibold text-foreground">
            No players available
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add players to your squad from the Roster page before creating a
            starting XI.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = "/athletes";
            }}
          >
            Go to Roster
          </Button>
        </div>
      </div>
    );
  }

  /* ── Main content ────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">
            Team Management
          </h1>
          <p className="text-xs text-muted-foreground">
            Configure your starting XI and formation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FormationSelector
            value={lineup.formationId}
            onChange={lineup.setFormation}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={lineup.autoFill}
            className="gap-1.5"
          >
            <Wand2 className="size-3.5" />
            Auto-fill
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={lineup.resetLineup}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>

          <Button variant="default" size="sm" className="gap-1.5" disabled>
            <Save className="size-3.5" />
            Save Lineup
          </Button>
        </div>
      </header>

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <StatusBar
          label="On Pitch"
          value={lineup.pitchCount}
          max={11}
          isComplete={lineup.isXiComplete}
        />
        <StatusBar
          label="Substitutes"
          value={lineup.substituteIds.length}
        />
        <StatusBadge
          label="Goalkeeper"
          ok={lineup.hasGoalkeeper}
          okText="Set"
          failText="Not set"
        />

        {!lineup.hasEnoughForXi && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            Need at least 11 players for a full XI
          </span>
        )}

        {lineup.error && (
          <span
            className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive cursor-pointer"
            onClick={lineup.clearError}
            role="alert"
          >
            {lineup.error} (dismiss)
          </span>
        )}
      </div>

      {/* ── Tactical board ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <FootballPitch>
          {lineup.formation?.positions.map((pos) => (
            <PitchPlayer
              key={pos.id}
              position={pos}
              athlete={getAthlete(lineup.assignments[pos.id] ?? null)}
              dragItem={lineup.dragItem}
              onDragStart={lineup.startDrag}
              onDragEnd={lineup.endDrag}
              onDrop={lineup.handleDrop}
            />
          ))}
        </FootballPitch>
      </div>

      {/* ── Substitutes ───────────────────────────────────────────────────── */}
      <SubstitutesArea
        athletes={substituteAthletes}
        dragItem={lineup.dragItem}
        onDragStart={lineup.startDrag}
        onDragEnd={lineup.endDrag}
        onDrop={lineup.handleDrop}
      />
    </div>
  );
}

/* ─── Status sub-components ──────────────────────────────────────────────── */

function StatusBar({
  label,
  value,
  max,
  isComplete,
}: {
  label: string;
  value: number;
  max?: number;
  isComplete?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
        isComplete
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}: {value}
      {max !== undefined ? ` / ${max}` : ""}
    </span>
  );
}

function StatusBadge({
  label,
  ok,
  okText,
  failText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
        ok
          ? "bg-primary/10 text-primary"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      {label}: {ok ? okText : failText}
    </span>
  );
}

/**
 * Team Management page — the tactical board where a coach configures their
 * starting XI, selects a formation, positions players on the pitch, and
 * manages substitutes through drag-and-drop, plus the tactics editor.
 *
 * Both sections edit one saved record: a game plan holds the squad selection
 * and the tactical settings together, so a single Save persists both.
 *
 * Data is loaded from the existing athlete API via TanStack Query. No dummy
 * data is used; empty and loading states are handled explicitly.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { RotateCcw, Wand2, Users, ShieldAlert, Loader2 } from "lucide-react";

import { useAthletes } from "./api";
import { FootballPitch } from "./FootballPitch";
import { PitchPlayer } from "./PitchPlayer";
import { FormationSelector } from "./FormationSelector";
import { SubstitutesArea } from "./SubstitutesArea";
import type { BackendAthlete } from "@/services/athletes";
import { useAuth } from "@/hooks/useAuth";
import TeamTacticsPanel from "@/features/team-tactics/TeamTacticsPage";
import { DeleteGamePlanDialog } from "@/features/team-tactics/DeleteGamePlanDialog";
import { GamePlanControls } from "@/features/team-tactics/GamePlanControls";
import { SaveGamePlanDialog } from "@/features/team-tactics/SaveGamePlanDialog";
import { useGamePlanEditor } from "@/features/team-tactics/useGamePlanEditor";

export default function TeamManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { team } = useAuth();
  // Assistants may view the squad and tactics but not modify them — the
  // management controls are hidden here and the backend rejects game-plan
  // mutations from non-coaches with 403.
  const canManageTeam = team?.role === "coach";
  const activeSection =
    searchParams.get("section") === "tactics" ? "tactics" : "squad";

  const setActiveSection = (section: "squad" | "tactics") => {
    setSearchParams(section === "tactics" ? { section } : {});
  };

  const { data: athletes, isLoading, isError, refetch } = useAthletes();
  const emptyRef = useRef<BackendAthlete[]>([]);
  const athleteList = athletes ?? emptyRef.current;

  // The single game-plan editor: it owns the tactical board (`lineup`) and the
  // tactics settings, so one Save persists both. Its controls render in the
  // header, the board below, the tab strip + bodies in <TeamTacticsPanel>.
  const gamePlanEditor = useGamePlanEditor(athleteList, isLoading);
  const {
    lineup,
    selectedPlan,
    saveError,
    clearSaveError,
    deleteError,
    clearDeleteError,
  } = gamePlanEditor;

  // Detect desktop viewport (lg breakpoint = 1024px) for horizontal pitch
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

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

  /** Squad-wide availability counts for the status bar (0 values stay hidden). */
  const unavailableCounts = useMemo(() => {
    let injured = 0;
    let suspended = 0;
    for (const athlete of athleteList) {
      if (athlete.status === "injured") injured += 1;
      else if (athlete.status === "suspended") suspended += 1;
    }
    return { injured, suspended };
  }, [athleteList]);

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
    <>
      <PageHeader
        title="Team Management"
        subtitle="Configure your starting XI, tactical formation, and matchday squad."
        actions={
          <GamePlanControls editor={gamePlanEditor} readOnly={!canManageTeam}>
            {activeSection === "squad" && canManageTeam && (
              <>
                <FormationSelector
                  value={lineup.formationId}
                  onChange={lineup.setFormation}
                />

                <Button
                  variant={lineup.autoFillEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={lineup.toggleAutoFill}
                  className="gap-1.5"
                  aria-pressed={lineup.autoFillEnabled}
                >
                  <Wand2 className="size-3.5" />
                  Auto-fill {lineup.autoFillEnabled ? "On" : "Off"}
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
              </>
            )}
          </GamePlanControls>
        }
      >
        <nav className="flex gap-1" aria-label="Team sections">
          <button
            type="button"
            onClick={() => setActiveSection("squad")}
            aria-current={activeSection === "squad" ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeSection === "squad"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Squad
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("tactics")}
            aria-current={activeSection === "tactics" ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeSection === "tactics"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Tactics
          </button>
        </nav>
      </PageHeader>

      <div className="space-y-6 p-6 sm:p-8">
        {activeSection === "tactics" ? (
          <TeamTacticsPanel editor={gamePlanEditor} readOnly={!canManageTeam} />
        ) : (
          <>
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

        {unavailableCounts.injured > 0 && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
            Injured: {unavailableCounts.injured}
          </span>
        )}

        {unavailableCounts.suspended > 0 && (
          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-700 dark:text-yellow-400">
            Suspended: {unavailableCounts.suspended}
          </span>
        )}

        {lineup.hasInjuredPitchPlayers && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            Remove injured players from the starting XI before saving
          </span>
        )}

        {lineup.hasMisplacedPlayers && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {lineup.misplacedAthleteIds.length === 1
              ? "1 player not in their optimal position"
              : `${lineup.misplacedAthleteIds.length} players not in their optimal positions`}
          </span>
        )}

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

        {saveError && (
          <span
            className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive cursor-pointer"
            onClick={clearSaveError}
            role="alert"
          >
            {saveError} (dismiss)
          </span>
        )}

        {deleteError && (
          <span
            className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive cursor-pointer"
            onClick={clearDeleteError}
            role="alert"
          >
            Failed to delete game plan. Please try again. (dismiss)
          </span>
        )}
      </div>

      {/* ── Tactical board ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <FootballPitch horizontal={isDesktop}>
          {lineup.formation?.positions.map((pos) => (
            <PitchPlayer
              key={pos.id}
              position={pos}
              athlete={getAthlete(lineup.assignments[pos.id] ?? null)}
              dragItem={lineup.dragItem}
              horizontal={isDesktop}
              readOnly={!canManageTeam}
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
        readOnly={!canManageTeam}
        onDragStart={lineup.startDrag}
        onDragEnd={lineup.endDrag}
        onDrop={lineup.handleDrop}
      />
          </>
        )}
      </div>

      <SaveGamePlanDialog
        open={gamePlanEditor.isSaveDialogOpen}
        onOpenChange={gamePlanEditor.setSaveDialogOpen}
        onSave={gamePlanEditor.saveAsNew}
      />

      <DeleteGamePlanDialog
        isOpen={gamePlanEditor.isDeleteDialogOpen}
        onClose={() => gamePlanEditor.setDeleteDialogOpen(false)}
        onConfirm={gamePlanEditor.confirmDelete}
        gamePlanName={selectedPlan?.name ?? ""}
        isDeleting={gamePlanEditor.isDeleting}
      />
    </>
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

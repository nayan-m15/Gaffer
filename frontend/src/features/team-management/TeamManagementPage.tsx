/**
 * Team Management page — the tactical board where a coach configures their
 * starting lineup, selects a formation, positions players on the pitch, and
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
import { AnimatedTabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { Users, ShieldAlert, Loader2 } from "lucide-react";

import { useAthletes } from "./api";
import { FootballPitch } from "./FootballPitch";
import { PitchPlayer } from "./PitchPlayer";
import { CustomFormationHandle } from "./CustomFormationHandle";
import { SubstitutesArea } from "./SubstitutesArea";
import {
  TeamToolbarActions,
  TeamToolbarFields,
  TeamToolbarMobile,
} from "./TeamToolbar";
import { SquadStatusStrip } from "./SquadStatusStrip";
import {
  TEAM_SECTIONS,
  toTeamSection,
  type TeamSection,
} from "./team-sections";
import type { BackendAthlete } from "@/services/athletes";
import { useAuth } from "@/hooks/useAuth";
import { GafferAiAssistant } from "@/features/ai-assistant/GafferAiAssistant";
import TeamTacticsPanel from "@/features/team-tactics/TeamTacticsPage";
import TeamRolesPanel from "./roles/TeamRolesPanel";
import PlayerInstructionsPanel from "@/features/team-tactics/instructions/PlayerInstructionsPanel";
import { ResetInstructionsDialog } from "@/features/team-tactics/instructions/ResetInstructionsDialog";
import { DeleteGamePlanDialog } from "@/features/team-tactics/DeleteGamePlanDialog";
import { SaveGamePlanDialog } from "@/features/team-tactics/SaveGamePlanDialog";
import { useGamePlanEditor } from "@/features/team-tactics/useGamePlanEditor";
import "./team-background.css";

export default function TeamManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { team } = useAuth();
  // Assistants may view the squad and tactics but not modify them — the
  // management controls are hidden here and the backend rejects game-plan
  // mutations from non-coaches with 403.
  const canManageTeam = team?.role === "coach";
  const activeSection = toTeamSection(searchParams.get("section"));

  const setActiveSection = (section: TeamSection) => {
    setSearchParams(section === "squad" ? {} : { section });
  };

  const tabItems = useMemo(
    () =>
      TEAM_SECTIONS.map(({ value, label, Icon }) => ({
        value,
        label,
        icon: <Icon className="size-4" aria-hidden="true" />,
      })),
    [],
  );

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

  /**
   * What the phone's warning figure counts: the things the wide-screen status
   * bar spells out one chip at a time.
   */
  const lineupWarningCount =
    lineup.misplacedAthleteIds.length +
    (lineup.hasGoalkeeper ? 0 : 1) +
    (lineup.hasEnoughPlayers ? 0 : 1);

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
      <div className="team-page relative isolate min-h-full">
        <div className="team-page-backdrop" aria-hidden="true" />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading squad...</p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ─────────────────────────────────────────────────────────── */

  if (isError) {
    return (
      <div className="team-page relative isolate min-h-full">
        <div className="team-page-backdrop" aria-hidden="true" />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
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
      </div>
    );
  }

  /* ── Empty state ─────────────────────────────────────────────────────────── */

  if (athleteList.length === 0) {
    return (
      <div className="team-page relative isolate min-h-full">
        <div className="team-page-backdrop" aria-hidden="true" />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center px-4">
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
      </div>
    );
  }

  /* ── Main content ────────────────────────────────────────────────────────── */

  return (
    <div className="team-page relative isolate min-h-full">
      <div className="team-page-backdrop" aria-hidden="true" />
      <div className="relative z-10">
      {/* Phone: title, then one row of controls, then straight to the pitch.
          Four tabs and a bar of labelled selectors do not fit at 360px — they
          wrapped onto four lines and left the pitch below the fold. */}
      <div className="border-b border-border bg-background/90 px-4 pb-3 pt-6 backdrop-blur-md md:hidden">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] text-foreground">
          Team Management
        </h1>
        <TeamToolbarMobile
          editor={gamePlanEditor}
          section={activeSection}
          onSectionChange={setActiveSection}
          readOnly={!canManageTeam}
          className="mt-3"
        />
      </div>

      <div className="hidden md:block">
        <PageHeader
          title="Team Management"
          subtitle="Configure your starting lineup, match format, tactical formation, and matchday squad."
          actions={
            <TeamToolbarActions
              editor={gamePlanEditor}
              section={activeSection}
              readOnly={!canManageTeam}
            />
          }
        >
          <div className="space-y-3">
            <AnimatedTabs
              items={tabItems}
              value={activeSection}
              onValueChange={setActiveSection}
              ariaLabel="Team sections"
              variant="primary"
            />
            <TeamToolbarFields
              editor={gamePlanEditor}
              section={activeSection}
              readOnly={!canManageTeam}
            />
          </div>
        </PageHeader>
      </div>

      <div className="mx-auto w-full max-w-[1800px] space-y-6 px-4 pb-8 sm:px-8 lg:px-10">
        {activeSection === "instructions" ? (
          <PlayerInstructionsPanel
            editor={gamePlanEditor}
            readOnly={!canManageTeam}
            onGoToSquad={() => setActiveSection("squad")}
          />
        ) : activeSection === "roles" ? (
          <TeamRolesPanel editor={gamePlanEditor} readOnly={!canManageTeam} />
        ) : activeSection === "tactics" ? (
          <TeamTacticsPanel editor={gamePlanEditor} readOnly={!canManageTeam} />
        ) : (
          <>
        {/* ── Status bar ────────────────────────────────────────────────────── */}
      {/* Same near-opaque card as the toolbar fields: the pills are tinted at
          10% opacity, which disappears against the photographic backdrop.
          Spelled out here; a phone gets the same counts as icons under the
          pitch, where three wrapped lines of captions would not fit. */}
      <div className="hidden w-fit max-w-full flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur-md md:flex">
        <StatusBar
          label="On Pitch"
          value={lineup.pitchCount}
          max={lineup.lineupSize}
          isComplete={lineup.isLineupComplete}
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
      </div>

      {/* Anything the coach has to act on. Unlike the counts these are
          sentences, not figures, so they read the same at every width —
          `empty:hidden` keeps the card out of the layout when all is well. */}
      <div className="flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur-md empty:hidden">
        {lineup.hasInjuredPitchPlayers && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            Remove injured players from the starting lineup before saving
          </span>
        )}

        {lineup.hasMisplacedPlayers && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {lineup.misplacedAthleteIds.length === 1
              ? "1 player not in their optimal position"
              : `${lineup.misplacedAthleteIds.length} players not in their optimal positions`}
          </span>
        )}

        {!lineup.hasEnoughPlayers && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            Need at least {lineup.lineupSize} players for a full lineup
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
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 items-center gap-6 2xl:grid-cols-[minmax(0,860px)_456px]">
      <div className="flex min-w-0 flex-col gap-4">
        {lineup.isCustomFormation && lineup.customEditMode && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            Drag the outfield position handles to build your shape. Positions snap
            gently to the pitch grid and automatically become DEF, MID, or FWD
            based on depth. The goalkeeper stays fixed.
          </div>
        )}
        <FootballPitch horizontal={isDesktop}>
          {lineup.formation?.positions.map((pos) => (
            <PitchPlayer
              key={pos.id}
              position={pos}
              athlete={getAthlete(lineup.assignments[pos.id] ?? null)}
              dragItem={lineup.dragItem}
              horizontal={isDesktop}
              readOnly={!canManageTeam || lineup.customEditMode}
              onDragStart={lineup.startDrag}
              onDragEnd={lineup.endDrag}
              onDrop={lineup.handleDrop}
            />
          ))}
          {canManageTeam && lineup.isCustomFormation && lineup.customEditMode &&
            lineup.formation?.positions.map((pos) => (
              <CustomFormationHandle
                key={`custom-handle-${pos.id}`}
                position={pos}
                horizontal={isDesktop}
                onMove={lineup.moveCustomPosition}
              />
            ))}
        </FootballPitch>

        <SquadStatusStrip
          className="md:hidden"
          pitchCount={lineup.pitchCount}
          lineupSize={lineup.lineupSize}
          isLineupComplete={lineup.isLineupComplete}
          substitutes={lineup.substituteIds.length}
          injured={unavailableCounts.injured}
          warnings={lineupWarningCount}
        />
      </div>

      {/* ── Substitutes ───────────────────────────────────────────────────── */}
      <SubstitutesArea
        athletes={substituteAthletes}
        dragItem={lineup.dragItem}
        readOnly={!canManageTeam || lineup.customEditMode}
        onDragStart={lineup.startDrag}
        onDragEnd={lineup.endDrag}
        onDrop={lineup.handleDrop}
      />
      </div>

      {canManageTeam && (
        <GafferAiAssistant
          context="lineup"
          onLineupApplied={(suggested) =>
            lineup.loadLineup({
              ...suggested,
              customPositions:
                suggested.formationId === lineup.formationId
                  ? lineup.customPositions
                  : null,
            })
          }
        />
      )}
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

      <ResetInstructionsDialog
        isOpen={gamePlanEditor.isResetInstructionsDialogOpen}
        onClose={() => gamePlanEditor.setResetInstructionsDialogOpen(false)}
        onConfirm={gamePlanEditor.resetAllPlayerInstructions}
      />
      </div>
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

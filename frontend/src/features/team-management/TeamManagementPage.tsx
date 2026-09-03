/**
 * Team Management page — the tactical board where a coach configures their
 * starting XI, selects a formation, positions players on the pitch, and
 * manages substitutes through drag-and-drop.
 *
 * Data is loaded from the existing athlete API via TanStack Query. No dummy
 * data is used; empty and loading states are handled explicitly.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import {
  RotateCcw,
  Wand2,
  Save,
  Copy,
  Trash2,
  Users,
  ShieldAlert,
  Loader2,
  Check,
} from "lucide-react";

import {
  useAthletes,
  useLineups,
  useCreateLineup,
  useUpdateLineup,
  useDeleteLineup,
} from "./api";
import { useLineupState } from "./useLineupState";
import { FootballPitch } from "./FootballPitch";
import { PitchPlayer } from "./PitchPlayer";
import { FormationSelector } from "./FormationSelector";
import { LineupSelector } from "./LineupSelector";
import { SaveLineupDialog } from "./SaveLineupDialog";
import { DeleteLineupDialog } from "./DeleteLineupDialog";
import { SubstitutesArea } from "./SubstitutesArea";
import type { BackendAthlete } from "@/services/athletes";
import TeamTacticsPanel from "@/features/team-tactics/TeamTacticsPage";

export default function TeamManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection =
    searchParams.get("section") === "tactics" ? "tactics" : "squad";

  const setActiveSection = (section: "squad" | "tactics") => {
    setSearchParams(section === "tactics" ? { section } : {});
  };

  const { data: athletes, isLoading, isError, refetch } = useAthletes();
  const emptyRef = useRef<BackendAthlete[]>([]);
  const athleteList = athletes ?? emptyRef.current;

  const lineup = useLineupState(athleteList);

  const { data: lineupsData, isLoading: isLineupsLoading } = useLineups();
  const lineupsList = useMemo(() => lineupsData ?? [], [lineupsData]);

  const createLineupMutation = useCreateLineup();
  const updateLineupMutation = useUpdateLineup();
  const deleteLineupMutation = useDeleteLineup();

  const [selectedLineupId, setSelectedLineupId] = useState<string | null>(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedLineup = useMemo(
    () => lineupsList.find((l) => l.id === selectedLineupId) ?? null,
    [lineupsList, selectedLineupId],
  );

  const { loadLineup } = lineup;

  // Once the squad and the saved lineups have both loaded, select and load
  // the most recently updated lineup (if any); otherwise the board stays
  // blank with everyone on the bench.
  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (hasHydratedRef.current) return;
    if (athleteList.length === 0) return;
    if (isLineupsLoading) return;

    hasHydratedRef.current = true;
    const initial = lineupsList[0] ?? null;
    setSelectedLineupId(initial?.id ?? null);
    loadLineup(initial);
  }, [athleteList, isLineupsLoading, lineupsList, loadLineup]);

  const handleSelectLineup = (id: string | null) => {
    if (id === null) {
      setSelectedLineupId(null);
      loadLineup(null);
      return;
    }
    const target = lineupsList.find((l) => l.id === id);
    if (!target) return;
    setSelectedLineupId(target.id);
    loadLineup(target);
  };

  const currentContent = {
    formationId: lineup.formationId,
    assignments: lineup.assignments,
    substituteIds: lineup.substituteIds,
  };

  /** Save button: overwrite the selected lineup, or prompt for a name if none is selected. */
  const handleSave = () => {
    setSaveError(null);
    if (!selectedLineup) {
      setIsSaveDialogOpen(true);
      return;
    }
    updateLineupMutation.mutate(
      { id: selectedLineup.id, input: currentContent },
      {
        onSuccess: () => {
          setJustSaved(true);
          window.setTimeout(() => setJustSaved(false), 2500);
        },
        onError: (err) => {
          setSaveError(
            err instanceof Error ? err.message : "Failed to save lineup.",
          );
        },
      },
    );
  };

  /** "Save as new" always creates a fresh named lineup, even when one is selected. */
  const handleSaveAsNew = async (name: string) => {
    const created = await createLineupMutation.mutateAsync({
      name,
      ...currentContent,
    });
    setSelectedLineupId(created.id);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  const handleDeleteConfirm = () => {
    if (!selectedLineup) return;
    deleteLineupMutation.mutate(selectedLineup.id, {
      onSuccess: () => {
        setIsDeleteDialogOpen(false);
        setSelectedLineupId(null);
        loadLineup(null);
      },
    });
  };

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
        actions={activeSection === "squad" ? (
          <div className="flex flex-wrap items-center gap-2">
            <LineupSelector
              lineups={lineupsList}
              selectedLineupId={selectedLineupId}
              onSelect={handleSelectLineup}
              disabled={isLineupsLoading}
            />

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

            {selectedLineup && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteDialogOpen(true)}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSaveDialogOpen(true)}
              className="gap-1.5"
            >
              <Copy className="size-3.5" />
              Save As New
            </Button>

            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              onClick={handleSave}
              disabled={updateLineupMutation.isPending}
            >
              {updateLineupMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : justSaved ? (
                <Check className="size-3.5" />
              ) : (
                <Save className="size-3.5" />
              )}
              {updateLineupMutation.isPending
                ? "Saving..."
                : justSaved
                  ? "Saved"
                  : selectedLineup
                    ? "Save"
                    : "Save Lineup"}
            </Button>
          </div>
        ) : undefined}
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
          <TeamTacticsPanel />
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
            onClick={() => setSaveError(null)}
            role="alert"
          >
            {saveError} (dismiss)
          </span>
        )}

        {deleteLineupMutation.isError && (
          <span
            className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive cursor-pointer"
            onClick={() => deleteLineupMutation.reset()}
            role="alert"
          >
            Failed to delete lineup. Please try again. (dismiss)
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
          </>
        )}
      </div>

      <SaveLineupDialog
        open={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        onSave={handleSaveAsNew}
      />

      <DeleteLineupDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        lineupName={selectedLineup?.name ?? ""}
        isDeleting={deleteLineupMutation.isPending}
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

/**
 * State + persistence for a team's game plans. A game plan is one record
 * covering both halves of a matchday plan — the squad selection (formation,
 * starting lineup, bench) and the tactical settings — so selecting, saving and
 * deleting a plan moves both together.
 *
 * `TeamManagementPage` owns the single instance and hands it to the header
 * controls, the tactical board (`editor.lineup`) and `<TeamTacticsPanel>`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import type { BackendAthlete } from "@/services/athletes";
import type {
  BackendGamePlan,
  GamePlanSquad,
  GamePlanTactics,
} from "@/services/gamePlans";
import { useLineupState } from "@/features/team-management/useLineupState";
import { athleteShortName } from "@/features/team-management/athlete-display";
import { reconcilePlayerInstructions } from "./instructions/instructionDefaults";
import {
  useCreateGamePlan,
  useDeleteGamePlan,
  useGamePlans,
  useUpdateGamePlan,
} from "./api";
import { DEFAULT_GAME_PLAN_TACTICS } from "./tactics-options";

/** Why a save is refused before it is sent; shown wherever the save was begun. */
const INJURED_STARTER_MESSAGE =
  "Remove injured players from the starting lineup before saving.";

const TACTICS_KEYS = Object.keys(
  DEFAULT_GAME_PLAN_TACTICS,
) as (keyof GamePlanTactics)[];

/** Pulls the tactical settings out of a saved game plan record. */
export function toTactics(plan: BackendGamePlan): GamePlanTactics {
  const out = {} as GamePlanTactics;
  for (const key of TACTICS_KEYS) {
    // Each key exists on BackendGamePlan with a compatible type.
    (out as Record<string, unknown>)[key] = plan[key];
  }
  // A response cached before player instructions existed has no such field,
  // and both the reconciler and the panel assume an object.
  out.playerInstructions = plan.playerInstructions ?? {};
  return out;
}

/** Pulls the squad selection out of a saved game plan record. */
export function toSquad(plan: BackendGamePlan): GamePlanSquad {
  return {
    formationId: plan.formationId,
    assignments: plan.assignments,
    customPositions: plan.customPositions,
    substituteIds: plan.substituteIds,
  };
}

export type LineupBoard = ReturnType<typeof useLineupState>;

export interface GamePlanEditor {
  plans: BackendGamePlan[];
  athletes: BackendAthlete[];
  isPlansLoading: boolean;
  isError: boolean;
  refetch: () => void;

  /** The tactical board: formation, starting lineup, bench and drag-and-drop. */
  lineup: LineupBoard;

  selectedId: string | null;
  selectedPlan: BackendGamePlan | null;
  content: GamePlanTactics;
  patch: (p: Partial<GamePlanTactics>) => void;

  saving: boolean;
  justSaved: boolean;
  saveError: string | null;
  clearSaveError: () => void;

  deleteError: boolean;
  clearDeleteError: () => void;
  isDeleting: boolean;

  /**
   * Set when a lineup change pruned instructions that no longer applied, so
   * the Instructions screen can say so. Cleared by dismissing it.
   */
  instructionsNotice: string | null;
  dismissInstructionsNotice: () => void;

  isSaveDialogOpen: boolean;
  setSaveDialogOpen: (open: boolean) => void;
  isDeleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  isResetInstructionsDialogOpen: boolean;
  setResetInstructionsDialogOpen: (open: boolean) => void;
  /** Puts every player in the plan back on their position's defaults. */
  resetAllPlayerInstructions: () => void;

  selectPlan: (id: string | null) => void;
  save: () => void;
  saveAsNew: (name: string) => Promise<void>;
  confirmDelete: () => void;
}

export function useGamePlanEditor(
  athletes: BackendAthlete[],
  isAthletesLoading: boolean,
): GamePlanEditor {
  const {
    data: gamePlans,
    isLoading: isPlansLoading,
    isError,
    refetch,
  } = useGamePlans();
  const plans = useMemo(() => gamePlans ?? [], [gamePlans]);

  const createMutation = useCreateGamePlan();
  const updateMutation = useUpdateGamePlan();
  const deleteMutation = useDeleteGamePlan();

  const lineup = useLineupState(athletes);
  const { loadLineup } = lineup;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<GamePlanTactics>(
    DEFAULT_GAME_PLAN_TACTICS,
  );
  const [isSaveDialogOpen, setSaveDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isResetInstructionsDialogOpen, setResetInstructionsDialogOpen] =
    useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [instructionsNotice, setInstructionsNotice] = useState<string | null>(
    null,
  );

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? null,
    [plans, selectedId],
  );

  // Once the squad and the game plans have both loaded, open the most recently
  // updated plan — its tactics and its board together.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (hasHydrated.current || isPlansLoading || isAthletesLoading) return;
    hasHydrated.current = true;
    const initial = plans[0] ?? null;
    setSelectedId(initial?.id ?? null);
    setContent(initial ? toTactics(initial) : DEFAULT_GAME_PLAN_TACTICS);
    loadLineup(initial ? toSquad(initial) : null);
  }, [isAthletesLoading, isPlansLoading, loadLineup, plans]);

  /**
   * Player instructions follow the lineup. Moving someone from right wing to
   * right-back, swapping the formation or dropping them from the squad all
   * leave instructions behind that their new position never asks about — and
   * the backend rejects those on save — so they are pruned here, where every
   * lineup change passes, rather than only when the Instructions tab is open.
   */
  const { formation, assignments } = lineup;
  useEffect(() => {
    if (!hasHydrated.current || athletes.length === 0) return;

    const result = reconcilePlayerInstructions({
      instructions: content.playerInstructions,
      formation,
      assignments,
      knownAthleteIds: new Set(athletes.map((athlete) => athlete.id)),
    });
    if (!result.changed) return;

    setContent((prev) => ({
      ...prev,
      playerInstructions: result.instructions,
    }));

    const moved = result.changedAthleteIds
      .map((id) => athletes.find((athlete) => athlete.id === id))
      .filter((athlete): athlete is BackendAthlete => athlete != null)
      .map(athleteShortName);
    if (moved.length > 0) {
      setInstructionsNotice(
        moved.length === 1
          ? `${moved[0]}'s instructions were updated to match their new position.`
          : `Instructions were updated for ${moved.length} players to match their new positions.`,
      );
    }
  }, [assignments, athletes, content.playerInstructions, formation]);

  const selectPlan = (id: string | null) => {
    setSaveError(null);
    setInstructionsNotice(null);
    setSelectedId(id);
    const target = id ? plans.find((p) => p.id === id) ?? null : null;
    setContent(target ? toTactics(target) : DEFAULT_GAME_PLAN_TACTICS);
    loadLineup(target ? toSquad(target) : null);
  };

  const patch = (p: Partial<GamePlanTactics>) =>
    setContent((prev) => ({ ...prev, ...p }));

  /** Everything the current plan would be saved as: tactics + live board. */
  const currentInput = () => ({
    ...content,
    formationId: lineup.formationId,
    assignments: lineup.assignments,
    customPositions: lineup.customPositions,
    substituteIds: lineup.substituteIds,
  });

  const flashSaved = () => {
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  const save = () => {
    setSaveError(null);
    if (lineup.hasInjuredPitchPlayers) {
      setSaveError(INJURED_STARTER_MESSAGE);
      return;
    }
    if (!selectedPlan) {
      setSaveDialogOpen(true);
      return;
    }
    updateMutation.mutate(
      { id: selectedPlan.id, input: currentInput() },
      {
        onSuccess: flashSaved,
        onError: (err) =>
          setSaveError(
            err instanceof Error ? err.message : "Failed to save game plan.",
          ),
      },
    );
  };

  const saveAsNew = async (name: string) => {
    setSaveError(null);
    if (lineup.hasInjuredPitchPlayers) {
      // Thrown rather than returned: the dialog reports what it catches, and
      // returning quietly would close it as though the plan had been saved.
      throw new ApiError(INJURED_STARTER_MESSAGE, 400);
    }

    const created = await createMutation.mutateAsync({
      name,
      ...currentInput(),
    });
    setSelectedId(created.id);
    setContent(toTactics(created));
    flashSaved();
  };

  const confirmDelete = () => {
    if (!selectedPlan) return;
    deleteMutation.mutate(selectedPlan.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setSelectedId(null);
        setContent(DEFAULT_GAME_PLAN_TACTICS);
        loadLineup(null);
      },
    });
  };

  return {
    plans,
    athletes,
    isPlansLoading,
    isError,
    refetch,

    lineup,

    selectedId,
    selectedPlan,
    content,
    patch,

    saving: updateMutation.isPending,
    justSaved,
    saveError,
    clearSaveError: () => setSaveError(null),

    deleteError: deleteMutation.isError,
    clearDeleteError: () => deleteMutation.reset(),
    isDeleting: deleteMutation.isPending,

    instructionsNotice,
    dismissInstructionsNotice: () => setInstructionsNotice(null),

    isSaveDialogOpen,
    setSaveDialogOpen,
    isDeleteDialogOpen,
    setDeleteDialogOpen,
    isResetInstructionsDialogOpen,
    setResetInstructionsDialogOpen,
    resetAllPlayerInstructions: () => {
      patch({ playerInstructions: {} });
      setInstructionsNotice(null);
      setResetInstructionsDialogOpen(false);
    },

    selectPlan,
    save,
    saveAsNew,
    confirmDelete,
  };
}

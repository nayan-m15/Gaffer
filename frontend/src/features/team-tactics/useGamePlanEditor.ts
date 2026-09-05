/**
 * State + persistence for a team's game plans. A game plan is one record
 * covering both halves of a matchday plan — the squad selection (formation,
 * starting XI, bench) and the tactical settings — so selecting, saving and
 * deleting a plan moves both together.
 *
 * `TeamManagementPage` owns the single instance and hands it to the header
 * controls, the tactical board (`editor.lineup`) and `<TeamTacticsPanel>`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { BackendAthlete } from "@/services/athletes";
import type {
  BackendGamePlan,
  GamePlanSquad,
  GamePlanTactics,
} from "@/services/gamePlans";
import { useLineupState } from "@/features/team-management/useLineupState";
import {
  useCreateGamePlan,
  useDeleteGamePlan,
  useGamePlans,
  useUpdateGamePlan,
} from "./api";
import {
  DEFAULT_GAME_PLAN_TACTICS,
  type TacticsTab as TacticsTabName,
} from "./tactics-options";

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
  return out;
}

/** Pulls the squad selection out of a saved game plan record. */
export function toSquad(plan: BackendGamePlan): GamePlanSquad {
  return {
    formationId: plan.formationId,
    assignments: plan.assignments,
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

  /** The tactical board: formation, starting XI, bench and drag-and-drop. */
  lineup: LineupBoard;

  selectedId: string | null;
  selectedPlan: BackendGamePlan | null;
  content: GamePlanTactics;
  patch: (p: Partial<GamePlanTactics>) => void;

  activeTab: TacticsTabName;
  setActiveTab: (tab: TacticsTabName) => void;

  saving: boolean;
  justSaved: boolean;
  saveError: string | null;
  clearSaveError: () => void;

  deleteError: boolean;
  clearDeleteError: () => void;
  isDeleting: boolean;

  isSaveDialogOpen: boolean;
  setSaveDialogOpen: (open: boolean) => void;
  isDeleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;

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
  const [activeTab, setActiveTab] = useState<TacticsTabName>("Tactics");
  const [isSaveDialogOpen, setSaveDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const selectPlan = (id: string | null) => {
    setSaveError(null);
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
    substituteIds: lineup.substituteIds,
  });

  const flashSaved = () => {
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  const save = () => {
    setSaveError(null);
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

    activeTab,
    setActiveTab,

    saving: updateMutation.isPending,
    justSaved,
    saveError,
    clearSaveError: () => setSaveError(null),

    deleteError: deleteMutation.isError,
    clearDeleteError: () => deleteMutation.reset(),
    isDeleting: deleteMutation.isPending,

    isSaveDialogOpen,
    setSaveDialogOpen,
    isDeleteDialogOpen,
    setDeleteDialogOpen,

    selectPlan,
    save,
    saveAsNew,
    confirmDelete,
  };
}

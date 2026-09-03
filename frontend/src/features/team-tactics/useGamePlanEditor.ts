/**
 * State + persistence for the Team Tactics editor, extracted into a hook so
 * the save controls can live in the page header (next to the Squad section's
 * lineup controls) while the tabs and their bodies render further down the
 * page. `TeamManagementPage` owns the single instance and hands it to both
 * `GamePlanControls` and `TeamTacticsPanel`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { BackendAthlete } from "@/services/athletes";
import type { BackendGamePlan, GamePlanContent } from "@/services/gamePlans";
import {
  useAthletes,
  useCreateGamePlan,
  useDeleteGamePlan,
  useGamePlans,
  useUpdateGamePlan,
} from "./api";
import {
  DEFAULT_GAME_PLAN_CONTENT,
  type TacticsTab as TacticsTabName,
} from "./tactics-options";

const CONTENT_KEYS = Object.keys(
  DEFAULT_GAME_PLAN_CONTENT,
) as (keyof GamePlanContent)[];

/** Pulls the editable content out of a saved game plan record. */
export function toContent(plan: BackendGamePlan): GamePlanContent {
  const out = {} as GamePlanContent;
  for (const key of CONTENT_KEYS) {
    // Each key exists on BackendGamePlan with a compatible type.
    (out as Record<string, unknown>)[key] = plan[key];
  }
  return out;
}

export interface GamePlanEditor {
  plans: BackendGamePlan[];
  athletes: BackendAthlete[];
  isPlansLoading: boolean;
  isError: boolean;
  refetch: () => void;

  selectedId: string | null;
  selectedPlan: BackendGamePlan | null;
  content: GamePlanContent;
  patch: (p: Partial<GamePlanContent>) => void;

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

export function useGamePlanEditor(): GamePlanEditor {
  const {
    data: gamePlans,
    isLoading: isPlansLoading,
    isError,
    refetch,
  } = useGamePlans();
  const plans = useMemo(() => gamePlans ?? [], [gamePlans]);

  const { data: athletesData } = useAthletes();
  const emptyAthletes = useRef<BackendAthlete[]>([]);
  const athletes = athletesData ?? emptyAthletes.current;

  const createMutation = useCreateGamePlan();
  const updateMutation = useUpdateGamePlan();
  const deleteMutation = useDeleteGamePlan();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<GamePlanContent>(
    DEFAULT_GAME_PLAN_CONTENT,
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

  // Once the game plans have loaded, open the most recently updated one.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (hasHydrated.current || isPlansLoading) return;
    hasHydrated.current = true;
    const initial = plans[0] ?? null;
    setSelectedId(initial?.id ?? null);
    setContent(initial ? toContent(initial) : DEFAULT_GAME_PLAN_CONTENT);
  }, [isPlansLoading, plans]);

  const selectPlan = (id: string | null) => {
    setSaveError(null);
    setSelectedId(id);
    const target = id ? plans.find((p) => p.id === id) ?? null : null;
    setContent(target ? toContent(target) : DEFAULT_GAME_PLAN_CONTENT);
  };

  const patch = (p: Partial<GamePlanContent>) =>
    setContent((prev) => ({ ...prev, ...p }));

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
      { id: selectedPlan.id, input: content },
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
    const created = await createMutation.mutateAsync({ name, ...content });
    setSelectedId(created.id);
    setContent(toContent(created));
    flashSaved();
  };

  const confirmDelete = () => {
    if (!selectedPlan) return;
    deleteMutation.mutate(selectedPlan.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setSelectedId(null);
        setContent(DEFAULT_GAME_PLAN_CONTENT);
      },
    });
  };

  return {
    plans,
    athletes,
    isPlansLoading,
    isError,
    refetch,

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

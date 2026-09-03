/**
 * Team Tactics — a FIFA-style "Custom Tactics" editor. A coach keeps several
 * named game plans (each a full snapshot of formation + defensive / offensive
 * settings + set-piece roles) and switches between them per fixture.
 *
 * The screen is organised into five tabs (Squad, Formation, Tactics, Roles,
 * Instructions). Tactics, Formation and Roles are backed by the `/game-plans`
 * API; Squad and Instructions are placeholders that point at where that work
 * currently happens.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardList,
  Loader2,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BackendAthlete } from "@/services/athletes";
import type {
  BackendGamePlan,
  GamePlanContent,
} from "@/services/gamePlans";
import {
  useAthletes,
  useCreateGamePlan,
  useDeleteGamePlan,
  useGamePlans,
  useUpdateGamePlan,
} from "./api";
import { DeleteGamePlanDialog } from "./DeleteGamePlanDialog";
import { GamePlanSelector } from "./GamePlanSelector";
import { PlaceholderTab } from "./PlaceholderTab";
import { RolesTab } from "./RolesTab";
import { SaveGamePlanDialog } from "./SaveGamePlanDialog";
import { TacticsTab } from "./TacticsTab";
import {
  DEFAULT_GAME_PLAN_CONTENT,
  TACTICS_TABS,
  type TacticsTab as TacticsTabName,
} from "./tactics-options";

const CONTENT_KEYS = Object.keys(
  DEFAULT_GAME_PLAN_CONTENT,
) as (keyof GamePlanContent)[];

/** Pulls the editable content out of a saved game plan record. */
function toContent(plan: BackendGamePlan): GamePlanContent {
  const out = {} as GamePlanContent;
  for (const key of CONTENT_KEYS) {
    // Each key exists on BackendGamePlan with a compatible type.
    (out as Record<string, unknown>)[key] = plan[key];
  }
  return out;
}

function contentEquals(a: GamePlanContent, b: GamePlanContent): boolean {
  return CONTENT_KEYS.every((key) => a[key] === b[key]);
}

export default function TeamTacticsPanel() {
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

  // Baseline content the current edits are compared against for the dirty flag.
  const baseline = useMemo(
    () => (selectedPlan ? toContent(selectedPlan) : DEFAULT_GAME_PLAN_CONTENT),
    [selectedPlan],
  );
  const isDirty = !contentEquals(content, baseline);

  // Once the game plans have loaded, open the most recently updated one.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (hasHydrated.current || isPlansLoading) return;
    hasHydrated.current = true;
    const initial = plans[0] ?? null;
    setSelectedId(initial?.id ?? null);
    setContent(initial ? toContent(initial) : DEFAULT_GAME_PLAN_CONTENT);
  }, [isPlansLoading, plans]);

  const handleSelectPlan = (id: string | null) => {
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

  const handleSave = () => {
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

  const handleSaveAsNew = async (name: string) => {
    const created = await createMutation.mutateAsync({ name, ...content });
    setSelectedId(created.id);
    setContent(toContent(created));
    flashSaved();
  };

  const handleDeleteConfirm = () => {
    if (!selectedPlan) return;
    deleteMutation.mutate(selectedPlan.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setSelectedId(null);
        setContent(DEFAULT_GAME_PLAN_CONTENT);
      },
    });
  };

  /* ── Error state ─────────────────────────────────────────────────────────── */
  if (isError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="size-8 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">
            Failed to load game plans
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Something went wrong fetching your tactics. Please try again.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const saving = updateMutation.isPending;

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
            <GamePlanSelector
              gamePlans={plans}
              selectedId={selectedId}
              onSelect={handleSelectPlan}
              disabled={isPlansLoading}
            />

            {selectedPlan && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                aria-label="Delete game plan"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}

            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || (!!selectedPlan && !isDirty)}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : justSaved ? (
                <Check className="size-3.5" />
              ) : (
                <Save className="size-3.5" />
              )}
              {saving
                ? "Saving…"
                : justSaved
                  ? "Saved"
                  : selectedPlan
                    ? "Save"
                    : "Save game plan"}
            </Button>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto"
          aria-label="Tactics sections"
        >
          {TACTICS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="mx-auto max-w-3xl space-y-4">
        {saveError && (
          <p
            role="alert"
            className="cursor-pointer rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            onClick={() => setSaveError(null)}
          >
            {saveError} (dismiss)
          </p>
        )}
        {deleteMutation.isError && (
          <p
            role="alert"
            className="cursor-pointer rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            onClick={() => deleteMutation.reset()}
          >
            Failed to delete game plan. Please try again. (dismiss)
          </p>
        )}

        {isPlansLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {activeTab === "Tactics" && (
              <TacticsTab content={content} onChange={patch} disabled={saving} />
            )}

            {activeTab === "Roles" && (
              <RolesTab
                content={content}
                athletes={athletes}
                onChange={patch}
                disabled={saving}
              />
            )}

            {activeTab === "Instructions" && (
              <PlaceholderTab
                icon={ClipboardList}
                title="Player instructions"
                description="Per-player instructions (attacking support, defensive behaviour, width, runs) will hang off each formation slot here in a future update."
              />
            )}
          </>
        )}
      </div>

      <SaveGamePlanDialog
        open={isSaveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveAsNew}
      />

      <DeleteGamePlanDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        gamePlanName={selectedPlan?.name ?? ""}
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}

/**
 * The game-plan selector + Save As New / Save / Delete row, shaped to match
 * the Squad section's lineup controls so both sit identically in the page
 * header. Driven entirely by the shared `useGamePlanEditor` instance.
 */

import { Check, Copy, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GamePlanSelector } from "./GamePlanSelector";
import type { GamePlanEditor } from "./useGamePlanEditor";

interface GamePlanControlsProps {
  editor: GamePlanEditor;
}

export function GamePlanControls({ editor }: GamePlanControlsProps) {
  const {
    plans,
    selectedId,
    selectedPlan,
    selectPlan,
    isPlansLoading,
    saving,
    justSaved,
    save,
    setSaveDialogOpen,
    setDeleteDialogOpen,
  } = editor;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <GamePlanSelector
        gamePlans={plans}
        selectedId={selectedId}
        onSelect={selectPlan}
        disabled={isPlansLoading}
      />

      {selectedPlan && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteDialogOpen(true)}
          className="gap-1.5 text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => setSaveDialogOpen(true)}
        className="gap-1.5"
      >
        <Copy className="size-3.5" />
        Save As New
      </Button>

      <Button
        variant="default"
        size="sm"
        className="gap-1.5"
        onClick={save}
        disabled={saving}
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : justSaved ? (
          <Check className="size-3.5" />
        ) : (
          <Save className="size-3.5" />
        )}
        {saving
          ? "Saving..."
          : justSaved
            ? "Saved"
            : selectedPlan
              ? "Save"
              : "Save Game Plan"}
      </Button>
    </div>
  );
}

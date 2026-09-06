/**
 * The game-plan selector + Save As New / Save / Delete row shown in the Team
 * Management page header. Both sections render it — the squad board and the
 * tactics tabs edit two halves of the same saved plan — with the Squad
 * section passing its board-only buttons in as `children`.
 */

import type { ReactNode } from "react";
import { Check, Copy, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GamePlanSelector } from "./GamePlanSelector";
import type { GamePlanEditor } from "./useGamePlanEditor";

interface GamePlanControlsProps {
  editor: GamePlanEditor;
  /** Section-specific controls, rendered between the selector and Save. */
  children?: ReactNode;
}

export function GamePlanControls({ editor, children }: GamePlanControlsProps) {
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

      {children}

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

/**
 * The game-plan selector + Save As New / Save / Delete row shown in the Team
 * Management page header. Both sections render it — the squad board and the
 * tactics tabs edit two halves of the same saved plan — with the Squad
 * section passing its board-only buttons in as `children`.
 */

import { useMemo, type ReactNode } from "react";
import { Copy, Download, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatefulButton } from "@/components/ui/stateful-button";
import { useAuth } from "@/hooks/useAuth";
import { downloadGamePlanPdf } from "./exportGamePlanPdf";
import { GamePlanSelector } from "./GamePlanSelector";
import type { GamePlanEditor } from "./useGamePlanEditor";

interface GamePlanControlsProps {
  editor: GamePlanEditor;
  /** Section-specific controls, rendered between the selector and Save. */
  children?: ReactNode;
  /**
   * Assistant mode: hides Delete / Save As New / Save — assistants may view
   * plans but not modify them. The plan selector stays so they can browse.
   */
  readOnly?: boolean;
}

export function GamePlanControls({
  editor,
  children,
  readOnly = false,
}: GamePlanControlsProps) {
  const {
    plans,
    selectedId,
    selectedPlan,
    selectPlan,
    isPlansLoading,
    saving,
    justSaved,
    saveError,
    lineup,
    content,
    athletes,
    save,
    setSaveDialogOpen,
    setDeleteDialogOpen,
  } = editor;

  const { team } = useAuth();

  const athleteMap = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
    [athletes],
  );
  const getAthlete = (athleteId: string | null) =>
    athleteId ? (athleteMap.get(athleteId) ?? null) : null;

  const handleDownload = () => {
    if (!lineup.formation) return;
    downloadGamePlanPdf({
      planName: selectedPlan?.name ?? "Untitled game plan",
      teamName: team?.name ?? null,
      teamColor: team?.primaryColor ?? null,
      formation: lineup.formation,
      assignments: lineup.assignments,
      substituteIds: lineup.substituteIds,
      tactics: content,
      getAthlete,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <GamePlanSelector
        gamePlans={plans}
        selectedId={selectedId}
        onSelect={selectPlan}
        disabled={isPlansLoading}
      />

      {children}

      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={!lineup.formation}
        className="gap-1.5"
      >
        <Download className="size-3.5" />
        Download PDF
      </Button>

      {!readOnly && selectedPlan && (
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

      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSaveDialogOpen(true)}
          disabled={lineup.hasInjuredPitchPlayers}
          className="gap-1.5"
        >
          <Copy className="size-3.5" />
          Save As New
        </Button>
      )}

      {!readOnly && (
        <StatefulButton
          type="button"
          className="gap-1.5"
          onClick={save}
          disabled={saving || lineup.hasInjuredPitchPlayers}
          status={saving ? "loading" : justSaved ? "success" : saveError ? "error" : "idle"}
          loadingText="Saving..."
          successText="Saved"
          errorText="Try again"
        >
          <Save className="size-3.5" />
          {selectedPlan ? "Save" : "Save Game Plan"}
        </StatefulButton>
      )}
    </div>
  );
}

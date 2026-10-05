/**
 * Team Tactics panel — the tactical editor rendered inside the Team Management
 * page's "Tactics" section. It edits the tactical half of the selected game
 * plan; the squad half lives on the board in the "Squad" section and is saved
 * with it.
 *
 * The controls lay out beside a live mini pitch, so the panel is given the full
 * width of the page.
 *
 * It used to carry its own tab strip, whose second tab was a placeholder for
 * player instructions. Those now have a section of their own on the page, so
 * what is left here is the tactical settings alone.
 *
 * The save controls and dialogs live on the page itself. All state comes from
 * the shared `useGamePlanEditor` instance.
 */

import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TacticsTab } from "./TacticsTab";
import type { GamePlanEditor } from "./useGamePlanEditor";

interface TeamTacticsPanelProps {
  editor: GamePlanEditor;
  /**
   * Assistant mode: disables every tactic/role input — assistants may view
   * the settings but not modify them (backend also rejects their saves).
   */
  readOnly?: boolean;
}

export default function TeamTacticsPanel({
  editor,
  readOnly = false,
}: TeamTacticsPanelProps) {
  const {
    lineup,
    isPlansLoading,
    isError,
    refetch,
    content,
    patch,
    saving,
    saveError,
    clearSaveError,
    deleteError,
    clearDeleteError,
  } = editor;

  if (isError) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
        {saveError && (
          <p
            role="alert"
            className="cursor-pointer rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            onClick={clearSaveError}
          >
            {saveError} (dismiss)
          </p>
        )}
        {deleteError && (
          <p
            role="alert"
            className="cursor-pointer rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            onClick={clearDeleteError}
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
            <TacticsTab
              content={content}
              formation={lineup.formation}
              onChange={patch}
              disabled={saving || readOnly}
            />
          </>
        )}
    </div>
  );
}

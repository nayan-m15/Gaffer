/**
 * Team Tactics panel — a FIFA-style "Custom Tactics" editor rendered inside
 * the Team Management page's "Tactics" section. A coach keeps several named
 * game plans (each a full snapshot of defensive / offensive settings +
 * set-piece roles) and switches between them per fixture.
 *
 * The save controls live in the page header via `GamePlanControls`; this
 * component renders the tab strip, the active tab body, and the save/delete
 * dialogs. All state comes from the shared `useGamePlanEditor` instance.
 */

import { ClipboardList, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeleteGamePlanDialog } from "./DeleteGamePlanDialog";
import { PlaceholderTab } from "./PlaceholderTab";
import { RolesTab } from "./RolesTab";
import { SaveGamePlanDialog } from "./SaveGamePlanDialog";
import { TacticsTab } from "./TacticsTab";
import { TACTICS_TABS } from "./tactics-options";
import type { GamePlanEditor } from "./useGamePlanEditor";

interface TeamTacticsPanelProps {
  editor: GamePlanEditor;
}

export default function TeamTacticsPanel({ editor }: TeamTacticsPanelProps) {
  const {
    athletes,
    isPlansLoading,
    isError,
    refetch,
    selectedPlan,
    content,
    patch,
    activeTab,
    setActiveTab,
    saving,
    saveError,
    clearSaveError,
    deleteError,
    clearDeleteError,
    isDeleting,
    isSaveDialogOpen,
    setSaveDialogOpen,
    isDeleteDialogOpen,
    setDeleteDialogOpen,
    saveAsNew,
    confirmDelete,
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
    <>
      <div className="mx-auto max-w-3xl space-y-4">
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
        onSave={saveAsNew}
      />

      <DeleteGamePlanDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        gamePlanName={selectedPlan?.name ?? ""}
        isDeleting={isDeleting}
      />
    </>
  );
}

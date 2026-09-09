/**
 * Team Tactics panel — a FIFA-style "Custom Tactics" editor rendered inside
 * the Team Management page's "Tactics" section. It edits the tactical half of
 * the selected game plan; the squad half lives on the board in the "Squad"
 * section and is saved with it.
 *
 * The save controls and dialogs live on the page itself; this component
 * renders the tab strip and the active tab body. All state comes from the
 * shared `useGamePlanEditor` instance.
 */

import { ClipboardList, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlaceholderTab } from "./PlaceholderTab";
import { RolesTab } from "./RolesTab";
import { TacticsTab } from "./TacticsTab";
import { TACTICS_TABS } from "./tactics-options";
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
    athletes,
    isPlansLoading,
    isError,
    refetch,
    content,
    patch,
    activeTab,
    setActiveTab,
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
              <TacticsTab
                content={content}
                onChange={patch}
                disabled={saving || readOnly}
              />
            )}

            {activeTab === "Roles" && (
              <RolesTab
                content={content}
                athletes={athletes}
                onChange={patch}
                disabled={saving || readOnly}
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
  );
}

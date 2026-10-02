/**
 * The Team Management header controls, in two pieces.
 *
 * Both page sections edit one saved record (a game plan holds the squad
 * selection and the tactical settings together), so there is a single Save.
 * `TeamToolbarActions` carries it, with Reset and an overflow menu, up in the
 * page header's action slot; `TeamToolbarFields` is the bar of selectors under
 * the section tabs. They are split because they sit in different rows, not
 * because they are independent — both read the one editor.
 */

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Info,
  Move,
  MoreHorizontal,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatefulButton } from "@/components/ui/stateful-button";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { downloadGamePlanPdf } from "@/features/team-tactics/exportGamePlanPdf";
import { GamePlanSelector } from "@/features/team-tactics/GamePlanSelector";
import type { GamePlanEditor } from "@/features/team-tactics/useGamePlanEditor";
import { FormationSelector } from "./FormationSelector";
import { ToolbarDivider } from "./ToolbarField";

interface TeamToolbarProps {
  editor: GamePlanEditor;
  /** Which page section is on screen — the squad controls only apply to one. */
  section: "squad" | "tactics" | "roles";
  /**
   * Assistant mode: hides every control that changes the plan. The plan
   * selector stays so they can browse, and the backend rejects their saves.
   */
  readOnly?: boolean;
}

/* ─── Actions (page header, top right) ──────────────────────────────────── */

export function TeamToolbarActions({
  editor,
  section,
  readOnly = false,
}: TeamToolbarProps) {
  const {
    selectedPlan,
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
  const [exporting, setExporting] = useState(false);

  const athleteMap = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
    [athletes],
  );

  const handleDownload = () => {
    if (!lineup.formation || exporting) return;
    setExporting(true);
    window.setTimeout(() => {
      try {
        downloadGamePlanPdf({
          planName: selectedPlan?.name ?? "Untitled game plan",
          teamName: team?.name ?? null,
          teamColor: team?.primaryColor ?? null,
          formation: lineup.formation,
          assignments: lineup.assignments,
          substituteIds: lineup.substituteIds,
          tactics: content,
          getAthlete: (athleteId) =>
            athleteId ? (athleteMap.get(athleteId) ?? null) : null,
        });
      } finally {
        window.setTimeout(() => setExporting(false), 650);
      }
    }, 100);
  };

  const showSquadActions = section === "squad" && !readOnly;

  return (
    <>
      <MultiStepLoader
        loading={exporting}
        loadingStates={[
          { text: "Preparing game plan" },
          { text: "Rendering formation" },
          { text: "Generating PDF" },
        ]}
        duration={180}
      />

      <div className="flex items-center gap-2">
      {showSquadActions && lineup.isCustomFormation && (
        <Button
          variant={lineup.customEditMode ? "default" : "outline"}
          size="lg"
          onClick={lineup.toggleCustomEditMode}
          aria-pressed={lineup.customEditMode}
        >
          {lineup.customEditMode ? <Check /> : <Move />}
          {lineup.customEditMode ? "Done" : "Edit Shape"}
        </Button>
      )}

      {showSquadActions && (
        <Button variant="outline" size="lg" onClick={lineup.resetLineup}>
          <RotateCcw />
          Reset
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="More game plan actions"
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent>
          {!readOnly && (
            <DropdownMenuItem
              onClick={() => setSaveDialogOpen(true)}
              disabled={lineup.hasInjuredPitchPlayers}
            >
              <Copy />
              Save As New
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={handleDownload}
            disabled={!lineup.formation || exporting}
          >
            <Download />
            Download PDF
          </DropdownMenuItem>

          {showSquadActions && lineup.isCustomFormation && (
            <DropdownMenuItem onClick={lineup.resetCustomPositions}>
              <RotateCcw />
              Reset Shape
            </DropdownMenuItem>
          )}

          {!readOnly && selectedPlan && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 />
              Delete Game Plan
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {!readOnly && (
        <StatefulButton
          type="button"
          className="h-10 gap-1.5 px-4"
          onClick={save}
          disabled={saving || lineup.hasInjuredPitchPlayers}
          status={
            saving
              ? "loading"
              : justSaved
                ? "success"
                : saveError
                  ? "error"
                  : "idle"
          }
          loadingText="Saving..."
          successText="Saved"
          errorText="Try again"
        >
          <Save className="size-4" />
          Save
        </StatefulButton>
      )}
      </div>
    </>
  );
}

/* ─── Fields (under the section tabs) ───────────────────────────────────── */

export function TeamToolbarFields({
  editor,
  section,
  readOnly = false,
}: TeamToolbarProps) {
  const { plans, selectedId, selectPlan, isPlansLoading, lineup } = editor;
  const showSquadControls = section === "squad" && !readOnly;

  return (
    // Near-opaque: the page sits on a photographic backdrop, and a translucent
    // bar leaves the captions unreadable over it. Sized to its contents so it
    // sits under the tabs rather than stretching across the page.
    <div className="flex w-fit max-w-full flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-border bg-card/95 px-4 py-2.5 shadow-sm backdrop-blur-md">
      <GamePlanSelector
        gamePlans={plans}
        selectedId={selectedId}
        onSelect={selectPlan}
        disabled={isPlansLoading}
      />

      {showSquadControls && (
        <>
          <ToolbarDivider />

          <FormationSelector
            value={lineup.formationId}
            onChange={lineup.setFormation}
          />

          <ToolbarDivider />

          <div className="flex h-8 items-center gap-2">
            <label
              htmlFor="auto-fill-switch"
              className="text-sm font-medium text-foreground"
            >
              Auto-fill
            </label>
            <Switch
              id="auto-fill-switch"
              checked={lineup.autoFillEnabled}
              onCheckedChange={lineup.toggleAutoFill}
              disabled={lineup.customEditMode}
              aria-label="Auto-fill the lineup from recorded positions"
            >
              <SwitchThumb />
            </Switch>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="About auto-fill"
                    className="text-muted-foreground"
                  >
                    <Info />
                  </Button>
                }
              />
              <PopoverContent align="start" className="w-64">
                <PopoverDescription>
                  Fills empty positions with the best available player for each
                  slot, based on the positions recorded on their profile.
                  Players you place yourself are never moved.
                </PopoverDescription>
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}

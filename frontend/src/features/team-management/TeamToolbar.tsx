/**
 * The Team Management header controls, in three pieces.
 *
 * Every page section edits one saved record (a game plan holds the squad
 * selection and the tactical settings together), so there is a single Save.
 *
 * On a wide screen the controls are split across two rows: `TeamToolbarActions`
 * carries Save, Reset and an overflow menu up in the page header's action slot,
 * and `TeamToolbarFields` is the bar of selectors under the section tabs.
 *
 * On a phone there is no room for either arrangement, so `TeamToolbarMobile`
 * collapses the lot into one row — section, formation, options, Save — with
 * everything else behind the options button. All three read the one editor.
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
  SlidersHorizontal,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatefulButton } from "@/components/ui/stateful-button";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { downloadGamePlanPdf } from "@/features/team-tactics/exportGamePlanPdf";
import { GamePlanSelector } from "@/features/team-tactics/GamePlanSelector";
import type { GamePlanEditor } from "@/features/team-tactics/useGamePlanEditor";
import {
  FormationField,
  FormationSelector,
  MatchFormatField,
} from "./FormationSelector";
import { TEAM_SECTIONS, type TeamSection } from "./team-sections";
import { ToolbarDivider } from "./ToolbarField";

interface TeamToolbarProps {
  editor: GamePlanEditor;
  /** Which page section is on screen — the squad controls only apply to one. */
  section: TeamSection;
  /**
   * Assistant mode: hides every control that changes the plan. The plan
   * selector stays so they can browse, and the backend rejects their saves.
   */
  readOnly?: boolean;
}

/** What auto-fill does, worded the same wherever it is explained. */
const AUTO_FILL_HINT =
  "Fills empty positions with the best available player for each slot, based on the positions recorded on their profile. Players you place yourself are never moved.";

/**
 * The PDF export, shared by the wide and narrow toolbars so there is one
 * description of what a downloaded game plan contains.
 */
function useGamePlanPdfDownload(editor: GamePlanEditor) {
  const { selectedPlan, lineup, content, athletes } = editor;
  const { team } = useAuth();
  const [exporting, setExporting] = useState(false);

  const athleteMap = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
    [athletes],
  );

  const download = () => {
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

  const loader = (
    <MultiStepLoader
      loading={exporting}
      loadingStates={[
        { text: "Preparing game plan" },
        { text: "Rendering formation" },
        { text: "Generating PDF" },
      ]}
      duration={180}
    />
  );

  return { exporting, download, loader, canDownload: Boolean(lineup.formation) };
}

/** The Save button, identical in both layouts bar its padding. */
function SaveButton({
  editor,
  className,
}: {
  editor: GamePlanEditor;
  className?: string;
}) {
  const { save, saving, justSaved, saveError } = editor;

  return (
    <StatefulButton
      type="button"
      className={cn("h-10 gap-1.5 px-4", className)}
      onClick={save}
      // Not disabled when the lineup has an injured starter: `save()` refuses
      // that itself and says why. Disabling it here instead left the coach
      // clicking a dead button with no explanation, on every tab but Squad.
      disabled={saving}
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
  );
}

/* ─── Actions (page header, top right) ──────────────────────────────────── */

export function TeamToolbarActions({
  editor,
  section,
  readOnly = false,
}: TeamToolbarProps) {
  const {
    selectedPlan,
    lineup,
    setSaveDialogOpen,
    setDeleteDialogOpen,
    setResetInstructionsDialogOpen,
  } = editor;

  const { exporting, download, loader, canDownload } =
    useGamePlanPdfDownload(editor);

  const showSquadActions = section === "squad" && !readOnly;

  return (
    <>
      {loader}

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
            <DropdownMenuItem onClick={() => setSaveDialogOpen(true)}>
              <Copy />
              Save As New
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={download}
            disabled={!canDownload || exporting}
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

          {section === "instructions" && !readOnly && (
            <DropdownMenuItem
              onClick={() => setResetInstructionsDialogOpen(true)}
            >
              <RotateCcw />
              Reset All Player Instructions
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

      {!readOnly && <SaveButton editor={editor} />}
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
                <PopoverDescription>{AUTO_FILL_HINT}</PopoverDescription>
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Mobile (one row, everything else behind the options button) ───────── */

interface TeamToolbarMobileProps extends TeamToolbarProps {
  onSectionChange: (section: TeamSection) => void;
  className?: string;
}

export function TeamToolbarMobile({
  editor,
  section,
  readOnly = false,
  onSectionChange,
  className,
}: TeamToolbarMobileProps) {
  const {
    plans,
    selectedId,
    selectPlan,
    isPlansLoading,
    lineup,
    selectedPlan,
    setSaveDialogOpen,
    setDeleteDialogOpen,
    setResetInstructionsDialogOpen,
  } = editor;

  const { exporting, download, loader, canDownload } =
    useGamePlanPdfDownload(editor);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const sectionItems = useMemo(
    () =>
      Object.fromEntries(
        TEAM_SECTIONS.map(({ value, label }) => [value, label]),
      ),
    [],
  );
  const ActiveIcon =
    TEAM_SECTIONS.find((item) => item.value === section)?.Icon ??
    TEAM_SECTIONS[0].Icon;

  const showSquadControls = section === "squad" && !readOnly;

  /** An action in the options sheet: runs, then closes the sheet. */
  const action = (run: () => void) => () => {
    setOptionsOpen(false);
    run();
  };

  return (
    <>
      {loader}

      {/* Budgeted for 360px: 328px of usable width against an 80px formation,
          a 40px options button, a Save sized to its own text and three 6px
          gaps, leaving ~114px for the section name. That fits "Squad", and
          the longer names only appear once the formation select has gone —
          it belongs to the squad board alone, which hands its 86px back.
          `flex-wrap` catches anything narrower. Save drops the wide button's
          min-width here and so changes size between "Save" and "Saving...",
          which is the right trade for not clipping the labels beside it. */}
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        <Select
          items={sectionItems}
          value={section}
          onValueChange={(value) => {
            if (value) onSectionChange(value as TeamSection);
          }}
        >
          <SelectTrigger
            aria-label="Team section"
            className="h-10 min-w-[6rem] flex-1 gap-1.5 font-semibold"
          >
            <ActiveIcon className="size-4 shrink-0 text-primary" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEAM_SECTIONS.map(({ value, label, Icon }) => (
              <SelectItem key={value} value={value}>
                <Icon className="size-4" aria-hidden />
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showSquadControls && (
          <FormationField
            value={lineup.formationId}
            onChange={lineup.setFormation}
            hideLabel
            className="h-10 w-20 px-2"
          />
        )}

        <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Game plan options"
              >
                <SlidersHorizontal />
              </Button>
            }
          />
          <PopoverContent
            align="end"
            className="max-h-[min(28rem,var(--available-height))] w-72 overflow-y-auto"
          >
            <div className="flex flex-col gap-4">
              <GamePlanSelector
                gamePlans={plans}
                selectedId={selectedId}
                onSelect={selectPlan}
                disabled={isPlansLoading}
                className="h-9 w-full"
              />

              {showSquadControls && (
                <>
                  <MatchFormatField
                    value={lineup.formationId}
                    onChange={lineup.setFormation}
                    className="h-9 w-full"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="auto-fill-switch-mobile"
                      className="text-sm font-medium text-foreground"
                    >
                      Auto-fill
                    </label>
                    <Switch
                      id="auto-fill-switch-mobile"
                      checked={lineup.autoFillEnabled}
                      onCheckedChange={lineup.toggleAutoFill}
                      disabled={lineup.customEditMode}
                      aria-label="Auto-fill the lineup from recorded positions"
                    >
                      <SwitchThumb />
                    </Switch>
                  </div>
                  <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
                    {AUTO_FILL_HINT}
                  </p>
                </>
              )}

              <div className="flex flex-col gap-1 border-t border-border pt-3">
                {showSquadControls && (
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={action(lineup.resetLineup)}
                  >
                    <RotateCcw />
                    Reset lineup
                  </Button>
                )}

                {showSquadControls && lineup.isCustomFormation && (
                  <>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      aria-pressed={lineup.customEditMode}
                      onClick={action(lineup.toggleCustomEditMode)}
                    >
                      {lineup.customEditMode ? <Check /> : <Move />}
                      {lineup.customEditMode ? "Done editing shape" : "Edit shape"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={action(lineup.resetCustomPositions)}
                    >
                      <RotateCcw />
                      Reset shape
                    </Button>
                  </>
                )}

                {!readOnly && (
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={action(() => setSaveDialogOpen(true))}
                  >
                    <Copy />
                    Save as new
                  </Button>
                )}

                <Button
                  variant="ghost"
                  className="justify-start"
                  disabled={!canDownload || exporting}
                  onClick={action(download)}
                >
                  <Download />
                  Download PDF
                </Button>

                {section === "instructions" && !readOnly && (
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={action(() => setResetInstructionsDialogOpen(true))}
                  >
                    <RotateCcw />
                    Reset all player instructions
                  </Button>
                )}

                {!readOnly && selectedPlan && (
                  <Button
                    variant="ghost"
                    className="justify-start text-destructive hover:text-destructive"
                    onClick={action(() => setDeleteDialogOpen(true))}
                  >
                    <Trash2 />
                    Delete game plan
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {!readOnly && <SaveButton editor={editor} className="min-w-0 px-2.5" />}
      </div>
    </>
  );
}

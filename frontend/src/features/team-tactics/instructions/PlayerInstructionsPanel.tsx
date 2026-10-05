/**
 * The Instructions section of Team Management: the starting XI on the pitch
 * to the left, and the selected player's instruction cards to the right.
 *
 * The pitch is the same `TacticalMiniPitch` the Tactics and Roles screens draw,
 * in its roles mode — so a player sits in exactly the same place here as on the
 * squad board, and clicking one selects him instead of assigning a role. Which
 * cards appear depends entirely on the slot he occupies, so the panel changes
 * with the lineup without holding any position state of its own.
 *
 * Instructions are part of the game plan, so changes go through the editor's
 * ordinary `patch` and are written by the page's one Save, alongside the squad
 * and the tactical settings.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Info, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  athleteFullName,
  athleteShortName,
} from "@/features/team-management/athlete-display";
import type { BackendAthlete } from "@/services/athletes";
import { TacticalMiniPitch } from "../preview/TacticalMiniPitch";
import type { GamePlanEditor } from "../useGamePlanEditor";
import {
  conflictsForCategory,
  detectConflicts,
} from "./instructionCompatibility";
import {
  customCount,
  resolveInstructions,
  withInstruction,
  withPlayerInstructions,
} from "./instructionDefaults";
import { POSITION_GROUP_LABEL } from "./instructionTypes";
import { instructionSummaryPhrases } from "./instructionSummary";
import { PlayerInstructionCard } from "./PlayerInstructionCard";
import { slotContext } from "./positionGroups";

interface PlayerInstructionsPanelProps {
  editor: GamePlanEditor;
  /** Assistant mode: instructions are readable but not editable. */
  readOnly?: boolean;
  /** Sends the coach to the squad board to pick a starting XI first. */
  onGoToSquad: () => void;
}

export default function PlayerInstructionsPanel({
  editor,
  readOnly = false,
  onGoToSquad,
}: PlayerInstructionsPanelProps) {
  const {
    athletes,
    content,
    patch,
    saving,
    lineup,
    isPlansLoading,
    save,
    saveError,
    instructionsNotice,
    dismissInstructionsNotice,
  } = editor;

  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(
    null,
  );
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  const athleteById = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
    [athletes],
  );

  /** The starting XI in formation order — the order the arrows walk through. */
  const starters = useMemo(() => {
    const entries: Array<{ athlete: BackendAthlete; slotId: string }> = [];
    for (const slot of lineup.formation.positions) {
      const athleteId = lineup.assignments[slot.id];
      const athlete = athleteId ? athleteById.get(athleteId) : undefined;
      if (athlete) entries.push({ athlete, slotId: slot.id });
    }
    return entries;
  }, [athleteById, lineup.assignments, lineup.formation]);

  // Default to the first player in the lineup — the goalkeeper, in every
  // formation the app ships — and follow the squad when the current pick
  // leaves the pitch.
  useEffect(() => {
    if (starters.length === 0) {
      if (selectedAthleteId !== null) setSelectedAthleteId(null);
      return;
    }
    const stillStarting = starters.some(
      (entry) => entry.athlete.id === selectedAthleteId,
    );
    if (!stillStarting) setSelectedAthleteId(starters[0].athlete.id);
  }, [selectedAthleteId, starters]);

  const selectedIndex = starters.findIndex(
    (entry) => entry.athlete.id === selectedAthleteId,
  );
  const selected = selectedIndex >= 0 ? starters[selectedIndex] : null;

  const selectPlayer = (athleteId: string) => {
    setSelectedAthleteId(athleteId);
    setOpenCategoryId(null);
  };

  const step = (direction: -1 | 1) => {
    if (starters.length === 0) return;
    const next =
      (selectedIndex + direction + starters.length) % starters.length;
    selectPlayer(starters[next].athlete.id);
  };

  const context = useMemo(() => {
    if (!selected) return null;
    const slot = lineup.formation.positions.find(
      (position) => position.id === selected.slotId,
    );
    return slot ? slotContext(slot, lineup.formation) : null;
  }, [lineup.formation, selected]);

  const stored = selected
    ? content.playerInstructions[selected.athlete.id]
    : undefined;

  const resolved = useMemo(
    () => (context ? resolveInstructions(context, stored) : []),
    [context, stored],
  );

  const conflicts = useMemo(
    () => (context ? detectConflicts(context.group, resolved) : []),
    [context, resolved],
  );

  const summary = useMemo(
    () => instructionSummaryPhrases(resolved),
    [resolved],
  );

  const disabled = readOnly || saving;
  const customs = context ? customCount(context, stored) : 0;

  const chooseOption = (categoryId: string, optionId: string) => {
    if (!selected || !context || disabled) return;
    patch({
      playerInstructions: withPlayerInstructions(
        content.playerInstructions,
        selected.athlete.id,
        withInstruction(stored, context, categoryId, optionId),
      ),
    });
  };

  const resetSelectedPlayer = () => {
    if (!selected || disabled) return;
    patch({
      playerInstructions: withPlayerInstructions(
        content.playerInstructions,
        selected.athlete.id,
        {},
      ),
    });
  };

  /* ── Loading ───────────────────────────────────────────────────────────── */

  if (isPlansLoading) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="h-[28rem] animate-pulse rounded-2xl border border-border bg-card" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
      </div>
    );
  }

  /* ── No starting XI ────────────────────────────────────────────────────── */

  if (starters.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold text-foreground">
          No players on the pitch
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Set your starting XI before assigning player instructions.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onGoToSquad}>
          Go to Squad
        </Button>
      </div>
    );
  }

  /* ── Main content ──────────────────────────────────────────────────────── */

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* ── Player selection ─────────────────────────────────────────────── */}
      <section className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Starting XI
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {lineup.formation.name}
          </span>
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0" aria-live="polite">
            <h3 className="truncate text-lg font-semibold text-foreground">
              {selected ? athleteFullName(selected.athlete) : "No player"}
            </h3>
            <p className="text-sm text-primary">
              {context ? POSITION_GROUP_LABEL[context.group] : ""}
              {selected?.athlete.position
                ? ` · natural ${selected.athlete.position}`
                : ""}
              {selected?.athlete.squadNumber != null
                ? ` · #${selected.athlete.squadNumber}`
                : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="icon-lg"
              onClick={() => step(-1)}
              aria-label="Previous player"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              onClick={() => step(1)}
              aria-label="Next player"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        {summary.length > 0 && (
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {summary.join(" · ")}
          </p>
        )}

        <TacticalMiniPitch
          formation={lineup.formation}
          tactics={content}
          activeSetting="defensiveStyle"
          mode="roles"
          roles={{
            assignments: lineup.assignments,
            athleteById,
            highlightedAthleteId: selectedAthleteId,
            onSelectAthlete: selectPlayer,
            selectActionLabel: readOnly
              ? "View instructions for"
              : "Edit instructions for",
          }}
          ariaLabel={`Starting ${lineup.formation.name}. Selected player: ${
            selected ? athleteShortName(selected.athlete) : "none"
          }.`}
          className="mx-auto mt-4 w-full max-w-[380px]"
        />

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Select a player on the pitch to edit their instructions.
        </p>
      </section>

      {/* ── Instruction cards ────────────────────────────────────────────── */}
      <section className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {selected
              ? `${athleteShortName(selected.athlete)}'s instructions`
              : "Instructions"}
          </h2>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
              customs > 0
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {customs > 0
              ? `${customs} custom`
              : "All defaults"}
          </span>
        </div>

        {saveError && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2"
          >
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-destructive">
              Couldn&rsquo;t save player instructions. {saveError}
            </p>
            <Button variant="outline" size="xs" onClick={save} disabled={saving}>
              Retry
            </Button>
          </div>
        )}

        {instructionsNotice && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface-nested px-3 py-2">
            <Info className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              {instructionsNotice}
            </p>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={dismissInstructionsNotice}
              aria-label="Dismiss notice"
            >
              <X />
            </Button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {resolved.map((entry) => (
            <PlayerInstructionCard
              key={entry.category.id}
              resolved={entry}
              open={openCategoryId === entry.category.id}
              onToggle={() =>
                setOpenCategoryId((current) =>
                  current === entry.category.id ? null : entry.category.id,
                )
              }
              onSelect={(optionId) => chooseOption(entry.category.id, optionId)}
              conflicts={conflictsForCategory(conflicts, entry.category.id)}
              disabled={disabled}
            />
          ))}
        </div>

        {!readOnly && (
          <div className="mt-4 flex justify-end border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={resetSelectedPlayer}
              disabled={disabled || customs === 0}
            >
              <RotateCcw />
              Reset to Defaults
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * One instruction category as a card.
 *
 * Closed, it answers the only question a coach scanning the grid has: what is
 * this player doing, and did I ask for it? Open, it becomes the chooser — the
 * options as a radio group with the explanation of whichever one is in force,
 * expanding in place rather than taking over the screen, so the rest of the
 * player's setup stays visible while it is being changed.
 */

import {
  ArrowUp,
  Crosshair,
  Goal,
  MapPin,
  Move,
  MoveHorizontal,
  Radar,
  Send,
  Shield,
  Spline,
  TriangleAlert,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstructionConflict } from "./instructionCompatibility";
import type { ResolvedInstruction } from "./instructionTypes";

/** Registry icon keys, mapped onto the project's icon set. */
const INSTRUCTION_ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  target: Crosshair,
  position: MapPin,
  forward: ArrowUp,
  width: MoveHorizontal,
  pass: Waypoints,
  press: Radar,
  box: Goal,
  cross: Spline,
  distribution: Send,
  roam: Move,
};

interface PlayerInstructionCardProps {
  resolved: ResolvedInstruction;
  open: boolean;
  onToggle: () => void;
  onSelect: (optionId: string) => void;
  conflicts: InstructionConflict[];
  /** Assistant mode, or a save in flight: readable, not editable. */
  disabled?: boolean;
}

export function PlayerInstructionCard({
  resolved,
  open,
  onToggle,
  onSelect,
  conflicts,
  disabled = false,
}: PlayerInstructionCardProps) {
  const { category, options, selected, source } = resolved;
  const Icon = INSTRUCTION_ICONS[category.icon] ?? MapPin;
  const panelId = `instruction-${category.id}-options`;
  const isCustom = source === "custom";
  const strongest = conflicts.some(
    (conflict) => conflict.severity === "strong_warning",
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-xl border transition-colors",
        open
          ? "border-primary bg-primary/[0.07]"
          : conflicts.length > 0
            ? "border-amber-500/50 bg-surface-nested"
            : "border-border bg-surface-nested hover:border-primary/50",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${category.label}: ${selected.label}, ${
          isCustom ? "custom" : "default"
        }`}
        // `flex-1`, because the grid stretches every card in a row to the
        // height of whichever one is open: without it the toggle keeps its
        // own height and the rest of a stretched card is dead space that
        // swallows clicks aimed at the middle of it.
        className="flex min-h-[7.5rem] flex-1 flex-col items-center gap-2 rounded-xl px-3 py-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.1em]",
            open ? "text-primary" : "text-muted-foreground",
          )}
        >
          {category.label}
        </span>

        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full transition-colors",
            isCustom
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>

        <span className="min-w-0 text-sm font-semibold text-foreground">
          {selected.label}
        </span>
        <span
          className={cn(
            "text-[11px] font-medium",
            isCustom ? "text-primary" : "text-muted-foreground",
          )}
        >
          {isCustom ? "Custom" : "Default"}
        </span>

        {/* Where this option sits in the list, so the card reads at a glance. */}
        <span className="flex items-center gap-1" aria-hidden>
          {options.map((option) => (
            <span
              key={option.id}
              className={cn(
                "size-1.5 rounded-full",
                option.id === selected.id
                  ? isCustom
                    ? "bg-primary"
                    : "bg-muted-foreground"
                  : "bg-muted-foreground/30",
              )}
            />
          ))}
        </span>
      </button>

      {conflicts.length > 0 && !open && (
        <p
          className={cn(
            "flex items-start gap-1.5 border-t px-3 py-2 text-[11px] leading-snug",
            strongest
              ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
              : "border-border text-muted-foreground",
          )}
        >
          <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
          {strongest ? "Conflicts with another instruction" : "Potential conflict"}
        </p>
      )}

      {open && (
        <div id={panelId} className="border-t border-primary/30 px-3 py-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {category.description}
          </p>

          <div
            role="radiogroup"
            aria-label={category.label}
            className="mt-2.5 flex flex-col gap-1"
          >
            {options.map((option) => {
              const isSelected = option.id === selected.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={disabled}
                  onClick={() => onSelect(option.id)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "bg-primary/15 font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                      isSelected ? "border-primary" : "border-muted-foreground/50",
                    )}
                    aria-hidden
                  >
                    {isSelected && (
                      <span className="size-1.5 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="min-w-0">{option.label}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-2.5 border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
            {selected.description}
          </p>

          {conflicts.map((conflict) => (
            <p
              key={conflict.id}
              className={cn(
                "mt-2 flex items-start gap-1.5 text-[11px] leading-snug",
                conflict.severity === "info"
                  ? "text-muted-foreground"
                  : "text-amber-600 dark:text-amber-400",
              )}
            >
              <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
              {conflict.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

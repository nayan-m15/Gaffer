/**
 * The squad's vital signs on a phone, as a single row of icon + number.
 *
 * The wide-screen status bar spells each one out ("On Pitch: 11 / 11"), which
 * wraps onto three lines at 360px and pushes the pitch off the screen. Here the
 * same facts are counted, not described — the icon carries the meaning on
 * screen and each figure keeps a full sentence as its accessible name, so
 * nothing is conveyed by the icon alone.
 *
 * Only what is true shows: a squad with nobody injured and nothing to warn
 * about is two figures, not four greyed-out ones.
 */

import {
  ArrowLeftRight,
  HeartPulse,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SquadStatusStripProps {
  pitchCount: number;
  lineupSize: number;
  isLineupComplete: boolean;
  substitutes: number;
  /** Injured players anywhere in the squad. */
  injured: number;
  /** Things a coach should look at: misplaced players, no keeper, short squad. */
  warnings: number;
  className?: string;
}

function Stat({
  icon: Icon,
  value,
  label,
  tone = "muted",
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  tone?: "muted" | "primary" | "danger" | "warning";
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs font-semibold",
        tone === "primary" && "text-primary",
        tone === "danger" && "text-red-600 dark:text-red-400",
        tone === "warning" && "text-amber-600 dark:text-amber-400",
        tone === "muted" && "text-muted-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span aria-hidden>{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function SquadStatusStrip({
  pitchCount,
  lineupSize,
  isLineupComplete,
  substitutes,
  injured,
  warnings,
  className,
}: SquadStatusStripProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-around gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur-md",
        className,
      )}
    >
      <Stat
        icon={Users}
        value={`${pitchCount}/${lineupSize}`}
        label={`${pitchCount} of ${lineupSize} players on the pitch`}
        tone={isLineupComplete ? "primary" : "muted"}
      />
      <Stat
        icon={ArrowLeftRight}
        value={String(substitutes)}
        label={`${substitutes} substitutes`}
      />
      {injured > 0 && (
        <Stat
          icon={HeartPulse}
          value={String(injured)}
          label={`${injured} injured in the squad`}
          tone="danger"
        />
      )}
      {warnings > 0 && (
        <Stat
          icon={TriangleAlert}
          value={String(warnings)}
          label={
            warnings === 1
              ? "1 lineup warning"
              : `${warnings} lineup warnings`
          }
          tone="warning"
        />
      )}
    </div>
  );
}

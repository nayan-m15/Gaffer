/**
 * The right-hand half of the Team Tactics workspace: what the control the coach
 * is currently on does, and a mini pitch showing the shape it produces.
 *
 * It is driven entirely by `activeSetting` plus the live (unsaved) tactics, so
 * it updates on every slider step without touching the backend.
 */

import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_MARKER } from "@/features/team-management/role-colors";
import type { Formation, PositionRole } from "@/features/team-management/types";
import type { GamePlanTactics } from "@/services/gamePlans";
import { SCENARIO_LABEL, tacticalPreviewCopy } from "./tacticalDescriptions";
import { TacticalMiniPitch } from "./TacticalMiniPitch";
import { scenarioForSetting } from "./tacticalPositioning";
import type { ActiveTacticalSetting } from "./tacticalTypes";

const LEGEND_ROLES: { role: PositionRole; label: string }[] = [
  { role: "GK", label: "GK" },
  { role: "DEF", label: "Defence" },
  { role: "MID", label: "Midfield" },
  { role: "FWD", label: "Attack" },
];

interface TacticalPreviewPanelProps {
  formation: Formation;
  tactics: GamePlanTactics;
  activeSetting: ActiveTacticalSetting;
  className?: string;
}

export function TacticalPreviewPanel({
  formation,
  tactics,
  activeSetting,
  className,
}: TacticalPreviewPanelProps) {
  const copy = tacticalPreviewCopy(activeSetting, tactics);
  const scenario = scenarioForSetting(activeSetting);
  const scenarioLabel = SCENARIO_LABEL[scenario];

  return (
    <aside
      className={cn(
        "rounded-2xl border border-border bg-card p-5 sm:p-6",
        className,
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {scenarioLabel}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {formation.name}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-semibold text-foreground">
        {copy.title}
      </h3>
      <p className="mt-1 text-sm font-semibold text-primary">{copy.value}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {copy.description}
      </p>
      {copy.detail && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">
          {copy.detail}
        </p>
      )}

      <div className="mt-4 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
        <ArrowUp className="size-3" aria-hidden />
        Attacking
      </div>

      <TacticalMiniPitch
        formation={formation}
        tactics={tactics}
        activeSetting={activeSetting}
        ariaLabel={`${scenarioLabel} ${formation.name} shape. ${copy.title}: ${copy.value}.`}
        // Capped so the panel stays roughly as tall as the controls beside it
        // rather than running away with a wide column.
        className="mx-auto mt-2 w-full max-w-[380px]"
      />

      <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        {LEGEND_ROLES.map(({ role, label }) => (
          <li key={role} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: ROLE_MARKER[role].fill }}
              aria-hidden
            />
            {label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full border border-dashed border-muted-foreground bg-muted-foreground/40"
            aria-hidden
          />
          Opposition
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full border-2 border-amber-400"
            aria-hidden
          />
          Committed
        </li>
      </ul>
    </aside>
  );
}

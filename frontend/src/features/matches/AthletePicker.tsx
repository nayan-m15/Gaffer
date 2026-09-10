import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getPositionRole } from "@/features/team-management/formations";
import type { PositionRole } from "@/features/team-management/types";
import type {
  MatchSquadAthlete,
  OpponentMatchPlayer,
  OpponentSquadVisibility,
} from "./types";
import { opponentPlayerLabel } from "./match-report-event-form";

/** Same position-role palette as ConfirmSquadPage's squad list. */
const ROLE_STYLE: Record<PositionRole, { avatar: string; badge: string }> = {
  GK: {
    avatar: "border-sky-400/70 bg-sky-500/15 text-sky-300",
    badge: "bg-sky-500/20 text-sky-300",
  },
  DEF: {
    avatar: "border-blue-400/70 bg-blue-600/15 text-blue-300",
    badge: "bg-blue-600/20 text-blue-300",
  },
  MID: {
    avatar: "border-violet-400/70 bg-violet-500/15 text-violet-300",
    badge: "bg-violet-500/20 text-violet-300",
  },
  FWD: {
    avatar: "border-orange-400/70 bg-orange-500/15 text-orange-300",
    badge: "bg-orange-500/20 text-orange-300",
  },
};

const OPP_AVATAR =
  "border-rose-400/70 bg-rose-500/15 text-rose-300";
const OPP_BADGE = "bg-rose-500/20 text-rose-300";

function roleStyle(position: string | null | undefined) {
  const role = getPositionRole(position) ?? "MID";
  return ROLE_STYLE[role];
}

function displayName(athlete: MatchSquadAthlete) {
  return `${athlete.firstName} ${athlete.lastName}`.trim();
}

function sortByShirt(left: MatchSquadAthlete, right: MatchSquadAthlete) {
  const leftNumber = left.squadNumber ?? Number.POSITIVE_INFINITY;
  const rightNumber = right.squadNumber ?? Number.POSITIVE_INFINITY;
  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return displayName(left).localeCompare(displayName(right));
}

function PickerRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-[#00d99a]/70 bg-[#00d99a]/10"
          : "border-[#1c2b36] bg-[#101920] hover:border-[#00d99a]/40",
      )}
    >
      {children}
    </button>
  );
}

function EmptyRow({
  selected,
  label,
  onSelect,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <PickerRow selected={selected} onSelect={onSelect}>
      <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded-full border border-[#3d4f5c] bg-[#0c1218] text-[11px] font-bold text-[#8e9ba8]">
        —
      </span>
      <span className="text-sm font-semibold text-[#8e9ba8]">{label}</span>
    </PickerRow>
  );
}

export function AthletePicker({
  squad,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = "Unassigned",
  excludeIds = [],
  compact = false,
  "aria-label": ariaLabel = "Athlete",
}: {
  squad: MatchSquadAthlete[];
  value: string;
  onChange: (athleteId: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  excludeIds?: string[];
  compact?: boolean;
  "aria-label"?: string;
}) {
  const excluded = new Set(excludeIds);
  const sorted = [...squad]
    .filter((athlete) => !excluded.has(athlete.id))
    .sort(sortByShirt);

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      className={cn(
        "mt-1 space-y-2 overflow-y-auto pr-0.5",
        compact ? "max-h-40" : "max-h-56",
      )}
    >
      {allowEmpty ? (
        <EmptyRow
          selected={value === ""}
          label={emptyLabel}
          onSelect={() => onChange("")}
        />
      ) : null}
      {sorted.map((athlete) => {
        const style = roleStyle(athlete.position);
        const selected = value === athlete.id;
        return (
          <PickerRow
            key={athlete.id}
            selected={selected}
            onSelect={() => onChange(athlete.id)}
          >
            <span
              className={cn(
                "flex h-10 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                style.avatar,
              )}
            >
              {athlete.squadNumber ?? "—"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-[#e8ecef]">
                  {displayName(athlete)}
                </span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    style.badge,
                  )}
                >
                  {(athlete.position ?? "—").toUpperCase()}
                </span>
              </span>
            </span>
          </PickerRow>
        );
      })}
    </div>
  );
}

export function OpponentPlayerPicker({
  players,
  value,
  onChange,
  visibility,
  allowEmpty = true,
  emptyLabel = "Unassigned",
  excludeIds = [],
  compact = false,
  "aria-label": ariaLabel = "Opponent",
}: {
  players: OpponentMatchPlayer[];
  value: string;
  onChange: (playerId: string) => void;
  visibility: OpponentSquadVisibility;
  allowEmpty?: boolean;
  emptyLabel?: string;
  excludeIds?: string[];
  compact?: boolean;
  "aria-label"?: string;
}) {
  const excluded = new Set(excludeIds);
  const sorted = [...players]
    .filter((player) => !excluded.has(player.id))
    .sort((left, right) => left.shirtNumber - right.shirtNumber);

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      className={cn(
        "mt-1 space-y-2 overflow-y-auto pr-0.5",
        compact ? "max-h-40" : "max-h-56",
      )}
    >
      {allowEmpty ? (
        <EmptyRow
          selected={value === ""}
          label={emptyLabel}
          onSelect={() => onChange("")}
        />
      ) : null}
      {sorted.map((player) => {
        const style = player.position
          ? roleStyle(player.position)
          : { avatar: OPP_AVATAR, badge: OPP_BADGE };
        const selected = value === player.id;
        const positionLabel = (player.position ?? "").toUpperCase();
        return (
          <PickerRow
            key={player.id}
            selected={selected}
            onSelect={() => onChange(player.id)}
          >
            <span
              className={cn(
                "flex h-10 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                style.avatar,
              )}
            >
              {player.shirtNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-[#e8ecef]">
                  {opponentPlayerLabel(player, visibility)}
                </span>
                {positionLabel ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      style.badge,
                    )}
                  >
                    {positionLabel}
                  </span>
                ) : null}
              </span>
            </span>
          </PickerRow>
        );
      })}
    </div>
  );
}

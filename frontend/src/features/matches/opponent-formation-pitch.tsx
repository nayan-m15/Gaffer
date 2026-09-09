import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { contrastText } from "@/features/matches/live-match-model";
import {
  assignedShirtNumbers,
  assignShirtToSlot,
  clearSlot,
  type DraftOpponentPlayer,
} from "@/features/matches/opponent-squad-draft";
import {
  DEFAULT_FORMATION_ID,
  FORMATIONS,
} from "@/features/team-management/formations";
import { SquadPitchMarkings } from "@/features/team-management/SquadFormationPreview";
import type { PitchAssignments } from "@/features/team-management/types";
import { cn } from "@/lib/utils";

interface OpponentFormationPitchProps {
  formationId: string;
  assignments: PitchAssignments;
  players: DraftOpponentPlayer[];
  opponentColor: string;
  onAssignmentsChange: (next: PitchAssignments) => void;
}

export function OpponentFormationPitch({
  formationId,
  assignments,
  players,
  opponentColor,
  onAssignmentsChange,
}: OpponentFormationPitchProps) {
  const formation =
    FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const taken = assignedShirtNumbers(assignments);
  const playerByShirt = new Map(
    players.map((player) => [player.shirtNumber, player]),
  );

  return (
    <div
      className="squad-formation-pitch relative aspect-[3/4] w-full overflow-hidden rounded-xl border-2"
      style={{ borderColor: opponentColor }}
      role="img"
      aria-label={`${formation.name} opponent formation`}
    >
      <div className="opponent-formation-pitch-stripes absolute inset-0" />
      <div className="squad-formation-pitch-vignette pointer-events-none absolute inset-0" />
      <SquadPitchMarkings />
      <p className="pointer-events-none absolute left-1/2 top-2 z-[2] -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">
        Attacking ↑
      </p>
      <div className="absolute inset-0 z-[3]">
        {formation.positions.map((slot) => {
          const raw = assignments[slot.id];
          const shirt = raw ? Number.parseInt(raw, 10) : NaN;
          const assigned = Number.isInteger(shirt);
          const player = assigned ? playerByShirt.get(shirt) : undefined;
          const unassigned = players.filter(
            (entry) =>
              !taken.has(entry.shirtNumber) || entry.shirtNumber === shirt,
          );
          return (
            <Popover
              key={slot.id}
              open={openSlotId === slot.id}
              onOpenChange={(open) =>
                setOpenSlotId(open ? slot.id : null)
              }
              modal
            >
              <div
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              >
                <PopoverTrigger
                  className="flex flex-col items-center focus-visible:outline-none"
                  aria-label={
                    assigned
                      ? `Reassign ${slot.label}, currently #${shirt}`
                      : `Assign a player to ${slot.label}`
                  }
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full text-xs font-bold tabular-nums sm:size-11 sm:text-sm",
                      assigned
                        ? "border-2 border-white"
                        : "border-2 border-dashed border-white/85 bg-transparent text-white",
                    )}
                    style={
                      assigned
                        ? {
                            backgroundColor: opponentColor,
                            color: contrastText(opponentColor),
                            boxShadow: `0 0 10px ${opponentColor}99`,
                          }
                        : undefined
                    }
                  >
                    {assigned ? shirt : <Plus className="size-4" />}
                  </span>
                </PopoverTrigger>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {slot.label}
                </span>
              </div>
              <PopoverContent
                align="center"
                side="top"
                className="w-44 gap-2 p-2"
              >
                <PopoverHeader className="px-1">
                  <PopoverTitle className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {assigned
                      ? `${slot.label} · #${shirt}`
                      : `Place ${slot.label}`}
                  </PopoverTitle>
                </PopoverHeader>
                {unassigned.length === 0 && !assigned ? (
                  <p className="px-1 text-xs text-muted-foreground">
                    Add a shirt number first.
                  </p>
                ) : (
                  <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                    {unassigned.map((entry) => (
                      <li key={entry.shirtNumber}>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                            entry.shirtNumber === shirt && "bg-muted",
                          )}
                          onClick={() => {
                            onAssignmentsChange(
                              assignShirtToSlot(
                                assignments,
                                slot.id,
                                entry.shirtNumber,
                              ),
                            );
                            setOpenSlotId(null);
                          }}
                        >
                          <span className="font-semibold tabular-nums">
                            #{entry.shirtNumber}
                          </span>
                          {entry.name ? (
                            <span className="max-w-[6rem] truncate text-muted-foreground">
                              {entry.name}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {assigned ? (
                  <button
                    type="button"
                    className="rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      onAssignmentsChange(clearSlot(assignments, slot.id));
                      setOpenSlotId(null);
                    }}
                  >
                    Clear slot
                  </button>
                ) : null}
                {player?.name && assigned ? (
                  <p className="px-1 text-[11px] text-muted-foreground">
                    {player.name}
                  </p>
                ) : null}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

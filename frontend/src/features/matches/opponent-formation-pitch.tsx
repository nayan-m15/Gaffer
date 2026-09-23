import {
  useCallback,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { contrastText } from "@/features/matches/live-match-model";
import { applyOpponentShirtDrop } from "@/features/matches/opponent-shirt-drop";
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
import { usePointerDrag } from "@/features/team-management/usePointerDrag";
import type {
  DragItem,
  DragPayload,
  PitchAssignments,
} from "@/features/team-management/types";
import { cn } from "@/lib/utils";

interface OpponentFormationPitchProps {
  formationId: string;
  assignments: PitchAssignments;
  players: DraftOpponentPlayer[];
  opponentColor: string;
  dragItem: DragItem | null;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onAssignmentsChange: (next: PitchAssignments) => void;
}

function parseDragPayload(data: string): DragPayload | null {
  try {
    return JSON.parse(data) as DragPayload;
  } catch {
    return null;
  }
}

export function OpponentFormationPitch({
  formationId,
  assignments,
  players,
  opponentColor,
  dragItem,
  onDragStart,
  onDragEnd,
  onAssignmentsChange,
}: OpponentFormationPitchProps) {
  const formation =
    FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const taken = assignedShirtNumbers(assignments);
  const playerByShirt = new Map(
    players.map((player) => [player.shirtNumber, player]),
  );

  const handleDrop = useCallback(
    (
      source: DragItem,
      target: { type: "pitch"; positionId: string } | { type: "subs" },
    ) => {
      const next = applyOpponentShirtDrop(assignments, source, target);
      if (next) {
        onAssignmentsChange(next);
      }
      setOpenSlotId(null);
    },
    [assignments, onAssignmentsChange],
  );

  const startDrag = useCallback(
    (item: DragItem) => {
      setOpenSlotId(null);
      onDragStart(item);
    },
    [onDragStart],
  );

  return (
    <div
      className="relative mx-auto aspect-[3/4] w-full max-w-full lg:w-[480px] lg:max-w-[480px]"
      role="img"
      aria-label={`${formation.name} opponent formation`}
    >
      <div
        className="squad-formation-pitch absolute inset-0 overflow-hidden rounded-xl border-2"
        style={{ borderColor: opponentColor }}
      >
        <div className="opponent-formation-pitch-stripes absolute inset-0" />
        <div className="squad-formation-pitch-vignette pointer-events-none absolute inset-0" />
        <SquadPitchMarkings />
        <p className="pointer-events-none absolute left-1/2 top-2 z-[2] -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">
          Attacking ↑
        </p>
      </div>
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
            <OpponentPitchSlot
              key={slot.id}
              slotId={slot.id}
              slotLabel={slot.label}
              x={slot.x}
              y={slot.y}
              shirt={assigned ? shirt : null}
              playerName={player?.name}
              opponentColor={opponentColor}
              unassigned={unassigned}
              open={openSlotId === slot.id}
              dragItem={dragItem}
              onOpenChange={(open) => setOpenSlotId(open ? slot.id : null)}
              onAssign={(nextShirt) => {
                onAssignmentsChange(
                  assignShirtToSlot(assignments, slot.id, nextShirt),
                );
                setOpenSlotId(null);
              }}
              onClear={() => {
                onAssignmentsChange(clearSlot(assignments, slot.id));
                setOpenSlotId(null);
              }}
              onDragStart={startDrag}
              onDragEnd={onDragEnd}
              onDrop={handleDrop}
            />
          );
        })}
      </div>
    </div>
  );
}

function OpponentPitchSlot({
  slotId,
  slotLabel,
  x,
  y,
  shirt,
  playerName,
  opponentColor,
  unassigned,
  open,
  dragItem,
  onOpenChange,
  onAssign,
  onClear,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  slotId: string;
  slotLabel: string;
  x: number;
  y: number;
  shirt: number | null;
  playerName?: string;
  opponentColor: string;
  unassigned: DraftOpponentPlayer[];
  open: boolean;
  dragItem: DragItem | null;
  onOpenChange: (open: boolean) => void;
  onAssign: (shirtNumber: number) => void;
  onClear: () => void;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onDrop: (
    source: DragItem,
    target: { type: "pitch"; positionId: string } | { type: "subs" },
  ) => void;
}) {
  const assigned = shirt != null;
  const [isDragOver, setIsDragOver] = useState(false);
  const dragSource = useMemo<DragItem | null>(
    () =>
      assigned
        ? {
            athleteId: String(shirt),
            source: "pitch",
            positionId: slotId,
          }
        : null,
    [assigned, shirt, slotId],
  );
  const isDragging =
    dragItem !== null &&
    dragItem.source === "pitch" &&
    dragItem.positionId === slotId;
  const isValidDrop =
    dragItem !== null &&
    !isDragging &&
    (shirt == null || String(shirt) !== dragItem.athleteId);

  const pointerDragHandlers = usePointerDrag(
    dragSource,
    onDragStart,
    onDragEnd,
    onDrop,
  );

  const handleHtmlDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      if (!dragSource) {
        event.preventDefault();
        return;
      }
      const payload: DragPayload = {
        athleteId: dragSource.athleteId,
        source: "pitch",
        positionId: slotId,
      };
      event.dataTransfer.setData("application/json", JSON.stringify(payload));
      event.dataTransfer.effectAllowed = "move";
      onDragStart(dragSource);
    },
    [dragSource, onDragStart, slotId],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (!isDragOver) setIsDragOver(true);
    },
    [isDragOver],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      const payload = parseDragPayload(
        event.dataTransfer.getData("application/json"),
      );
      if (!payload) return;
      onDrop(
        {
          athleteId: payload.athleteId,
          source: payload.source,
          positionId: payload.positionId ?? undefined,
        },
        { type: "pitch", positionId: slotId },
      );
    },
    [onDrop, slotId],
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <div
        className={cn(
          "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center",
          (isDragOver || isValidDrop) && "z-20",
          "data-[pointer-drag-over=true]:scale-110",
        )}
        style={{ left: `${x}%`, top: `${y}%` }}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        data-lineup-drop-target="pitch"
        data-position-id={slotId}
      >
        <PopoverTrigger
          className={cn(
            "flex flex-col items-center focus-visible:outline-none",
            assigned && "touch-none",
            isDragging && "opacity-40",
            isDragOver && isValidDrop && "scale-110",
          )}
          aria-label={
            assigned
              ? `Reassign ${slotLabel}, currently #${shirt}`
              : `Assign a player to ${slotLabel}`
          }
          draggable={assigned}
          onDragStart={handleHtmlDragStart}
          onDragEnd={onDragEnd}
          {...pointerDragHandlers}
        >
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-full text-xs font-bold tabular-nums sm:size-14 sm:text-sm",
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
            {assigned ? shirt : <Plus className="size-4 sm:size-5" />}
          </span>
        </PopoverTrigger>
        <span className="mt-0.5 max-w-[4.5rem] truncate text-center text-[9px] font-semibold uppercase tracking-wide text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-[10px]">
          {slotLabel}
        </span>
        {playerName ? (
          <span className="max-w-[4.5rem] truncate text-center text-[9px] font-medium text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {playerName}
          </span>
        ) : null}
      </div>
      <PopoverContent align="center" side="top" className="w-44 gap-2 p-2">
        <PopoverHeader className="px-1">
          <PopoverTitle className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {assigned ? `${slotLabel} · #${shirt}` : `Place ${slotLabel}`}
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
                  onClick={() => onAssign(entry.shirtNumber)}
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
            onClick={onClear}
          >
            Clear slot
          </button>
        ) : null}
        {playerName && assigned ? (
          <p className="px-1 text-[11px] text-muted-foreground">{playerName}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function OpponentShirtChip({
  player,
  opponentColor,
  showName = true,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  player: DraftOpponentPlayer;
  opponentColor: string;
  showName?: boolean;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onDrop: (
    source: DragItem,
    target: { type: "pitch"; positionId: string } | { type: "subs" },
  ) => void;
}) {
  const item = useMemo<DragItem>(
    () => ({ athleteId: String(player.shirtNumber), source: "subs" }),
    [player.shirtNumber],
  );
  const pointerDragHandlers = usePointerDrag(
    item,
    onDragStart,
    onDragEnd,
    onDrop,
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const payload: DragPayload = {
        athleteId: item.athleteId,
        source: "subs",
        positionId: null,
      };
      event.dataTransfer.setData("application/json", JSON.stringify(payload));
      event.dataTransfer.effectAllowed = "move";
      onDragStart(item);
    },
    [item, onDragStart],
  );

  return (
    <button
      type="button"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className="cursor-grab touch-none rounded-lg px-2.5 py-1 text-left text-sm font-semibold tabular-nums active:cursor-grabbing lg:px-4 lg:py-2 lg:text-lg"
      style={{ boxShadow: `inset 0 0 0 1px ${opponentColor}` }}
      aria-label={`Drag opponent #${player.shirtNumber} onto the pitch`}
      {...pointerDragHandlers}
    >
      {player.shirtNumber}
      {showName && player.name ? (
        <span className="ml-1 font-medium text-muted-foreground">
          {player.name}
        </span>
      ) : null}
    </button>
  );
}

export function OpponentUnassignedDropZone({
  dragItem,
  onDrop,
  onDragEnd,
  children,
}: {
  dragItem: DragItem | null;
  onDrop: (
    source: DragItem,
    target: { type: "pitch"; positionId: string } | { type: "subs" },
  ) => void;
  onDragEnd: () => void;
  children: ReactNode;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const canAccept = dragItem?.source === "pitch";

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canAccept) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    },
    [canAccept],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      const payload = parseDragPayload(
        event.dataTransfer.getData("application/json"),
      );
      if (!payload || payload.source !== "pitch") return;
      onDrop(
        {
          athleteId: payload.athleteId,
          source: payload.source,
          positionId: payload.positionId ?? undefined,
        },
        { type: "subs" },
      );
    },
    [onDrop],
  );

  return (
    <div
      className={cn(
        "mt-3 min-h-14 rounded-xl border border-dashed bg-background/60 px-3 py-2.5 lg:mt-0 lg:flex lg:w-32 lg:shrink-0 lg:flex-col lg:self-stretch",
        isDragOver && canAccept
          ? "border-primary bg-primary/10"
          : "border-border",
      )}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onDragEnd={onDragEnd}
      data-lineup-drop-target="subs"
    >
      {children}
    </div>
  );
}

/**
 * Substitutes bench area for the Team Management page.
 *
 * Displays substitute players in a horizontal scrollable row and acts as a
 * drag-and-drop target so pitch players can be dragged here to remove them
 * from the starting XI.
 */

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PlayerCard } from "./PlayerCard";
import type { BackendAthlete } from "@/services/athletes";
import type { DragItem, DragPayload } from "./types";
import { usePointerDrag } from "./usePointerDrag";

interface SubstitutesAreaProps {
  /** Athletes currently on the substitutes bench. */
  athletes: BackendAthlete[];
  /** The current drag item, if any. */
  dragItem: DragItem | null;
  /** Coach-only: when true bench cards cannot be dragged (assistant view). */
  readOnly?: boolean;
  /** Called when a drag starts on a substitute player. */
  onDragStart: (item: DragItem) => void;
  /** Called when a drag ends. */
  onDragEnd: () => void;
  /** Called when a pitch player is dropped onto the bench. */
  onDrop: (
    source: DragItem,
    target: { type: "pitch"; positionId: string } | { type: "subs" },
  ) => void;
}

/** Parse the JSON drag payload from a DataTransfer object. */
function parseDragPayload(data: string): DragPayload | null {
  try {
    return JSON.parse(data) as DragPayload;
  } catch {
    return null;
  }
}

interface SubstitutePlayerProps {
  athlete: BackendAthlete;
  isDragging: boolean;
  readOnly: boolean;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onDrop: (
    source: DragItem,
    target: { type: "pitch"; positionId: string } | { type: "subs" },
  ) => void;
}

function SubstitutePlayer({
  athlete,
  isDragging,
  readOnly,
  onDragStart,
  onDragEnd,
  onDrop,
}: SubstitutePlayerProps) {
  const disabled = readOnly || athlete.status === "injured";
  const item = useMemo<DragItem>(
    () => ({ athleteId: athlete.id, source: "subs" }),
    [athlete.id],
  );
  const pointerDragHandlers = usePointerDrag(
    disabled ? null : item,
    onDragStart,
    onDragEnd,
    onDrop,
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      const payload: DragPayload = {
        athleteId: athlete.id,
        source: "subs",
        positionId: null,
      };
      event.dataTransfer.setData("application/json", JSON.stringify(payload));
      event.dataTransfer.effectAllowed = "move";
      onDragStart(item);
    },
    [athlete.id, item, onDragStart],
  );

  const initials = `${athlete.firstName.charAt(0)}${athlete.lastName.charAt(0)}`.toUpperCase();
  const name = `${athlete.firstName} ${athlete.lastName}`;

  return (
    <PlayerCard
      initials={initials}
      name={name}
      position={athlete.position ?? "UN"}
      squadNumber={athlete.squadNumber}
      status={athlete.status}
      appearances={athlete.appearances}
      goals={athlete.goals}
      assists={athlete.assists}
      yellowCards={athlete.yellowCards}
      redCards={athlete.redCards}
      variant="sub"
      isDragging={isDragging}
      readOnly={disabled}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      {...pointerDragHandlers}
    />
  );
}

export function SubstitutesArea({
  athletes,
  dragItem,
  readOnly = false,
  onDragStart,
  onDragEnd,
  onDrop,
}: SubstitutesAreaProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Only pitch players can be dropped onto the subs area
  const canAcceptDrop = dragItem?.source === "pitch";

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptDrop) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!isDragOver) setIsDragOver(true);
    },
    [canAcceptDrop, isDragOver],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const raw = e.dataTransfer.getData("application/json");
      const payload = parseDragPayload(raw);
      if (!payload || payload.source !== "pitch") return;

      const source: DragItem = {
        athleteId: payload.athleteId,
        source: payload.source,
        positionId: payload.positionId ?? undefined,
      };

      onDrop(source, { type: "subs" });
    },
    [onDrop],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragOver(false);
    onDragEnd();
  }, [onDragEnd]);

  return (
    <div className="w-full">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Substitutes
        {athletes.length > 0 && (
          <span className="ml-1.5 text-[10px] font-normal normal-case">
            ({athletes.length})
          </span>
        )}
      </h3>

      <div
        className={cn(
          "flex gap-2 overflow-x-auto rounded-lg border border-dashed p-3",
          "min-h-[72px] transition-colors duration-150",
          "border-border/50 bg-muted/30",
          isDragOver && canAcceptDrop && "border-primary bg-primary/5",
          athletes.length === 0 && !isDragOver && "items-center justify-center",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-lineup-drop-target="subs"
        role="region"
        aria-label="Substitute players"
      >
        {athletes.length === 0 && !isDragOver && (
          <p className="text-xs text-muted-foreground/60">
            {readOnly ? "No substitutes selected" : "Drag players here from the pitch"}
          </p>
        )}

        {athletes.length === 0 && isDragOver && canAcceptDrop && (
          <p className="text-xs font-medium text-primary">
            Drop to move to substitutes
          </p>
        )}

        {athletes.map((athlete) => {
          const isDragging =
            dragItem !== null &&
            dragItem.source === "subs" &&
            dragItem.athleteId === athlete.id;

          return (
            <SubstitutePlayer
              key={athlete.id}
              athlete={athlete}
              isDragging={isDragging}
              readOnly={readOnly}
              onDragStart={onDragStart}
              onDragEnd={handleDragEnd}
              onDrop={onDrop}
            />
          );
        })}
      </div>
    </div>
  );
}

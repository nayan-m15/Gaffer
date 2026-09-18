/**
 * Renders a single player (or empty slot) at a formation position on the pitch.
 *
 * Handles absolute positioning via percentage coordinates and acts as a
 * drag-and-drop target for swapping players or placing substitutes.
 */

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { PlayerCard } from "./PlayerCard";
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";
import type { BackendAthlete } from "@/services/athletes";
import type { FormationPosition, DragItem, DragPayload } from "./types";

interface PitchPlayerProps {
  /** The formation position slot (coordinates and label). */
  position: FormationPosition;
  /** The athlete assigned to this position, or null if empty. */
  athlete: BackendAthlete | null;
  /** The current drag item, if any. */
  dragItem: DragItem | null;
  /** When true, transform vertical formation coords to horizontal layout. */
  horizontal?: boolean;
  /** Coach-only: when true the player card cannot be dragged (assistant view). */
  readOnly?: boolean;
  /** Called when a drag starts on this player. */
  onDragStart: (item: DragItem) => void;
  /** Called when a drag ends. */
  onDragEnd: () => void;
  /** Called when something is dropped on this position. */
  onDrop: (source: DragItem, target: { type: "pitch"; positionId: string }) => void;
}

/** Parse the JSON drag payload from a DataTransfer object. */
function parseDragPayload(data: string): DragPayload | null {
  try {
    return JSON.parse(data) as DragPayload;
  } catch {
    return null;
  }
}

export function PitchPlayer({
  position,
  athlete,
  dragItem,
  horizontal = false,
  readOnly = false,
  onDragStart,
  onDragEnd,
  onDrop,
}: PitchPlayerProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Transform vertical formation coords to horizontal when needed.
  // Vertical: x = across, y = down (opponent goal at top, own at bottom).
  // Horizontal: own goal at left, opponent at right.
  //   left%  = original y
  //   top%   = 100 - original x
  const left = horizontal ? position.y : position.x;
  const top = horizontal ? 100 - position.x : position.y;

  const isDragging =
    dragItem !== null &&
    dragItem.source === "pitch" &&
    dragItem.positionId === position.id;

  // A valid drop on this position: something is being dragged and this position
  // is either empty or has a different player (swap).
  const isValidDrop =
    dragItem !== null && !isDragging && (athlete === null || athlete.id !== dragItem.athleteId);

  // Invalid: trying to drop the same player onto their own position
  const isInvalid =
    dragItem !== null && !isDragging && athlete !== null && athlete.id === dragItem.athleteId;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!athlete) {
        e.preventDefault();
        return;
      }

      const payload: DragPayload = {
        athleteId: athlete.id,
        source: "pitch",
        positionId: position.id,
      };
      e.dataTransfer.setData("application/json", JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";

      onDragStart({
        athleteId: athlete.id,
        source: "pitch",
        positionId: position.id,
      });
    },
    [athlete, position.id, onDragStart],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!isDragOver) setIsDragOver(true);
    },
    [isDragOver],
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
      if (!payload) return;

      const source: DragItem = {
        athleteId: payload.athleteId,
        source: payload.source,
        positionId: payload.positionId ?? undefined,
      };

      onDrop(source, { type: "pitch", positionId: position.id });
    },
    [onDrop, position.id],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragOver(false);
    onDragEnd();
  }, [onDragEnd]);

  /* ── Empty slot ─────────────────────────────────────────────────────────── */
  if (!athlete) {
    return (
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
        style={{ left: `${left}%`, top: `${top}%` }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          className={cn(
            "flex flex-col items-center gap-0.5",
            "w-[clamp(52px,8vw,68px)]",
          )}
          role="button"
          aria-label={`Empty ${position.label} position`}
        >
          <div
            className={cn(
              "flex items-center justify-center rounded-full border-2 border-dashed",
              "size-[clamp(32px,5vw,42px)]",
              "text-[9px] font-semibold uppercase",
              "transition-colors duration-150",
              "border-white/50 text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]",
              isDragOver && dragItem && "border-white bg-white/25 text-white scale-110",
            )}
          >
            {position.label}
          </div>
          <span className="text-[clamp(7px,1.1vw,9px)] text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
            {position.label}
          </span>
        </div>
      </div>
    );
  }

  /* ── Occupied slot ─────────────────────────────────────────────────────── */
  const initials = `${athlete.firstName.charAt(0)}${athlete.lastName.charAt(0)}`.toUpperCase();
  const name = `${athlete.firstName} ${athlete.lastName}`;

  return (
    <div
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 z-10 transition-transform duration-150",
        isDragOver && isValidDrop && "scale-105",
      )}
      style={{ left: `${left}%`, top: `${top}%` }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatedTooltip
        label={name}
        description={`${athlete.position ?? position.label}${athlete.squadNumber != null ? ` · #${athlete.squadNumber}` : ""} · ${athlete.status}`}
      >
        <PlayerCard
          initials={initials}
          name={name}
          position={athlete.position ?? position.label}
          squadNumber={athlete.squadNumber}
          status={athlete.status}
          variant="pitch"
          isDragging={isDragging}
          isDropTarget={isDragOver && isValidDrop}
          isInvalid={isDragOver && isInvalid}
          readOnly={readOnly}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      </AnimatedTooltip>
    </div>
  );
}

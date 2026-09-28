import { Lock, Move } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormationPosition } from "./types";

interface CustomFormationHandleProps {
  position: FormationPosition;
  horizontal?: boolean;
  onMove: (positionId: string, x: number, y: number) => void;
}

export function CustomFormationHandle({
  position,
  horizontal = false,
  onMove,
}: CustomFormationHandleProps) {
  const left = horizontal ? position.y : position.x;
  const top = horizontal ? 100 - position.x : position.y;
  const locked = position.role === "GK";

  const moveFromPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (locked) return;
    const overlay = event.currentTarget.parentElement;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const displayX = ((event.clientX - rect.left) / rect.width) * 100;
    const displayY = ((event.clientY - rect.top) / rect.height) * 100;
    const formationX = horizontal ? 100 - displayY : displayX;
    const formationY = horizontal ? displayX : displayY;
    onMove(position.id, formationX, formationY);
  };

  return (
    <button
      type="button"
      disabled={locked}
      aria-label={
        locked
          ? "Goalkeeper position is fixed"
          : `Move ${position.label} custom formation position`
      }
      title={locked ? "Goalkeeper position is fixed" : "Drag to move position"}
      className={cn(
        "absolute z-30 flex size-16 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-dashed shadow-lg backdrop-blur-[1px]",
        locked
          ? "cursor-not-allowed border-sky-300/70 bg-sky-500/15 text-sky-100"
          : "cursor-grab border-primary/80 bg-primary/15 text-white active:cursor-grabbing",
      )}
      style={{ left: `${left}%`, top: `${top}%` }}
      onPointerDown={(event) => {
        if (locked) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        moveFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (locked || !event.currentTarget.hasPointerCapture(event.pointerId)) {
          return;
        }
        event.preventDefault();
        moveFromPointer(event);
      }}
    >
      <span className="flex flex-col items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide">
        {locked ? <Lock className="size-3" aria-hidden /> : <Move className="size-3" aria-hidden />}
        {position.label}
      </span>
    </button>
  );
}

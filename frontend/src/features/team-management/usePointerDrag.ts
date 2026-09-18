import { useCallback, useRef, type PointerEventHandler } from "react";
import type { DragItem } from "./types";

type DropTarget =
  | { type: "pitch"; positionId: string }
  | { type: "subs" };

interface PointerDragHandlers {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
}

const DRAG_THRESHOLD_PX = 6;

function targetAtPoint(x: number, y: number): {
  element: HTMLElement;
  target: DropTarget;
} | null {
  const element = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-lineup-drop-target]");

  if (!element) return null;

  if (element.dataset.lineupDropTarget === "subs") {
    return { element, target: { type: "subs" } };
  }

  const positionId = element.dataset.positionId;
  if (element.dataset.lineupDropTarget === "pitch" && positionId) {
    return { element, target: { type: "pitch", positionId } };
  }

  return null;
}

/**
 * Mobile/pen counterpart to native HTML drag-and-drop.
 *
 * HTML DnD is retained for mouse input. Pointer events are used for touch and
 * pen input because mobile browsers generally do not emit DragEvent events.
 */
export function usePointerDrag(
  item: DragItem | null,
  onDragStart: (item: DragItem) => void,
  onDragEnd: () => void,
  onDrop: (source: DragItem, target: DropTarget) => void,
): PointerDragHandlers {
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);
  const highlightedRef = useRef<HTMLElement | null>(null);

  const setHighlighted = useCallback((element: HTMLElement | null) => {
    if (highlightedRef.current === element) return;
    highlightedRef.current?.removeAttribute("data-pointer-drag-over");
    element?.setAttribute("data-pointer-drag-over", "true");
    highlightedRef.current = element;
  }, []);

  const finish = useCallback(() => {
    setHighlighted(null);
    originRef.current = null;
    activeRef.current = false;
    onDragEnd();
  }, [onDragEnd, setHighlighted]);

  const onPointerDown = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      if (!item || event.pointerType === "mouse" || event.button !== 0) return;

      originRef.current = { x: event.clientX, y: event.clientY };
      activeRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [item],
  );

  const onPointerMove = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      const origin = originRef.current;
      if (!item || !origin || event.pointerType === "mouse") return;

      if (!activeRef.current) {
        const distance = Math.hypot(
          event.clientX - origin.x,
          event.clientY - origin.y,
        );
        if (distance < DRAG_THRESHOLD_PX) return;
        activeRef.current = true;
        onDragStart(item);
      }

      event.preventDefault();
      setHighlighted(targetAtPoint(event.clientX, event.clientY)?.element ?? null);
    },
    [item, onDragStart, setHighlighted],
  );

  const onPointerUp = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      if (!item || !originRef.current || event.pointerType === "mouse") return;

      if (activeRef.current) {
        const result = targetAtPoint(event.clientX, event.clientY);
        if (result) onDrop(item, result.target);
      }

      finish();
    },
    [finish, item, onDrop],
  );

  const onPointerCancel = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      if (!originRef.current || event.pointerType === "mouse") return;
      finish();
    },
    [finish],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

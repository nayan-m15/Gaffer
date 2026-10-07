/**
 * Wrapper around one tactical control (a slider or a style dropdown) that marks
 * it as the row the preview panel is currently explaining.
 *
 * Activation is driven by focus and pointer-down rather than by a click handler
 * on the whole row, so keyboard tabbing through the controls moves the preview
 * along with it.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TacticalRowProps {
  /** True when this row is the one the preview panel is describing. */
  active?: boolean;
  /** Called when the coach focuses or touches anything inside the row. */
  onActivate?: () => void;
  children: ReactNode;
}

export function TacticalRow({ active, onActivate, children }: TacticalRowProps) {
  return (
    <div
      onFocusCapture={onActivate}
      onPointerDownCapture={onActivate}
      className={cn(
        "relative -mx-2 rounded-xl px-2 py-2 transition-colors",
        active && "bg-primary/[0.07]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      {children}
    </div>
  );
}

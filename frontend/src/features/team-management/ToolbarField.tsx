/**
 * One labelled control in the Team Management toolbar: a small caption stacked
 * above the input, so the bar reads as a form rather than a string of buttons.
 * `ToolbarDivider` separates neighbouring fields.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ToolbarFieldProps {
  label: string;
  /** Id of the control the caption labels. */
  htmlFor: string;
  children: ReactNode;
  className?: string;
}

export function ToolbarField({
  label,
  htmlFor,
  children,
  className,
}: ToolbarFieldProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-medium leading-none text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Hairline between two toolbar fields, full height of the bar's content. Hidden
 * on narrow screens, where the bar wraps onto several lines and the dividers
 * would be left dangling at the end of each one.
 */
export function ToolbarDivider() {
  return (
    <span
      className="hidden w-px self-stretch bg-border-strong md:block"
      aria-hidden
    />
  );
}

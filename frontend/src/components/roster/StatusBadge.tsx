import type { AthleteStatus } from "@/components/roster/data";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: AthleteStatus;
  className?: string;
}

/**
 * StatusBadge — compact availability pill for roster rows.
 *
 * Colours per product spec, tuned for light and dark mode:
 *   - Available  → blue
 *   - Injured    → red
 *   - Suspended  → yellow
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles = {
    Available:
      "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    Injured:
      "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
    Suspended:
      "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  } as const satisfies Record<AthleteStatus, string>;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        styles[status],
        className,
      )}
    >
      {status}
    </span>
  );
}

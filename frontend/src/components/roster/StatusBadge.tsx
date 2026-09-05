import type { AthleteStatus, ClaimStatusUi } from "@/components/roster/data";
import { cn } from "@/lib/utils";

type BadgeStatus = AthleteStatus | ClaimStatusUi;

interface StatusBadgeProps {
  status: BadgeStatus;
  className?: string;
}

/**
 * StatusBadge — compact pill for roster rows.
 *
 * Colours per product spec, tuned for light and dark mode:
 *   - Available  → blue
 *   - Injured    → red
 *   - Suspended  → yellow
 *   - Unclaimed  → muted grey
 *   - Invited    → amber (claim invite pending)
 *   - Claimed    → green (profile claimed by player)
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles = {
    Available:
      "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    Injured:
      "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
    Suspended:
      "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    Unclaimed:
      "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
    Invited:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    Claimed:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  } as const satisfies Record<BadgeStatus, string>;

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

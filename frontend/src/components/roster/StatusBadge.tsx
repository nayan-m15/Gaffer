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
      "border-info/25 bg-info/10 text-info",
    Injured:
      "border-danger/25 bg-danger/10 text-danger",
    Suspended:
      "border-warning/25 bg-warning/10 text-warning",
    Unclaimed:
      "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
    Invited:
      "border-warning/25 bg-warning/10 text-warning",
    Claimed:
      "border-success/25 bg-success/10 text-success",
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

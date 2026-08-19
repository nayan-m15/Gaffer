import type { AthleteStatus } from "@/components/roster/data";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: AthleteStatus;
  className?: string;
}

/**
 * StatusBadge — compact availability pill for roster rows.
 *
 * Colours mirror the reference design:
 *   - Available  → emerald
 *   - Injured    → red
 *   - Suspended  → amber
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles = {
    Available:
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Injured:
      "bg-red-500/10 text-red-400 border-red-500/20",
    Suspended:
      "bg-amber-500/10 text-amber-400 border-amber-500/20",
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

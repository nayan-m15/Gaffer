import { cn } from "@/lib/utils";
import type { MatchResult } from "./types";

export function ResultBadge({
  result,
  selected,
  onSelect,
}: {
  result: MatchResult;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const config = {
    W: { className: "bg-primary text-primary-foreground", label: "Win" },
    D: { className: "bg-muted text-foreground", label: "Draw" },
    L: { className: "bg-destructive text-primary-foreground", label: "Loss" },
  } as const;

  const badgeClassName = cn(
    "inline-flex size-8 items-center justify-center rounded-full text-xs font-bold",
    config[result].className,
    onSelect &&
      "transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
    selected
      ? "scale-110 ring-2 ring-foreground/70 ring-offset-2 ring-offset-card"
      : onSelect && "hover:scale-105",
  );

  if (!onSelect) {
    return (
      <span className={badgeClassName} title={config[result].label}>
        {result}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={badgeClassName}
      title={config[result].label}
      aria-label={`Show ${config[result].label.toLowerCase()} match details`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {result}
    </button>
  );
}

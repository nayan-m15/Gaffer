import { cn } from "@/lib/utils";
import type { MatchCompetitionFilter } from "./match-competition-filter";

/** Shared match-only subfilter for the coach, assistant, and player calendars. */
export function MatchCompetitionSelect({
  value,
  options,
  onChange,
  className,
}: {
  value: MatchCompetitionFilter;
  options: readonly { value: string; label: string }[];
  onChange: (value: MatchCompetitionFilter) => void;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground", className)}>
      <span className="shrink-0">Matches:</span>
      <select
        aria-label="Filter matches by competition"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 max-w-56 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-semibold text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <option value="all">All matches</option>
        <option value="friendly">No competition (friendly)</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

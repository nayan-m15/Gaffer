import { ChevronRight } from "lucide-react";
import type { Athlete } from "@/components/roster/data";
import {
  getPositionGroupLabel,
  getPositionLabel,
  MOBILE_POSITION_GROUPS,
} from "@/components/roster/position";
import { StatusBadge } from "@/components/roster/StatusBadge";
import { cn } from "@/lib/utils";

export function MobileRoster({
  athletes,
  onSelect,
}: {
  athletes: Athlete[];
  onSelect: (athlete: Athlete) => void;
}) {
  const sections = [...MOBILE_POSITION_GROUPS.map((group) => group.label), "Squad"]
    .map((label) => ({
      label,
      athletes: athletes.filter((athlete) => getPositionGroupLabel(athlete.position) === label),
    }))
    .filter((section) => section.athletes.length > 0);

  return (
    <div className="divide-y divide-border-subtle md:hidden">
      {sections.map((section) => (
        <section key={section.label} className="py-2 first:pt-0 last:pb-0">
          <h2 className="px-1 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {section.label}
            <span className="ml-2 tabular-nums text-muted-foreground/70">
              {section.athletes.length}
            </span>
          </h2>
          <div className="divide-y divide-border-subtle">
            {section.athletes.map((athlete) => (
              <MobileRosterPlayerRow
                key={athlete.id}
                athlete={athlete}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MobileRosterPlayerRow({
  athlete,
  onSelect,
}: {
  athlete: Athlete;
  onSelect: (athlete: Athlete) => void;
}) {
  const hasNumber = athlete.jerseyNumber > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(athlete)}
      className="group flex min-h-16 w-full min-w-0 items-center gap-3 rounded-lg px-1 py-2 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      aria-label={`Open profile for ${athlete.name}`}
    >
      <div
        className={cn(
          "flex size-13 shrink-0 items-center justify-center rounded-xl border border-border-default bg-surface-nested text-sm font-bold text-foreground",
          athlete.isArchived && "opacity-70",
        )}
        aria-hidden="true"
      >
        {athlete.initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          {hasNumber && (
            <span className="shrink-0 text-xs font-bold tabular-nums text-brand">
              #{athlete.jerseyNumber}
            </span>
          )}
          <span className="truncate text-sm font-bold text-foreground">{athlete.name}</span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {getPositionLabel(athlete.position)}
          </span>
          {athlete.status !== "Available" && (
            <StatusBadge status={athlete.status} className="shrink-0 px-1.5 py-0 text-[9px]" />
          )}
        </div>
      </div>

      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}

export function MobileRosterSkeleton() {
  return (
    <div className="space-y-5 md:hidden" aria-label="Loading roster" aria-busy="true">
      {[3, 4, 3].map((rowCount, sectionIndex) => (
        <div key={sectionIndex}>
          <div className="mb-2 h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: rowCount }).map((_, rowIndex) => (
              <div key={rowIndex} className="flex min-h-16 items-center gap-3 py-2">
                <div className="size-13 shrink-0 animate-pulse rounded-xl bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

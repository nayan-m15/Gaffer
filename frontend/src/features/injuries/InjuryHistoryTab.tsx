import { useMemo, useState } from "react";
import { Repeat, Search } from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import { cn } from "@/lib/utils";
import { INJURY_TYPE_LABELS, SEVERITY_LABELS, injuryTitle } from "./body-regions";
import {
  INJURY_STATUS_LABELS,
  SEVERITY_TONES,
  athleteName,
  formatDate,
  returnWindowLabel,
  varianceLabel,
} from "./injury-model";
import type { InjuryListItem } from "./types";

type StatusFilter = "all" | "open" | "closed";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Returned" },
];

interface InjuryHistoryTabProps {
  injuries: readonly InjuryListItem[];
  onSelect: (injury: InjuryListItem) => void;
  className?: string;
}

/**
 * The full injury record for the team.
 *
 * The estimated-versus-actual column is the point of this table: it is what
 * turns the return guidance from a guess into something a club can audit
 * across a season, and what surfaces a region that keeps breaking down.
 */
export function InjuryHistoryTab({
  injuries,
  onSelect,
  className,
}: InjuryHistoryTabProps) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return injuries.filter((injury) => {
      if (status === "open" && !injury.isOpen) {
        return false;
      }
      if (status === "closed" && injury.isOpen) {
        return false;
      }
      if (!term) {
        return true;
      }

      return (
        athleteName(injury).toLowerCase().includes(term) ||
        injuryTitle(injury).toLowerCase().includes(term)
      );
    });
  }, [injuries, search, status]);

  return (
    <AppCard className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Injury record
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {rows.length} of {injuries.length}
          </span>
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search injuries</span>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Player or injury"
              className="h-8 w-44 rounded-lg border border-border/70 bg-card/70 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
            />
          </label>

          <div
            className="inline-flex rounded-lg border border-border/70 bg-card/70 p-0.5"
            role="group"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatus(filter.value)}
                aria-pressed={status === filter.value}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  status === filter.value
                    ? "bg-primary/90 text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {injuries.length === 0
            ? "No injuries have been recorded for this team."
            : "No injuries match these filters."}
        </p>
      ) : (
        /* The table is the one element allowed to scroll sideways on a
           phone; the page body itself must never. */
        <div className="mt-4 -mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left">
                {[
                  "Player",
                  "Injury",
                  "Severity",
                  "Date",
                  "Days out",
                  "Estimated",
                  "Actual return",
                  "Status",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="whitespace-nowrap py-2 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((injury) => (
                <tr
                  key={injury.id}
                  className="border-b border-border/40 transition-colors last:border-0 hover:bg-card/60"
                >
                  <td className="py-2.5 pr-4">
                    <button
                      type="button"
                      onClick={() => onSelect(injury)}
                      className="text-left font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {athleteName(injury)}
                      {injury.athleteSquadNumber != null && (
                        <span className="ml-1 text-muted-foreground">
                          #{injury.athleteSquadNumber}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="text-foreground">
                      {injuryTitle(injury)}
                    </span>
                    {injury.isRecurrence && (
                      <span
                        className="ml-1.5 inline-flex items-center gap-0.5 rounded border border-amber-400/30 bg-amber-400/15 px-1 py-0.5 text-[10px] font-semibold text-amber-300"
                        title="A re-injury of the same region within 90 days of a previous return"
                      >
                        <Repeat className="size-2.5" aria-hidden="true" />
                        Recurrence
                      </span>
                    )}
                    <span className="block text-[11px] text-muted-foreground">
                      {INJURY_TYPE_LABELS[injury.injuryType]}
                      {injury.context === "match" && " · in a match"}
                      {injury.context === "training" && " · in training"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[11px] font-semibold",
                        SEVERITY_TONES[injury.severity],
                      )}
                    >
                      {SEVERITY_LABELS[injury.severity]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-muted-foreground">
                    {formatDate(injury.occurredOn)}
                  </td>
                  <td className="py-2.5 pr-4 font-medium text-foreground">
                    {injury.daysOut}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-muted-foreground">
                    {returnWindowLabel(
                      injury.estimatedReturnMinDays,
                      injury.estimatedReturnMaxDays,
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    {injury.actualReturnOn ? (
                      <>
                        <span className="text-foreground">
                          {formatDate(injury.actualReturnOn)}
                        </span>
                        <span
                          className={cn(
                            "block text-[11px]",
                            (injury.returnVarianceDays ?? 0) > 0
                              ? "text-amber-300"
                              : "text-emerald-400",
                          )}
                        >
                          {varianceLabel(injury.returnVarianceDays)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Still out
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-muted-foreground">
                    {INJURY_STATUS_LABELS[injury.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppCard>
  );
}

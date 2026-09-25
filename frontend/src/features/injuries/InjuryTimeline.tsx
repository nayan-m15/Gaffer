import { Check, CircleDot, Clock } from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import { cn } from "@/lib/utils";
import { formatDate } from "./injury-model";
import type { InjuryTimelineEntry } from "./types";

type EntryState = "past" | "current" | "future";

function entryState(
  entry: InjuryTimelineEntry,
  today: string,
  currentId: string | null,
): EntryState {
  if (entry.id === currentId) {
    return "current";
  }

  return entry.occurredOn <= today ? "past" : "future";
}

/**
 * Picks the entry to mark as "currently".
 *
 * The most recent entry that has actually happened is where the athlete is
 * now; anything dated ahead is a plan. A record whose every entry is in the
 * future (logged today with a projected return) marks none.
 */
function currentEntryId(
  entries: readonly InjuryTimelineEntry[],
  today: string,
  isOpen: boolean,
): string | null {
  if (!isOpen) {
    return null;
  }
  const past = entries.filter((entry) => entry.occurredOn <= today);

  return past.length > 0 ? past[past.length - 1].id : null;
}

interface InjuryTimelineProps {
  entries: readonly InjuryTimelineEntry[];
  today: string;
  isOpen: boolean;
  className?: string;
}

/**
 * The dated narrative of one injury, from the moment it happened to the
 * projected return.
 *
 * Entries dated ahead of today are rendered as plainly unreached rather than
 * hidden: the projected return is the single most useful row on the card, and
 * it is always in the future.
 */
export function InjuryTimeline({
  entries,
  today,
  isOpen,
  className,
}: InjuryTimelineProps) {
  const currentId = currentEntryId(entries, today, isOpen);

  return (
    <AppCard className={className}>
      <h3 className="font-display text-lg font-semibold text-foreground">
        Injury timeline
      </h3>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No timeline entries recorded yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-0">
          {entries.map((entry, index) => {
            const state = entryState(entry, today, currentId);
            const isLast = index === entries.length - 1;

            return (
              <li key={entry.id} className="flex gap-3">
                {/* Marker column, with the connector drawn between dots. */}
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border",
                      state === "past" &&
                        "border-emerald-500/40 bg-emerald-500/20 text-emerald-300",
                      state === "current" &&
                        "border-primary bg-primary/20 text-primary",
                      state === "future" &&
                        "border-border/70 bg-card/60 text-muted-foreground",
                    )}
                    aria-hidden="true"
                  >
                    {state === "past" && <Check className="size-3.5" />}
                    {state === "current" && <CircleDot className="size-3.5" />}
                    {state === "future" && <Clock className="size-3" />}
                  </span>
                  {!isLast && (
                    <span
                      className={cn(
                        "w-px flex-1",
                        state === "past" ? "bg-emerald-500/30" : "bg-border/70",
                      )}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-5")}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        state === "current"
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {state === "current" ? "Currently" : formatDate(entry.occurredOn)}
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {entry.title}
                    </p>
                  </div>
                  {entry.detail && (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {entry.detail}
                    </p>
                  )}
                  {state === "current" && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDate(entry.occurredOn)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </AppCard>
  );
}

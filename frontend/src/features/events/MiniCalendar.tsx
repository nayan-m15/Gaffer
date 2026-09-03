import { useMemo } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatMonthYear,
  formatFullDayLabel,
  getMiniWeekdayLabels,
  getMonthGrid,
  isOutsideMonth,
  isSameCalendarDay,
  toDayKey,
} from "./calendar-utils";

const miniWeekdayLabels = getMiniWeekdayLabels();

interface MiniCalendarProps {
  /** Any date inside the month being displayed (synced with the main calendar). */
  month: Date;
  selectedDate: Date;
  now: Date;
  /** Local day keys (YYYY-MM-DD) that contain at least one visible event. */
  eventDays: ReadonlySet<string>;
  onNavigateMonth: (direction: 1 | -1) => void;
  onSelectDate: (date: Date) => void;
}

/**
 * Compact month calendar for the sidebar. Stays synchronised with the main
 * calendar: it displays the main calendar's month and clicking a date
 * selects it (navigating the main calendar when the date is in another month).
 */
export function MiniCalendar({
  month,
  selectedDate,
  now,
  eventDays,
  onNavigateMonth,
  onSelectDate,
}: MiniCalendarProps) {
  const grid = useMemo(() => getMonthGrid(month), [month]);

  return (
    <div aria-label="Mini calendar">
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <p className="truncate text-sm font-semibold text-foreground" aria-live="polite">
          {formatMonthYear(month)}
        </p>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onNavigateMonth(-1)}
            aria-label="Previous month in mini calendar"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onNavigateMonth(1)}
            aria-label="Next month in mini calendar"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="mt-2 grid grid-cols-7" aria-hidden="true">
        {miniWeekdayLabels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="py-1 text-center text-[10px] font-semibold uppercase text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>

      {/* Days */}
      <div role="grid" className="grid grid-cols-7 gap-y-0.5">
        {grid.map((day) => {
          const outside = isOutsideMonth(day, month);
          const isToday = isSameCalendarDay(day, now);
          const isSelected = isSameCalendarDay(day, selectedDate);
          const hasEvents = eventDays.has(toDayKey(day));

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDate(day)}
              aria-label={`${formatFullDayLabel(day)}${hasEvents ? ", has events" : ""}`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              className={cn(
                "relative mx-auto flex size-8 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isToday
                  ? "bg-primary text-primary-foreground hover:bg-primary/80"
                  : outside
                    ? "text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                    : "text-foreground hover:bg-muted",
                isSelected && !isToday && "ring-1 ring-primary/50",
              )}
            >
              {format(day, "d")}
              {hasEvents && !isSelected && (
                <span
                  className={cn(
                    "absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full",
                    isToday ? "bg-primary-foreground/80" : "bg-primary/70",
                  )}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

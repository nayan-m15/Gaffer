import { ChevronLeft, ChevronRight, PanelRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarView } from "./calendar-utils";

interface CalendarToolbarProps {
  view: CalendarView;
  /** Dynamic period label, e.g. "September 2026" or "1 – 7 September 2026". */
  label: string;
  onViewChange: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewEvent: () => void;
  /** Opens the calendars drawer on screens where the sidebar is hidden. */
  onToggleSidebar: () => void;
}

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
];

/**
 * Calendar toolbar: period navigation, dynamic period label, view switcher,
 * and the primary "New Event" action.
 */
export function CalendarToolbar({
  view,
  label,
  onViewChange,
  onPrevious,
  onNext,
  onToday,
  onNewEvent,
  onToggleSidebar,
}: CalendarToolbarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 sm:gap-3"
      role="toolbar"
      aria-label="Calendar controls"
    >
      {/* Period navigation */}
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPrevious}
          aria-label={
            view === "week" ? "Previous week" : "Previous month"
          }
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNext}
          aria-label={view === "week" ? "Next week" : "Next month"}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Dynamic period label */}
      <p
        aria-live="polite"
        className="min-w-0 truncate text-base font-semibold text-foreground sm:text-lg"
      >
        {label}
      </p>

      {/* View switcher + actions */}
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label="Open calendars panel"
          className="xl:hidden"
        >
          <PanelRight className="size-4" />
        </Button>

        <div
          role="group"
          aria-label="Calendar view"
          className="flex items-center rounded-md border border-border bg-background p-0.5"
        >
          {VIEW_OPTIONS.map((option) => {
            const active = option.value === view;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onViewChange(option.value)}
                aria-pressed={active}
                className={cn(
                  "rounded-[min(var(--radius-md),10px)] px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5 sm:text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <Button size="sm" className="gap-1.5" onClick={onNewEvent}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">New Event</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>
    </div>
  );
}

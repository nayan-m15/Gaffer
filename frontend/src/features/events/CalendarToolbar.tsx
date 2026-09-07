import { ChevronLeft, ChevronRight, PanelRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EVENT_TYPE_OPTIONS } from "./event-utils";
import { getEventTypeStyle } from "./event-style";
import type { CalendarView } from "./calendar-utils";
import type { EventType } from "./types";

interface CalendarToolbarProps {
  view: CalendarView;
  /** Dynamic period label, e.g. "September 2026" or "1 – 7 September 2026". */
  label: string;
  hiddenTypes: ReadonlySet<EventType>;
  onToggleType: (type: EventType) => void;
  onViewChange: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewEvent: () => void;
  readOnly?: boolean;
  /** Opens the calendars drawer on screens where the sidebar is hidden. */
  onToggleSidebar: () => void;
}

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
];

/**
 * Calendar toolbar: period navigation, dynamic period label,
 * event type filters (Training, Match, Meeting), view switcher,
 * and the primary "New Event" action.
 */
export function CalendarToolbar({
  view,
  label,
  hiddenTypes,
  onToggleType,
  onViewChange,
  onPrevious,
  onNext,
  onToday,
  onNewEvent,
  readOnly = false,
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

      {/* Filters + View switcher + actions */}
      <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Event Type Filters (Training, Match, Meeting) directly on the left of Month/Week */}
        <div
          role="group"
          aria-label="Calendar event filters"
          className="flex items-center gap-1.5"
        >
          {EVENT_TYPE_OPTIONS.map((option) => {
            const isVisible = !hiddenTypes.has(option.value);
            const style = getEventTypeStyle(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="checkbox"
                aria-checked={isVisible}
                aria-label={`Toggle ${option.label} events`}
                onClick={() => onToggleType(option.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all duration-150 cursor-pointer shadow-2xs",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 select-none",
                  isVisible
                    ? "border-border bg-card text-foreground hover:bg-accent/50"
                    : "border-border/40 bg-muted/40 text-muted-foreground opacity-50 line-through hover:opacity-75",
                )}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full transition-opacity",
                    style.swatch,
                    !isVisible && "opacity-40",
                  )}
                  aria-hidden="true"
                />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

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

        {!readOnly && ( 
          <Button size="sm" className="gap-1.5" onClick={onNewEvent}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Event</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { AgendaView } from "./AgendaView";
import type { EventType, TeamEvent } from "./types";

interface CalendarSidebarProps {
  month: Date;
  selectedDate: Date;
  now: Date;
  events: TeamEvent[];
  /** Local day keys (YYYY-MM-DD) that contain at least one visible event. */
  eventDays?: ReadonlySet<string>;
  teamName?: string | null;
  readOnly?: boolean;
  onNavigateMonth: (direction: 1 | -1) => void;
  onSelectDate: (date: Date) => void;
  onCreateEvent: (type?: EventType) => void;
  onOpenEvent: (event: TeamEvent) => void;
  className?: string;
}

/**
 * Floating calendar sidebar with a full-height agenda.
 * Rendered inline on wide screens and inside the drawer on smaller ones.
 */
export function CalendarSidebar({
  month,
  now,
  events,
  readOnly = false,
  onNavigateMonth,
  onCreateEvent,
  onOpenEvent,
  className,
}: CalendarSidebarProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <AgendaView
        month={month}
        events={events}
        now={now}
        onOpenEvent={onOpenEvent}
        onCreateEvent={() => onCreateEvent()}
        onNavigateMonth={onNavigateMonth}
        readOnly={readOnly}
        className="h-full min-h-0 flex-1"
      />
    </div>
  );
}

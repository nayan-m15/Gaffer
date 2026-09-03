import { useState, type ReactNode } from "react";
import { ChevronDown, Plus, Rss } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  /** Events without a scheduled date — the current data model has none. */
  undatedEvents: TeamEvent[];
  onNavigateMonth: (direction: 1 | -1) => void;
  onSelectDate: (date: Date) => void;
  onCreateEvent: (type?: EventType) => void;
  onOpenEvent: (event: TeamEvent) => void;
  className?: string;
}

/**
 * Floating calendar sidebar: agenda view, and the undated/feed sections.
 * Rendered inline on wide screens and inside the drawer on smaller ones.
 */
export function CalendarSidebar({
  month,
  now,
  events,
  undatedEvents,
  onNavigateMonth,
  onCreateEvent,
  onOpenEvent,
  className,
}: CalendarSidebarProps) {
  return (
    <div className={cn("flex h-full flex-col gap-5", className)}>
      <AgendaView
        month={month}
        events={events}
        now={now}
        onOpenEvent={onOpenEvent}
        onCreateEvent={() => onCreateEvent()}
        onNavigateMonth={onNavigateMonth}
        className="min-h-0 flex-1"
      />

      <OtherCalendarsSection />

      <UndatedSection
        undatedEvents={undatedEvents}
        onOpenEvent={onOpenEvent}
      />

      <CalendarFeedAction />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Collapsible section shell
 * ══════════════════════════════════════════════════════════════════════════ */

function CollapsibleSection({
  title,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={cn(
            "flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
            aria-hidden="true"
          />
          {title}
        </button>
        {actions}
      </div>
      {open && <div className="mt-2 flex flex-col gap-0.5">{children}</div>}
    </section>
  );
}



/* ══════════════════════════════════════════════════════════════════════════
 * Other calendars — external subscriptions (not yet supported)
 * ══════════════════════════════════════════════════════════════════════════ */

function OtherCalendarsSection() {
  const [open, setOpen] = useState(false);

  return (
    <CollapsibleSection
      title="Other calendars"
      defaultOpen={false}
      actions={
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            type="button"
            aria-label="Add another calendar"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-xs" }),
              "text-muted-foreground",
            )}
          >
            <Plus className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <PopoverHeader>
              <PopoverTitle>Add calendar</PopoverTitle>
              <PopoverDescription>
                Subscribing to external or shared calendars isn't available
                yet. Connected calendars will be listed here once supported.
              </PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
      }
    >
      <p className="px-1 py-1 text-xs text-muted-foreground">
        Click the + icon to add a calendar
      </p>
    </CollapsibleSection>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Undated events — the data model currently has none
 * ══════════════════════════════════════════════════════════════════════════ */

function UndatedSection({
  undatedEvents,
  onOpenEvent,
}: {
  undatedEvents: TeamEvent[];
  onOpenEvent: (event: TeamEvent) => void;
}) {
  return (
    <CollapsibleSection title="Undated" defaultOpen={false}>
      {undatedEvents.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">
          Events without a date will appear here.
        </p>
      ) : (
        undatedEvents.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onOpenEvent(event)}
            className="rounded-md px-1 py-1 text-left text-sm text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {event.title}
          </button>
        ))
      )}
    </CollapsibleSection>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Calendar feed — prepared for iCal subscription
 * ══════════════════════════════════════════════════════════════════════════ */

function CalendarFeedAction() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full justify-start gap-2",
        )}
      >
        <Rss className="size-4" />
        Calendar feed
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <PopoverHeader>
          <PopoverTitle>Calendar feed</PopoverTitle>
          <PopoverDescription>
            iCal subscription isn't available yet. Once enabled, your team
            schedule can be synced to any calendar app from here.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

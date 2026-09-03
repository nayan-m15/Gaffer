import { useCallback, useEffect, useMemo, useState } from "react";
import { isSameMonth, startOfWeek } from "date-fns";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { AgendaView } from "@/features/events/AgendaView";
import { CalendarSidebar } from "@/features/events/CalendarSidebar";
import { CalendarToolbar } from "@/features/events/CalendarToolbar";
import { EventDetailDialog } from "@/features/events/EventDetailDialog";
import { EventFormDialog } from "@/features/events/EventFormDialog";
import { MobileCalendarView } from "@/features/events/MobileCalendarView";
import { MonthCalendar } from "@/features/events/MonthCalendar";
import { WeekView } from "@/features/events/WeekView";
import {
  WEEK_STARTS_ON,
  filterEventTypes,
  formatMonthYear,
  formatWeekRangeLabel,
  getWeekDays,
  groupEventsByDay,
  moveCursor,
} from "@/features/events/calendar-utils";
import { useEvents, useNow } from "@/features/events/hooks";
import { useAuth } from "@/hooks/useAuth";
import type { EventType, TeamEvent } from "@/features/events/types";

type Panel =
  | { kind: "closed" }
  | { kind: "create"; date?: Date; type?: EventType }
  | { kind: "view"; eventId: string }
  | { kind: "edit"; eventId: string };

type CalendarView = "month" | "week" | "agenda";

/**
 * Events page — a Google-Calendar-style schedule for the signed-in coach's
 * team. Month view is the primary surface; week and agenda are alternates.
 * The sidebar (mini calendar, calendar filters) floats beside the calendar
 * on wide screens and opens as a drawer on smaller ones.
 */
export default function EventsPage() {
  const { team } = useAuth();
  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const now = useNow();

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [hiddenTypes, setHiddenTypes] = useState<Set<EventType>>(() => new Set());
  const [panel, setPanel] = useState<Panel>({ kind: "closed" });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ── Derived data ─────────────────────────────────────────────────────── */
  const visibleEvents = useMemo(
    () => filterEventTypes(events ?? [], hiddenTypes),
    [events, hiddenTypes],
  );
  const eventsByDay = useMemo(() => groupEventsByDay(visibleEvents), [visibleEvents]);
  const eventDays = useMemo(() => new Set(eventsByDay.keys()), [eventsByDay]);
  const weekDays = useMemo(() => getWeekDays(cursor), [cursor]);
  const label =
    view === "week" ? formatWeekRangeLabel(weekDays) : formatMonthYear(cursor);

  const selectedEvent =
    panel.kind === "view" || panel.kind === "edit"
      ? (events?.find((event) => event.id === panel.eventId) ?? null)
      : null;

  /* ── Navigation ───────────────────────────────────────────────────────── */
  const navigate = useCallback(
    (direction: 1 | -1) => {
      setCursor((current) => moveCursor(view, current, direction));
    },
    [view],
  );

  const goToToday = useCallback(() => {
    const today = new Date();
    setCursor(today);
    setSelectedDate(today);
  }, []);

  /** Selects a date and jumps the main calendar to its month/week. */
  const handleSelectDate = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      if (view === "week") {
        const currentWeek = startOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON });
        const targetWeek = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
        if (currentWeek.getTime() !== targetWeek.getTime()) {
          setCursor(date);
        }
      } else if (!isSameMonth(date, cursor)) {
        setCursor(date);
      }
    },
    [cursor, view],
  );

  /** Clicking the empty area of a day opens the create dialog for that date. */
  const handleCreateForDate = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      setPanel({ kind: "create", date });
    },
    [],
  );

  const handleOpenEvent = useCallback((event: TeamEvent) => {
    setPanel({ kind: "view", eventId: event.id });
  }, []);

  const handleToggleType = useCallback((type: EventType) => {
    setHiddenTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  /* ── Mobile drawer: close on Escape ───────────────────────────────────── */
  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  const renderSidebar = (closeDrawer: boolean, className?: string) => (
    <CalendarSidebar
      className={className}
      month={cursor}
      selectedDate={selectedDate}
      now={now}
      events={visibleEvents}
      eventDays={eventDays}
      hiddenTypes={hiddenTypes}
      teamName={team?.name}
      undatedEvents={events?.filter((event) => !event.scheduledAt) ?? []}
      onToggleType={handleToggleType}
      onNavigateMonth={(direction) => navigate(direction)}
      onSelectDate={(date) => {
        handleSelectDate(date);
        if (closeDrawer) {
          setSidebarOpen(false);
        }
      }}
      onCreateEvent={(type) => {
        setPanel({ kind: "create", type });
        if (closeDrawer) {
          setSidebarOpen(false);
        }
      }}
      onOpenEvent={(event) => {
        handleOpenEvent(event);
        if (closeDrawer) {
          setSidebarOpen(false);
        }
      }}
    />
  );

  /* ── Main views ────────────────────────────────────────────────────────── */
  const viewContent = (
    <>
      {view === "month" && (
        <MonthCalendar
          month={cursor}
          eventsByDay={eventsByDay}
          selectedDate={selectedDate}
          now={now}
          onSelectDate={handleSelectDate}
          onCreateEvent={handleCreateForDate}
          onOpenEvent={handleOpenEvent}
        />
      )}
      {view === "week" && (
        <WeekView
          weekOf={cursor}
          eventsByDay={eventsByDay}
          selectedDate={selectedDate}
          now={now}
          onCreateEvent={handleCreateForDate}
          onOpenEvent={handleOpenEvent}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          month={cursor}
          events={visibleEvents}
          now={now}
          onOpenEvent={handleOpenEvent}
          onCreateEvent={() => setPanel({ kind: "create" })}
        />
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Matches, training sessions, and meetings on one calendar."
      />

      <div className="flex flex-col gap-4 p-4 pb-10 sm:gap-5 sm:p-6 lg:p-8">
        {/* Loading / error states */}
        {isLoading && !events && (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            Loading events…
          </div>
        )}
        {isError && !events && (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load events."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        )}
        {isError && events && (
          <p role="status" className="text-sm text-destructive">
            Couldn't refresh events — showing your last saved schedule.
          </p>
        )}

        {/* Mobile View: Samsung & Apple phone inspired calendar */}
        {events && (
          <MobileCalendarView
            view={view}
            cursor={cursor}
            selectedDate={selectedDate}
            now={now}
            eventsByDay={eventsByDay}
            visibleEvents={visibleEvents}
            onViewChange={setView}
            onSelectDate={handleSelectDate}
            onNavigate={navigate}
            onToday={goToToday}
            onCreateEvent={(date) =>
              setPanel({ kind: "create", date: date ?? selectedDate })
            }
            onOpenEvent={handleOpenEvent}
            onToggleSidebar={() => setSidebarOpen(true)}
          />
        )}

        {/* Desktop & Tablet View: Google-Calendar style layout */}
        <div className="hidden sm:flex sm:flex-col sm:gap-5">
          <CalendarToolbar
            view={view}
            label={label}
            onViewChange={setView}
            onPrevious={() => navigate(-1)}
            onNext={() => navigate(1)}
            onToday={goToToday}
            onNewEvent={() => setPanel({ kind: "create" })}
            onToggleSidebar={() => setSidebarOpen(true)}
          />

          {/* Calendar + floating sidebar */}
          {events && (
            <div className="flex items-stretch gap-6">
              <div className="min-w-0 flex-1">{viewContent}</div>

              <aside className="hidden w-80 shrink-0 xl:flex xl:flex-col">
                {renderSidebar(
                  false,
                  "h-full rounded-xl border border-border bg-card p-4 shadow-sm",
                )}
              </aside>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar drawer for tablet/mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Calendars panel"
            className="absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col overflow-y-auto border-l border-border bg-card p-4 shadow-xl"
          >
            <div className="mb-2 flex justify-end">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close calendars panel"
              >
                <X className="size-4" />
              </Button>
            </div>
            {renderSidebar(true)}
          </aside>
        </div>
      )}

      <EventFormDialog
        open={panel.kind === "create" || panel.kind === "edit"}
        event={panel.kind === "edit" ? (selectedEvent ?? undefined) : undefined}
        initialDate={panel.kind === "create" ? panel.date : undefined}
        initialType={panel.kind === "create" ? panel.type : undefined}
        allowPastDate={panel.kind === "create" && panel.date !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPanel({ kind: "closed" });
          }
        }}
      />

      <EventDetailDialog
        open={panel.kind === "view"}
        event={selectedEvent}
        now={now}
        onOpenChange={(open) => {
          if (!open) {
            setPanel({ kind: "closed" });
          }
        }}
        onEdit={(event) => setPanel({ kind: "edit", eventId: event.id })}
      />
    </>
  );
}

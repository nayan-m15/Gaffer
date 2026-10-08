import { useCallback, useEffect, useMemo, useState } from "react";
import { isSameMonth, startOfWeek } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { AgendaView } from "@/features/events/AgendaView";
import { CalendarSidebar } from "@/features/events/CalendarSidebar";
import { CalendarToolbar } from "@/features/events/CalendarToolbar";
import { DayEventsDialog } from "@/features/events/DayEventsDialog";
import { EventDetailDialog } from "@/features/events/EventDetailDialog";
import { MobileCalendarView } from "@/features/events/MobileCalendarView";
import { MonthCalendar } from "@/features/events/MonthCalendar";
import { getCalendarCompetitionOptions, type MatchCompetitionFilter } from "@/features/events/match-competition-filter";
import { WeekView } from "@/features/events/WeekView";
import {
  WEEK_STARTS_ON,
  filterEventTypes,
  formatMonthYear,
  formatWeekRangeLabel,
  getDayEvents,
  getWeekDays,
  groupEventsByDay,
  moveCursor,
} from "@/features/events/calendar-utils";
import { useNow } from "@/features/events/hooks";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { fetchPlayerEvents, fetchPlayerStandings } from "@/services/player";
import type { EventType, TeamEvent } from "@/features/events/types";
import "@/features/events/events-background.css";

type Panel =
  | { kind: "closed" }
  | { kind: "view"; eventId: string }
  | { kind: "day"; date: Date };

type CalendarView = "month" | "week" | "agenda";

const playerEventsQueryKey = ["player", "events"] as const;

/**
 * Player events page — the same Google-Calendar-style surface as the
 * coach's EventsPage, in read-only form. No create/edit/cancel affordances
 * anywhere; clicking an event opens EventDetailDialog in its `readOnly`
 * branch, which shows the player's own RsvpWidget instead of the coach-only
 * RSVP breakdown / edit / cancel actions.
 */
export default function PlayerEventsPage() {
  const { claimedAthletes } = useAuth();
  const athleteId = claimedAthletes[0]?.id;
  const teamName = claimedAthletes[0]?.teamName;
  const now = useNow();

  const {
    data: events,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: playerEventsQueryKey,
    queryFn: () => fetchPlayerEvents(athleteId),
    enabled: Boolean(athleteId),
  });

  const { data: competitions = [] } = useQuery({
    queryKey: ["player", "standings", athleteId],
    queryFn: () => fetchPlayerStandings(athleteId),
    enabled: Boolean(athleteId),
  });

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [hiddenTypes, setHiddenTypes] = useState<Set<EventType>>(() => new Set());
  const [matchFilter, setMatchFilter] = useState<MatchCompetitionFilter>("all");
  const [panel, setPanel] = useState<Panel>({ kind: "closed" });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const competitionOptions = useMemo(
    () => getCalendarCompetitionOptions(events ?? [], competitions),
    [events, competitions],
  );
  const visibleEvents = useMemo(
    () => filterEventTypes(events ?? [], hiddenTypes, matchFilter, competitions),
    [events, hiddenTypes, matchFilter, competitions],
  );
  const eventsByDay = useMemo(() => groupEventsByDay(visibleEvents), [visibleEvents]);
  const eventDays = useMemo(() => new Set(eventsByDay.keys()), [eventsByDay]);
  const weekDays = useMemo(() => getWeekDays(cursor), [cursor]);
  const label =
    view === "week" ? formatWeekRangeLabel(weekDays) : formatMonthYear(cursor);

  const selectedEvent =
    panel.kind === "view"
      ? (events?.find((event) => event.id === panel.eventId) ?? null)
      : null;

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

  /**
   * Unlike the coach's handleDayClick, an empty day never opens a create
   * dialog here — there's no player-facing create flow. Days that already
   * have events still open DayEventsDialog, same as the coach view.
   */
  const handleDayClick = useCallback(
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

      const dayEvents = getDayEvents(eventsByDay, date);
      if (dayEvents.length > 0) {
        setPanel({ kind: "day", date });
      }
    },
    [cursor, eventsByDay, view],
  );

  const handleOpenEvent = useCallback((event: TeamEvent) => {
    setPanel({ kind: "view", eventId: event.id });
  }, []);

  const handleToggleType = useCallback((type: EventType) => {
    setHiddenTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
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
      teamName={teamName}
      readOnly
      onNavigateMonth={(direction) => navigate(direction)}
      onSelectDate={(date) => {
        handleDayClick(date);
        if (closeDrawer) setSidebarOpen(false);
      }}
      onCreateEvent={() => {}}
      onOpenEvent={(event) => {
        handleOpenEvent(event);
        if (closeDrawer) setSidebarOpen(false);
      }}
    />
  );

  const viewContent = (
    <>
      {view === "month" && (
        <MonthCalendar
          month={cursor}
          eventsByDay={eventsByDay}
          selectedDate={selectedDate}
          now={now}
          onSelectDate={handleDayClick}
          onCreateEvent={handleDayClick}
          readOnly
        />
      )}
      {view === "week" && (
        <WeekView
          weekOf={cursor}
          eventsByDay={eventsByDay}
          selectedDate={selectedDate}
          now={now}
          onCreateEvent={handleDayClick}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          month={cursor}
          events={visibleEvents}
          now={now}
          onOpenEvent={handleOpenEvent}
          onCreateEvent={() => {}}
          readOnly
        />
      )}
    </>
  );

  return (
    <div className="events-page relative isolate flex h-full min-h-0 flex-col overflow-hidden">
      <div className="events-page-backdrop" aria-hidden="true" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <PageHeader
          title="Events"
          mobileInline
          actions={
            <div className="flex items-center gap-1.5 sm:hidden">
              <div
                role="group"
                aria-label="Calendar view"
                className="flex items-center rounded-md border border-border bg-background p-0.5"
              >
                {(["month", "week", "agenda"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    aria-pressed={view === option}
                    className={cn(
                      "rounded-[min(var(--radius-md),10px)] px-1.5 py-1 text-[10px] font-medium capitalize transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      view === option
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          }
          className="shrink-0 pt-5 pb-4 pl-4 pr-4 lg:px-8 lg:pt-2 lg:pb-1"
        />

        <div className="mx-auto flex w-full max-w-[1800px] min-h-0 min-w-0 flex-1 flex-col gap-3 px-3 sm:gap-4 sm:px-5 lg:px-8">
        {isLoading && !events && (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            Loading events…
          </div>
        )}
        {isError && !events && (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-destructive">
              {error instanceof ApiError ? error.message : "Could not load events."}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}
        {isError && events && (
          <p role="status" className="text-sm text-destructive">
            Couldn't refresh events — showing your last saved schedule.
          </p>
        )}

        {events && (
          <MobileCalendarView
            view={view}
            cursor={cursor}
            selectedDate={selectedDate}
            now={now}
            eventsByDay={eventsByDay}
            visibleEvents={visibleEvents}
            hiddenTypes={hiddenTypes}
            readOnly
            onToggleType={handleToggleType}
            matchFilter={matchFilter}
            competitionOptions={competitionOptions}
            onMatchFilterChange={setMatchFilter}
            onSelectDate={handleDayClick}
            onNavigate={navigate}
            onToday={goToToday}
            onCreateEvent={() => {}}
            onOpenEvent={handleOpenEvent}
            onToggleSidebar={() => setSidebarOpen(true)}
          />
        )}

        <div className="hidden min-h-0 min-w-0 sm:flex sm:flex-1 sm:flex-col sm:gap-3">
          <CalendarToolbar
            view={view}
            label={label}
            hiddenTypes={hiddenTypes}
            readOnly
            onToggleType={handleToggleType}
            matchFilter={matchFilter}
            competitionOptions={competitionOptions}
            onMatchFilterChange={setMatchFilter}
            onViewChange={setView}
            onPrevious={() => navigate(-1)}
            onNext={() => navigate(1)}
            onToday={goToToday}
            onNewEvent={() => {}}
            onToggleSidebar={() => setSidebarOpen(true)}
          />

          {events && (
            <div className="flex min-h-0 min-w-0 flex-1 items-stretch gap-6">
              <div className="min-h-0 min-w-0 flex-1">{viewContent}</div>
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
            className="absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col overflow-hidden border-l border-border bg-card p-4 shadow-xl"
          >
            <div className="mb-2 flex justify-end shrink-0">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close calendars panel"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1">{renderSidebar(true, "h-full")}</div>
          </aside>
        </div>
      )}

      <DayEventsDialog
        open={panel.kind === "day"}
        date={panel.kind === "day" ? panel.date : null}
        events={panel.kind === "day" ? getDayEvents(eventsByDay, panel.date) : []}
        now={now}
        readOnly
        onOpenChange={(open) => {
          if (!open) setPanel({ kind: "closed" });
        }}
        onSelectEvent={handleOpenEvent}
        onAddEvent={() => {}}
      />

      <EventDetailDialog
        open={panel.kind === "view"}
        event={selectedEvent}
        now={now}
        readOnly
        rsvpQueryKey={playerEventsQueryKey}
        onOpenChange={(open) => {
          if (!open) setPanel({ kind: "closed" });
        }}
        onEdit={() => {}}
      />
      </div>
    </div>
  );
}

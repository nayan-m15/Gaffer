import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, FileText, Lock, MapPin, Radio, Search, Trophy, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMyCompetitions } from "@/features/competitions/hooks";
import type { CompetitionSummary } from "@/features/competitions/types";
import { formatDateLabel, formatEventDateTime, formatLocalDate } from "@/features/events/event-utils";
import { useEvents } from "@/features/events/hooks";
import type { EventStatus, TeamEvent } from "@/features/events/types";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import "./LiveLoggerPage.css";

type MatchStatusFilter = EventStatus | "all";
const PAGE_SIZE = 4;
const STATUS_FILTER_OPTIONS: { value: MatchStatusFilter; label: string }[] = [
  { value: "all", label: "All matches" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function isFutureCalendarDate(scheduledAt: string, now = new Date()) {
  const scheduled = new Date(scheduledAt);
  if (Number.isNaN(scheduled.getTime())) return false;
  return formatLocalDate(now) < formatLocalDate(scheduled);
}

/** Presentation and local filtering only; existing match routes stay authoritative. */
export default function LiveLoggerPage() {
  const { data: events, isLoading, isError, error, refetch } = useEvents();
  const { data: competitions } = useMyCompetitions();
  const { team } = useAuth();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>("scheduled");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const competitionById = useMemo(() => new Map((competitions ?? []).map((item) => [item.id, item])), [competitions]);
  const allMatches = useMemo(() => (events ?? []).filter((event) => event.type === "match"), [events]);
  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return allMatches.filter((event) => {
      if (statusFilter !== "all" && event.status !== statusFilter) return false;
      const competition = event.competitionId ? competitionById.get(event.competitionId) : undefined;
      return !query || [event.title, event.location, event.venueName, event.fixtureOpponentName,
        event.friendlyOpponentTeamName, competition?.name, team?.name]
        .some((value) => value?.toLocaleLowerCase().includes(query));
    });
  }, [allMatches, statusFilter, search, competitionById, team?.name]);
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const visibleMatches = matches.slice(offset, offset + PAGE_SIZE);
  const resetFilters = () => { setSearch(""); setStatusFilter("all"); setPage(1); };

  return (
    <div className="live-logger-page relative isolate min-h-full">
      <div className="live-logger-page-backdrop" aria-hidden="true" />
      <div className="live-logger-content relative z-10">
        <PageHeader className="live-logger-header" title="Live Logger"
          subtitle="Select a match to confirm the squad and start logging." />
        <div className="live-logger-body">
          <div className="live-logger-toolbar" role="search" aria-label="Find a match">
            <Select items={STATUS_FILTER_OPTIONS} value={statusFilter} onValueChange={(value) => {
              if (value) { setStatusFilter(value as MatchStatusFilter); setPage(1); }
            }}>
              <SelectTrigger aria-label="Filter matches by status" className="live-logger-filter">
                <CalendarDays className="size-4" aria-hidden="true" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {STATUS_FILTER_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="live-logger-search">
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <input type="search" aria-label="Search matches" placeholder="Search for a match, team or competition…"
                value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
              {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); setPage(1); }}><X className="size-4" aria-hidden="true" /></button>}
            </div>
            <Button aria-label="Match calendar" className="live-logger-calendar" onClick={() => navigate("/events")}>
              <CalendarDays className="size-4" aria-hidden="true" /><span>Match calendar</span>
            </Button>
          </div>
          {isLoading && <div className="live-logger-loading" role="status" aria-label="Loading matches">
            <span className="sr-only">Loading matches…</span>
            {[0, 1, 2, 3].map((key) => <div key={key} className="live-logger-skeleton" aria-hidden="true"><div /><div><span /><span /></div></div>)}
          </div>}
          {isError && <div className="live-logger-state" role="alert">
            <Radio className="size-8 text-destructive" aria-hidden="true" />
            <h2>Matches could not be loaded</h2>
            <p>{error instanceof Error ? error.message : "Could not load events."}</p>
            <Button variant="outline" onClick={() => void refetch()}>Try again</Button>
          </div>}
          {!isLoading && !isError && matches.length === 0 && <div className="live-logger-state">
            <Radio className="size-8 text-primary" aria-hidden="true" />
            <h2>{allMatches.length === 0 ? "No matches yet" : "No matches found"}</h2>
            <p>{allMatches.length === 0 ? "Create a match event from the Events page to start logging." : "Try another search or status filter."}</p>
            <Button variant="outline" onClick={allMatches.length === 0 ? () => navigate("/events") : resetFilters}>
              {allMatches.length === 0 ? "Go to Events" : "Reset filters"}
            </Button>
          </div>}
          {!isLoading && !isError && matches.length > 0 && <>
            <ul className="live-logger-matches" aria-label="Matches">
              {visibleMatches.map((event) => <li key={event.id}>
                <MatchRow event={event} teamName={team?.name}
                  competition={event.competitionId ? competitionById.get(event.competitionId) : undefined}
                  onSelect={() => navigate(event.status === "completed" && event.matchId
                    ? "/matches/" + event.matchId + "/report" : "/events/" + event.id + "/confirm-squad")} />
              </li>)}
            </ul>
            <div className="live-logger-list-footer">
              <p role="status">Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, matches.length)} of {matches.length} {matches.length === 1 ? "match" : "matches"}</p>
              {pageCount > 1 && <nav className="live-logger-pagination" aria-label="Match pages">
                <button type="button" aria-label="Previous match page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="size-4" aria-hidden="true" /></button>
                <span>Page {currentPage} of {pageCount}</span>
                <button type="button" aria-label="Next match page" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight className="size-4" aria-hidden="true" /></button>
              </nav>}
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

function MatchRow({ event, competition, teamName, onSelect }: {
  event: TeamEvent; competition?: CompetitionSummary; teamName?: string; onSelect: () => void;
}) {
  const cancelled = event.status === "cancelled";
  const completed = event.status === "completed";
  const reportable = completed && Boolean(event.matchId);
  const locked = !cancelled && !completed && isFutureCalendarDate(event.scheduledAt);
  const clickable = reportable || (!cancelled && !completed && !locked);
  const date = new Date(event.scheduledAt);
  const validDate = !Number.isNaN(date.getTime());
  const unlockLabel = validDate ? formatDateLabel(date) : event.scheduledAt;
  const titleTeams = event.title.split(/\s+v(?:s\.?)?\s+/i);
  const opponent = event.fixtureOpponentName || event.friendlyOpponentTeamName;
  const sides = titleTeams.length === 2 ? titleTeams : opponent && teamName
    ? event.fixtureIsHome === false ? [opponent, teamName] : [teamName, opponent] : [];
  const category = competition?.name ?? (event.competitionId ? "Competition" : event.friendlyFixtureId ? "Friendly" : "Match");
  const body = <>
    <time className="live-logger-date" dateTime={validDate ? event.scheduledAt : undefined} title={formatEventDateTime(event.scheduledAt)}>
      <span>{validDate ? date.toLocaleDateString(undefined, { month: "short" }) : "TBC"}</span>
      <strong>{validDate ? String(date.getDate()).padStart(2, "0") : "—"}</strong>
      <span>{validDate ? date.toLocaleDateString(undefined, { weekday: "short" }) : "Date"}</span>
      <small>{validDate ? date.getFullYear() : ""}</small>
    </time>
    <div className="live-logger-match-content">
      <div className="live-logger-match-heading">
        <div className="live-logger-match-title">
          <span className={cn("live-logger-competition", competition?.type === "cup" && "live-logger-competition--cup")}>
            <Trophy className="size-3" aria-hidden="true" />{category}
          </span>
          <h2>{event.title}</h2>
        </div>
        <span className={cn("live-logger-status", "live-logger-status--" + event.status)}>{event.status}</span>
      </div>
      <div className="live-logger-match-details">
        {sides.length === 2 && <div className="live-logger-teams">
          <TeamLabel name={sides[0]} own={sides[0] === teamName} />
          <span className="live-logger-vs">vs</span>
          <TeamLabel name={sides[1]} own={sides[1] === teamName} />
        </div>}
        <div className="live-logger-metadata">
          <span><Clock3 aria-hidden="true" />{validDate ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "Time to be confirmed"}</span>
          <span><MapPin aria-hidden="true" />{event.venueName || event.location || "Venue to be confirmed"}</span>
          {!completed && !cancelled && <span><Users aria-hidden="true" />{event.lineupConfirmedAt ? "Squad confirmed" : "Squad to be confirmed"}</span>}
        </div>
      </div>
      <div className="live-logger-match-action">
        {locked ? <><Lock aria-hidden="true" />Unlocks {unlockLabel}</>
          : reportable ? <><FileText aria-hidden="true" />View Match Report</>
          : completed ? <><Check aria-hidden="true" />Match completed</>
          : cancelled ? "Match cancelled" : <><Radio aria-hidden="true" />Confirm squad & log</>}
      </div>
    </div>
    <span className="live-logger-row-arrow" aria-hidden="true">{clickable ? <ChevronRight /> : locked ? <Lock /> : <ChevronRight />}</span>
  </>;
  const className = cn("live-logger-match", clickable && "live-logger-match--interactive", locked && "live-logger-match--locked", cancelled && "live-logger-match--cancelled");
  return clickable ? <button type="button" onClick={onSelect} className={className}>{body}</button>
    : <div className={className}>{body}</div>;
}

function TeamLabel({ name, own }: { name: string; own: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return <span className="live-logger-team"><span className={cn("live-logger-team-mark", own && "live-logger-team-mark--own")} aria-hidden="true">{initials}</span><span>{name}</span></span>;
}

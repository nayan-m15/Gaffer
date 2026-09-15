import { type ReactNode, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getPendingTeamInviteToken } from "@/services/team-invites";
import { AddTeamModal } from "@/components/AddTeamModal";
import { EventRemindersBanner } from "@/features/reminders/EventRemindersBanner";
import { EventWeatherCard } from "@/features/events/EventWeatherCard";
import { EventDetailDialog } from "@/features/events/EventDetailDialog";
import { useEvent, useNow } from "@/features/events/hooks";
import {
  Activity,
  AlertCircle,
  Calendar,
  CalendarCheck,
  Mail,
  Plus,
  RefreshCw,
  TrendingUp,
  Trophy,
  BarChart3,
  Users,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
 *  TYPES — contracts the dashboard expects from the backend.
 *
 *  Sprint 1 fields (activeAthletesCount, totalEventsCount, upcomingEvents)
 *  are served by GET /dashboard.  Sprint 2+ fields (liveMatch,
 *  seasonSummary, recentForm, recentStats) are optional and will be
 *  populated as those backend features are implemented.
 * ═══════════════════════════════════════════════════════════════════════════ */

interface LiveMatchData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  elapsedMinutes: number;
}

interface SeasonSummaryData {
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

interface RecentResult {
  id: string;
  opponent: string;
  isHome: boolean;
  result: "W" | "D" | "L";
  score: string;
  date: string;
}

/** Sprint 1 upcoming event — matches the backend events table schema. */
interface UpcomingEvent {
  id: string;
  title: string;
  type: "match" | "training" | "meeting";
  scheduledAt: string;
  location: string;
  venueAddress: string | null;
  weatherLocation: string | null;
  weatherLatitude: number | null;
  weatherLongitude: number | null;
  weatherTimezone: string | null;
}

interface MatchStat {
  label: string;
  value: number;
}

interface DashboardData {
  /* Sprint 1 — served by GET /dashboard */
  activeAthletesCount: number;
  totalEventsCount: number;
  upcomingEvents: UpcomingEvent[];
  /* Sprint 2+ — optional until those backend features ship */
  liveMatch?: LiveMatchData | null;
  seasonSummary?: SeasonSummaryData | null;
  recentForm?: RecentResult[];
  recentStats?: MatchStat[];
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  DATA FETCHING
 * ═══════════════════════════════════════════════════════════════════════════ */

async function fetchDashboardData(): Promise<DashboardData> {
  try {
    return await apiFetch<DashboardData>("/dashboard");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // Endpoint not yet reachable — render empty state gracefully.
      return {
        activeAthletesCount: 0,
        totalEventsCount: 0,
        upcomingEvents: [],
      };
    }
    throw error;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  DATE / TIME FORMATTING HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

function formatEventWhen(iso: string, timeZone: string | null): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SHARED UI PRIMITIVES
 * ═══════════════════════════════════════════════════════════════════════════ */

function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "dashboard-glass-card rounded-xl border border-border p-5",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-full">{children}</div>
  );
}

function SectionTitle({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {icon}
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {children}
      </h2>
    </div>
  );
}

function EmptyState({
  message,
  icon,
}: {
  message: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      {icon && (
        <div className="mb-2 opacity-40">{icon}</div>
      )}
      <p className="text-sm">{message}</p>
    </div>
  );
}

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <div className="animate-pulse space-y-3" role="status" aria-label="Loading">
        <div className="h-3 w-1/3 rounded-sm bg-muted" />
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-3 w-full rounded-sm bg-muted" />
        ))}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  DASHBOARD HEADER
 * ═══════════════════════════════════════════════════════════════════════════ */

function DashboardHeader({
  userName,
  teamName,
  isLive,
  hasTeam,
  pendingInvite,
  onAddTeam,
}: {
  userName: string | null;
  teamName: string | null;
  isLive?: boolean;
  hasTeam: boolean;
  /** A team invitation is still awaiting acceptance — hide Add Team so the
   * user doesn't accidentally bootstrap their own coach team mid-invite. */
  pendingInvite: boolean;
  onAddTeam: () => void;
}) {
  return (
    <PageHeader
      title="Dashboard"
      subtitle={
        <>
          {userName ? `Welcome back, ${userName}` : "Welcome back"}
          {teamName ? ` \u00b7 ${teamName}` : ""}
        </>
      }
      actions={
        <>
          {!hasTeam && !pendingInvite && (
            <Button variant="outline" size="sm" onClick={onAddTeam}>
              <Plus className="size-4" aria-hidden="true" />
              Add Team
            </Button>
          )}

          {isLive !== undefined && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  isLive ? "bg-primary" : "bg-muted-foreground/40",
                )}
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-muted-foreground">
                Sideline Mode {isLive ? "Active" : "Inactive"}
              </span>
            </div>
          )}
        </>
      }
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  STAT CARDS — Active Athletes & Total Events  (Sprint 1)
 * ═══════════════════════════════════════════════════════════════════════════ */

function StatCard({
  label,
  value,
  icon,
  ariaLabel,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  ariaLabel: string;
}) {
  return (
    <Card aria-label={ariaLabel}>
      <div className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <p className="text-3xl font-bold tabular-nums text-foreground">
            {value}
          </p>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  LIVE MATCH CARD  (Sprint 2 — deferred)
 * ═══════════════════════════════════════════════════════════════════════════ */

function LiveMatchCard({
  match,
  onOpenLogger,
}: {
  match: LiveMatchData | null;
  onOpenLogger: () => void;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-colors",
        match && "border-primary/30",
      )}
      aria-label="Live match"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left — badge and status */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              match
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {match ? (
              <>
                <span
                  className="size-1.5 animate-pulse rounded-full bg-current"
                  aria-hidden="true"
                />
                Live Match Logger
              </>
            ) : (
              "No Active Match"
            )}
          </span>
          {match && (
            <span className="text-xs text-muted-foreground">
              {match.elapsedMinutes}&apos;
            </span>
          )}
        </div>

        {/* Centre — score */}
        {match ? (
          <div className="flex items-center justify-center gap-4 sm:gap-6">
            <span className="text-lg font-bold text-foreground sm:text-xl">
              {match.homeTeam}
            </span>
            <span className="font-mono text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
              {match.homeScore}&thinsp;\u2013&thinsp;{match.awayScore}
            </span>
            <span className="text-lg font-bold text-foreground sm:text-xl">
              {match.awayTeam}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground sm:mx-auto">
            No match currently in progress
          </p>
        )}

        {/* Right — action */}
        <Button
          variant={match ? "default" : "outline"}
          size="sm"
          onClick={onOpenLogger}
        >
          <Activity className="size-4" aria-hidden="true" />
          {match ? "Open Live Logger" : "Live Logger"}
        </Button>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SEASON SUMMARY  (Sprint 2 — deferred)
 * ═══════════════════════════════════════════════════════════════════════════ */

function SummaryStat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | null;
  variant?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <span
        className={cn(
          "text-2xl font-bold tabular-nums sm:text-3xl",
          variant === "positive"
            ? "text-primary"
            : variant === "negative"
              ? "text-destructive"
              : "text-foreground",
        )}
      >
        {value ?? "\u2014"}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function SeasonSummaryCard({
  summary,
}: {
  summary: SeasonSummaryData | null;
}) {
  return (
    <Card aria-label="Season summary">
      <SectionTitle icon={<Trophy className="size-4 text-muted-foreground" />}>
        Season Summary
      </SectionTitle>
      {summary ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <SummaryStat label="Played" value={summary.played} />
          <SummaryStat label="Won" value={summary.won} variant="positive" />
          <SummaryStat label="Drawn" value={summary.drawn} />
          <SummaryStat label="Lost" value={summary.lost} variant="negative" />
          <SummaryStat label="GF" value={summary.goalsFor} />
          <SummaryStat label="GA" value={summary.goalsAgainst} />
        </div>
      ) : (
        <EmptyState
          message="No season data available"
          icon={<Trophy className="size-6" />}
        />
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  RECENT FORM  (Sprint 2 — deferred)
 * ═══════════════════════════════════════════════════════════════════════════ */

function ResultBadge({
  result,
  selected,
  onSelect,
}: {
  result: "W" | "D" | "L";
  selected: boolean;
  onSelect: () => void;
}) {
  const config = {
    W: { bg: "bg-primary", label: "Win" },
    D: { bg: "bg-muted", label: "Draw" },
    L: { bg: "bg-destructive", label: "Loss" },
  } as const;
  const { bg, label } = config[result];

  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full text-xs font-bold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        bg,
        result === "D" ? "text-foreground" : "text-primary-foreground",
        selected
          ? "scale-110 ring-2 ring-foreground/70 ring-offset-2 ring-offset-card"
          : "hover:scale-105",
      )}
      title={label}
      aria-label={`Show ${label.toLowerCase()} match details`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {result}
    </button>
  );
}

function formatRecentMatchDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function RecentFormCard({
  results,
  teamName,
}: {
  results: RecentResult[];
  teamName: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    results[0]?.id ?? null,
  );
  const recentResults = results.slice(0, 5);
  const selected =
    recentResults.find((result) => result.id === selectedId) ?? recentResults[0];

  return (
    <Card aria-label="Recent form">
      <SectionTitle
        icon={<TrendingUp className="size-4 text-muted-foreground" />}
      >
        Recent Form
      </SectionTitle>
      {results.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2" aria-label="Recent results">
            {recentResults.map((result) => (
              <ResultBadge
                key={result.id}
                result={result.result}
                selected={result.id === selected?.id}
                onSelect={() => setSelectedId(result.id)}
              />
            ))}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium text-foreground">
              {selected.isHome
                ? `${teamName} vs ${selected.opponent}`
                : `${selected.opponent} vs ${teamName}`}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {selected.score}
              </span>
              <span>{formatRecentMatchDate(selected.date)}</span>
            </p>
          </div>
        </div>
      ) : (
        <EmptyState
          message="No recent match results"
          icon={<TrendingUp className="size-6" />}
        />
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  UPCOMING EVENTS  (Sprint 1 — connected to real backend)
 * ═══════════════════════════════════════════════════════════════════════════ */

function EventItem({ event, onOpen }: { event: UpcomingEvent; onOpen: () => void }) {
  const destination = [event.location, event.venueAddress]
    .filter(Boolean)
    .join(", ");

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="cursor-pointer border-b border-border py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary last:border-b-0 last:pb-0"
    >
      <div className="min-w-0 px-1">
        <p className="truncate text-sm text-foreground">
          <span className="font-semibold">{event.title}</span>
          <span className="text-muted-foreground"> · {formatEventWhen(event.scheduledAt, event.weatherTimezone)}</span>
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>{event.location}</span>
          <span aria-hidden="true">·</span>
          <a
            className="font-medium text-primary hover:underline"
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`}
            target="_blank"
            rel="noreferrer"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
          >
            Directions
          </a>
        </div>
        <div className="mt-1.5">
          <EventWeatherCard event={event} compact />
        </div>
      </div>
    </li>
  );
}

function UpcomingEventsCard({
  events: upcomingEvents,
  onOpenEvent,
}: {
  events: UpcomingEvent[];
  onOpenEvent: (eventId: string) => void;
}) {
  return (
    <Card aria-label="Upcoming events" className="min-h-[11rem]">
      <SectionTitle
        icon={<Calendar className="size-4 text-muted-foreground" />}
      >
        Upcoming Events
      </SectionTitle>
      {upcomingEvents.length > 0 ? (
        <ul className="-my-1">
          {upcomingEvents.map((event) => (
            <EventItem key={event.id} event={event} onOpen={() => onOpenEvent(event.id)} />
          ))}
        </ul>
      ) : (
        <EmptyState
          message="No upcoming events scheduled"
          icon={<Calendar className="size-6" />}
        />
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  RECENT STATS PER MATCH  (Sprint 2 — deferred)
 * ═══════════════════════════════════════════════════════════════════════════ */

function RecentStatsCard({ stats }: { stats: MatchStat[] }) {
  return (
    <Card aria-label="Recent match statistics">
      <SectionTitle
        icon={<BarChart3 className="size-4 text-muted-foreground" />}
      >
        Recent Stats Per Match
      </SectionTitle>
      {stats.length > 0 ? (
        <div className="space-y-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">
                {stat.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(stat.value, 100)}%`,
                  }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          message="No match statistics available"
          icon={<BarChart3 className="size-6" />}
        />
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function DashboardPage() {
  const { user, team, accountKind } = useAuth();
  const navigate = useNavigate();
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [inviteNoticeDismissed, setInviteNoticeDismissed] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const selectedEventQuery = useEvent(selectedEventId);
  const now = useNow();

  // Read per render instead of snapshotting on mount so the invite resumer's
  // post-accept cleanup is reflected without a remount. localStorage reads
  // are synchronous and cheap, and dismissing is tracked separately so it
  // never destroys the stored invitation context.
  const pendingInviteToken = inviteNoticeDismissed
    ? null
    : getPendingTeamInviteToken();
  const hasPendingInvite = !team && pendingInviteToken !== null;
  const pendingInviteUrl = pendingInviteToken
    ? `/join-team/${pendingInviteToken}`
    : null;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  }: UseQueryResult<DashboardData> = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardData,
    staleTime: 30_000,
  });

  // Route player accounts to their own dashboard.
  if (accountKind === "player") {
    return <Navigate to="/player/dashboard" replace />;
  }

  /* ── Error state ──────────────────────────────────────────────────────── */
  if (isError) {
    return (
      <DashboardFrame>
        <DashboardHeader
          userName={user?.name ?? null}
          teamName={team?.name ?? null}
          hasTeam={!!team}
          pendingInvite={hasPendingInvite}
          onAddTeam={() => setAddTeamOpen(true)}
        />
        <div className="flex flex-col items-center justify-center gap-4 p-16">
          <AlertCircle className="size-10 text-destructive" aria-hidden="true" />
          <div className="text-center">
            <p className="font-medium text-foreground">
              Failed to load dashboard data
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "An unexpected error occurred"}
            </p>
          </div>
          <Button variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      </DashboardFrame>
    );
  }

  /* ── Loading state ────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <DashboardFrame>
        <DashboardHeader
          userName={user?.name ?? null}
          teamName={team?.name ?? null}
          hasTeam={!!team}
          pendingInvite={hasPendingInvite}
          onAddTeam={() => setAddTeamOpen(true)}
        />
        <div className="space-y-6 p-6 sm:p-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <CardSkeleton lines={1} />
            <CardSkeleton lines={1} />
          </div>
          <CardSkeleton lines={2} />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <CardSkeleton lines={3} />
            </div>
            <div className="lg:col-span-2">
              <CardSkeleton lines={3} />
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <CardSkeleton lines={4} />
            <CardSkeleton lines={4} />
          </div>
        </div>
      </DashboardFrame>
    );
  }

  /* ── Loaded state ─────────────────────────────────────────────────────── */
  const {
    activeAthletesCount,
    totalEventsCount,
    upcomingEvents,
    liveMatch,
    seasonSummary,
    recentForm,
    recentStats,
  } = data ?? {
    activeAthletesCount: 0,
    totalEventsCount: 0,
    upcomingEvents: [],
  };

  return (
    <DashboardFrame>
      <DashboardHeader
        userName={user?.name ?? null}
        teamName={team?.name ?? null}
        isLive={liveMatch != null}
        hasTeam={!!team}
        pendingInvite={hasPendingInvite}
        onAddTeam={() => setAddTeamOpen(true)}
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* ── Pending team invitation ─────────────────────────────────── */}
        {hasPendingInvite && pendingInviteUrl && (
          <Card aria-label="Pending team invitation" className="border-primary/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Mail className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    You have a pending team invitation
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    Open your invite to join your coach&apos;s team as an
                    assistant. Creating your own team is paused while the
                    invitation is pending.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  to={pendingInviteUrl}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  Open your invite
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInviteNoticeDismissed(true)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </Card>
        )}

        <EventRemindersBanner events={upcomingEvents} />

        {/* ── Sprint 2: Live Match (deferred — shows empty state) ─────────── */}
        <LiveMatchCard
          match={liveMatch ?? null}
          onOpenLogger={() => navigate("/events")}
        />

        {/* ── Sprint 1: Stat Cards ────────────────────────────────────────── */}
        <div className="grid gap-6 sm:grid-cols-2">
          <StatCard
            label="Active Athletes"
            value={activeAthletesCount}
            icon={<Users className="size-6" aria-hidden="true" />}
            ariaLabel="Active athletes count"
          />
          <StatCard
            label="Total Events"
            value={totalEventsCount}
            icon={<CalendarCheck className="size-6" aria-hidden="true" />}
            ariaLabel="Total events count"
          />
        </div>

        {/* ── Sprint 1: Upcoming Events + Sprint 2: Recent Form (deferred) ── */}
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <UpcomingEventsCard events={upcomingEvents} onOpenEvent={setSelectedEventId} />
          </div>
          <div className="lg:col-span-2">
            <RecentFormCard
              results={recentForm ?? []}
              teamName={team?.name ?? "Our Team"}
            />
          </div>
        </div>

        {/* ── Sprint 2: Season Summary + Recent Stats (deferred) ──────────── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SeasonSummaryCard summary={seasonSummary ?? null} />
          <RecentStatsCard stats={recentStats ?? []} />
        </div>
      </div>
      <EventDetailDialog
        open={Boolean(selectedEventId)}
        event={selectedEventQuery.data ?? null}
        now={now}
        canManage={team?.role === "coach"}
        onOpenChange={(open) => {
          if (!open) setSelectedEventId(undefined);
        }}
        onEdit={() => navigate("/events")}
      />
      <AddTeamModal open={addTeamOpen} onOpenChange={setAddTeamOpen} />
    </DashboardFrame>
  );
}

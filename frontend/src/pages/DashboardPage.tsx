import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  Calendar,
  MapPin,
  RefreshCw,
  TrendingUp,
  Trophy,
  BarChart3,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
 *  TYPES — contracts the dashboard expects from the backend.
 *  These will be moved to @/types once the backend endpoints are implemented.
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
  result: "W" | "D" | "L";
  score: string;
  date: string;
}

interface UpcomingFixture {
  id: string;
  opponent: string;
  homeAway: "Home" | "Away";
  venue: string;
  date: string;
  time: string;
}

interface MatchStat {
  label: string;
  value: number;
}

interface DashboardData {
  liveMatch: LiveMatchData | null;
  seasonSummary: SeasonSummaryData | null;
  recentForm: RecentResult[];
  upcomingFixtures: UpcomingFixture[];
  recentStats: MatchStat[];
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  DATA FETCHING
 * ═══════════════════════════════════════════════════════════════════════════ */

async function fetchDashboardData(): Promise<DashboardData> {
  try {
    return await apiFetch<DashboardData>("/dashboard");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // Endpoint not yet implemented — return empty state gracefully.
      return {
        liveMatch: null,
        seasonSummary: null,
        recentForm: [],
        upcomingFixtures: [],
        recentStats: [],
      };
    }
    throw error;
  }
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
        "rounded-xl border border-border bg-card p-5",
        className,
      )}
      {...props}
    >
      {children}
    </section>
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
}: {
  userName: string | null;
  teamName: string | null;
  isLive?: boolean;
}) {
  return (
    <header className="border-b border-border px-6 py-6 sm:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-widest text-foreground sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {userName
              ? `Welcome back, ${userName}`
              : "Welcome back"}
            {teamName ? ` · ${teamName}` : ""}
          </p>
        </div>
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
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  LIVE MATCH CARD
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
              {match.homeScore}&thinsp;–&thinsp;{match.awayScore}
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
 *  SEASON SUMMARY
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
        {value ?? "—"}
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
 *  RECENT FORM
 * ═══════════════════════════════════════════════════════════════════════════ */

function ResultBadge({ result }: { result: "W" | "D" | "L" }) {
  const config = {
    W: { bg: "bg-primary", label: "Win" },
    D: { bg: "bg-muted", label: "Draw" },
    L: { bg: "bg-destructive", label: "Loss" },
  } as const;
  const { bg, label } = config[result];

  return (
    <span
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full text-xs font-bold",
        bg,
        result === "D" ? "text-foreground" : "text-primary-foreground",
      )}
      title={label}
      aria-label={`${label} result`}
    >
      {result}
    </span>
  );
}

function RecentFormCard({ results }: { results: RecentResult[] }) {
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
            {results.slice(0, 5).map((r) => (
              <ResultBadge key={r.id} result={r.result} />
            ))}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium text-foreground">
              vs {results[0].opponent}
            </p>
            <p className="text-xs text-muted-foreground">
              {results[0].score} · {results[0].date}
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
 *  UPCOMING FIXTURES
 * ═══════════════════════════════════════════════════════════════════════════ */

function FixtureItem({ fixture }: { fixture: UpcomingFixture }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {fixture.opponent}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="size-3" aria-hidden="true" />
            {fixture.homeAway} · {fixture.venue}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">{fixture.date}</p>
        <p className="text-xs text-muted-foreground">{fixture.time}</p>
      </div>
    </li>
  );
}

function UpcomingFixturesCard({
  fixtures,
}: {
  fixtures: UpcomingFixture[];
}) {
  return (
    <Card aria-label="Upcoming fixtures">
      <SectionTitle
        icon={<Calendar className="size-4 text-muted-foreground" />}
      >
        Upcoming Fixtures
      </SectionTitle>
      {fixtures.length > 0 ? (
        <ul className="-my-1">
          {fixtures.map((f) => (
            <FixtureItem key={f.id} fixture={f} />
          ))}
        </ul>
      ) : (
        <EmptyState
          message="No upcoming fixtures scheduled"
          icon={<Calendar className="size-6" />}
        />
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  RECENT STATS PER MATCH
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
  const { user, team } = useAuth();
  const navigate = useNavigate();

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

  /* ── Error state ──────────────────────────────────────────────────────── */
  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <main className="w-full overflow-x-hidden">
          <DashboardHeader
            userName={user?.name ?? null}
            teamName={team?.name ?? null}
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
        </main>
      </div>
    );
  }

  /* ── Loading state ────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="w-full overflow-x-hidden">
          <DashboardHeader
            userName={user?.name ?? null}
            teamName={team?.name ?? null}
          />
          <div className="space-y-6 p-6 sm:p-8">
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
        </main>
      </div>
    );
  }

  /* ── Loaded state ─────────────────────────────────────────────────────── */
  const {
    liveMatch,
    seasonSummary,
    recentForm,
    upcomingFixtures,
    recentStats,
  } = data ?? {
    liveMatch: null,
    seasonSummary: null,
    recentForm: [],
    upcomingFixtures: [],
    recentStats: [],
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full overflow-x-hidden">
        <DashboardHeader
          userName={user?.name ?? null}
          teamName={team?.name ?? null}
          isLive={liveMatch !== null}
        />

        <div className="space-y-6 p-6 sm:p-8">
          {/* ── Live Match ─────────────────────────────────────────────────── */}
          <LiveMatchCard
            match={liveMatch}
            onOpenLogger={() => navigate("/events")}
          />

          {/* ── Season Summary + Recent Form ───────────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <SeasonSummaryCard summary={seasonSummary} />
            </div>
            <div className="lg:col-span-2">
              <RecentFormCard results={recentForm} />
            </div>
          </div>

          {/* ── Upcoming Fixtures + Recent Stats ──────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <UpcomingFixturesCard fixtures={upcomingFixtures} />
            <RecentStatsCard stats={recentStats} />
          </div>
        </div>
      </main>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Calendar,
  CalendarCheck,
  Loader2,
  MapPin,
  RefreshCw,
  Target,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fetchPlayerMe, fetchPlayerEvents } from "@/services/player";
import type { PlayerEvent } from "@/services/player";
import { formatEventDateTime } from "@/features/events/event-utils";

/* ═══════════════════════════════════════════════════════════════════════════
 *  FORMATTING HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function PlayerDashboardPage() {
  const { claimedAthletes } = useAuth();

  const meQuery = useQuery({
    queryKey: ["player", "me"],
    queryFn: () => fetchPlayerMe(claimedAthletes[0]?.id),
    enabled: claimedAthletes.length > 0,
  });

  const eventsQuery = useQuery({
    queryKey: ["player", "events"],
    queryFn: () => fetchPlayerEvents(claimedAthletes[0]?.id),
    enabled: claimedAthletes.length > 0,
  });

  const stats = meQuery.data;
  const events = eventsQuery.data ?? [];
  const upcomingEvents = events.filter(
    (e) => e.status === "scheduled" && new Date(e.scheduledAt) > new Date(),
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          stats
            ? `${stats.name}${stats.position ? ` · ${stats.position}` : ""}${stats.squadNumber ? ` · #${stats.squadNumber}` : ""}`
            : "Loading…"
        }
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* Loading */}
        {meQuery.isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your profile…
          </div>
        )}

        {/* Error */}
        {meQuery.isError && (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-destructive">
              {meQuery.error instanceof ApiError
                ? meQuery.error.message
                : "Could not load your profile."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void meQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        )}

        {stats && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Appearances" value={stats.appearances} />
              <StatCard label="Starts" value={stats.starts} />
              <StatCard label="Goals" value={stats.goals} variant="positive" />
              <StatCard label="Assists" value={stats.assists} variant="positive" />
              <StatCard label="Yellow Cards" value={stats.yellowCards} variant="warning" />
              <StatCard label="Red Cards" value={stats.redCards} variant="negative" />
            </div>

            {/* Recent form */}
            {stats.matches.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" />
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Recent Form
                  </h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stats.matches.slice(-8).map((m, i) => (
                    <ResultBadge key={i} result={m.result} />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming events */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Calendar className="size-4 text-muted-foreground" />
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Upcoming Events
                </h2>
              </div>
              {upcomingEvents.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No upcoming events scheduled.
                </p>
              ) : (
                <ul className="-my-1">
                  {upcomingEvents.slice(0, 5).map((event) => (
                    <EventItem key={event.id} event={event} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  variant = "neutral",
}: {
  label: string;
  value: number;
  variant?: "positive" | "negative" | "warning" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          variant === "positive" && "text-primary",
          variant === "negative" && "text-destructive",
          variant === "warning" && "text-amber-400",
          variant === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function ResultBadge({ result }: { result: "W" | "D" | "L" }) {
  const config = {
    W: { className: "bg-primary text-primary-foreground", label: "Win" },
    D: { className: "bg-muted text-foreground", label: "Draw" },
    L: { className: "bg-destructive text-primary-foreground", label: "Loss" },
  } as const;

  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full text-xs font-bold",
        config[result].className,
      )}
      title={config[result].label}
    >
      {result}
    </span>
  );
}

const EVENT_TYPE_STYLES: Record<
  PlayerEvent["type"],
  { bg: string; text: string; label: string }
> = {
  match: { bg: "bg-primary/10", text: "text-primary", label: "Match" },
  training: { bg: "bg-muted", text: "text-foreground", label: "Training" },
  meeting: {
    bg: "bg-muted-foreground/10",
    text: "text-muted-foreground",
    label: "Meeting",
  },
};

function EventItem({ event }: { event: PlayerEvent }) {
  const typeStyle = EVENT_TYPE_STYLES[event.type];

  return (
    <li className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {event.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
              typeStyle.bg,
              typeStyle.text,
            )}
          >
            {typeStyle.label}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3" aria-hidden="true" />
            {event.location}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">
          {DATE_FMT.format(new Date(event.scheduledAt))}
        </p>
        <p className="text-xs text-muted-foreground">
          {TIME_FMT.format(new Date(event.scheduledAt))}
        </p>
      </div>
    </li>
  );
}

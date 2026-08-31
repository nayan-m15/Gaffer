import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Loader2,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAthletes } from "@/features/team-management/api";
import {
  formatEventDateTime,
  formatLocalDate,
} from "@/features/events/event-utils";
import { useEvent, useStartMatch } from "@/features/events/hooks";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BackendAthlete } from "@/services/athletes";

const STARTING_XI_SIZE = 11;

const inputClassName =
  "h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30";

function isBeforeMatchDay(scheduledAt: string, now = new Date()) {
  const scheduled = new Date(scheduledAt);
  if (Number.isNaN(scheduled.getTime())) {
    return false;
  }
  return formatLocalDate(now) < formatLocalDate(scheduled);
}

function athleteLabel(athlete: BackendAthlete) {
  const name = `${athlete.firstName} ${athlete.lastName}`.trim();
  if (athlete.squadNumber != null) {
    return `#${athlete.squadNumber} ${name}`;
  }
  return name;
}

export default function ConfirmSquadPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const eventQuery = useEvent(eventId);
  const athletesQuery = useAthletes();
  const startMatch = useStartMatch(eventId ?? "");

  const [startingIds, setStartingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [opponentName, setOpponentName] = useState("");
  const [isHome, setIsHome] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const athletes = useMemo(
    () => athletesQuery.data ?? [],
    [athletesQuery.data],
  );
  const startingCount = startingIds.size;
  const opponentReady = opponentName.trim().length > 0;
  const beforeMatchDay = eventQuery.data
    ? isBeforeMatchDay(eventQuery.data.scheduledAt)
    : false;
  const canSubmit =
    startingCount === STARTING_XI_SIZE &&
    opponentReady &&
    !beforeMatchDay &&
    !startMatch.isPending;

  const sortedAthletes = useMemo(() => {
    return [...athletes].sort((a, b) => {
      const aNumber = a.squadNumber ?? Number.POSITIVE_INFINITY;
      const bNumber = b.squadNumber ?? Number.POSITIVE_INFINITY;
      if (aNumber !== bNumber) {
        return aNumber - bNumber;
      }
      return `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
      );
    });
  }, [athletes]);

  const toggleStarter = (athleteId: string) => {
    setStartingIds((current) => {
      const next = new Set(current);
      if (next.has(athleteId)) {
        next.delete(athleteId);
      } else if (next.size < STARTING_XI_SIZE) {
        next.add(athleteId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!eventId || !canSubmit) {
      return;
    }
    setSubmitError(null);
    try {
      const match = await startMatch.mutateAsync({
        opponentName: opponentName.trim(),
        isHome,
        startingAthleteIds: [...startingIds],
      });
      navigate(`/matches/${match.id}/live`, { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "Could not confirm the squad. Please try again.",
      );
    }
  };

  if (eventQuery.isLoading || athletesQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading matchday squad…</p>
        </div>
      </div>
    );
  }

  if (eventQuery.isError || athletesQuery.isError) {
    const error = eventQuery.error ?? athletesQuery.error;
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="size-8 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">
            Failed to load match
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "Something went wrong while loading this match."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void eventQuery.refetch();
              void athletesQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const event = eventQuery.data;
  if (!event || event.type !== "match") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">
            Match not found
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Confirm squad is only available for match events.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate("/events")}>
            Back to Events
          </Button>
        </div>
      </div>
    );
  }

  if (athletes.length === 0) {
    return (
      <>
        <PageHeader
          title="Confirm squad"
          subtitle={event.title}
        />
        <div className="flex min-h-[40vh] items-center justify-center px-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <Users className="size-10 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold text-foreground">
              No players available
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add players to your squad from the Roster page before confirming
              a starting XI.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/athletes")}
            >
              Go to Roster
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Confirm squad"
        subtitle={`${event.title} · ${formatEventDateTime(event.scheduledAt)}`}
        actions={
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {startMatch.isPending ? "Saving…" : "Confirm starting XI"}
          </Button>
        }
      />

      <div className="space-y-6 p-6 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="opponent-name">Opponent</Label>
            <input
              id="opponent-name"
              className={inputClassName}
              value={opponentName}
              onChange={(event) => setOpponentName(event.target.value)}
              placeholder="Opponent name"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Venue</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={isHome ? "default" : "outline"}
                onClick={() => setIsHome(true)}
              >
                Home
              </Button>
              <Button
                type="button"
                variant={!isHome ? "default" : "outline"}
                onClick={() => setIsHome(false)}
              >
                Away
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
              startingCount === STARTING_XI_SIZE
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            Starting XI: {startingCount} / {STARTING_XI_SIZE}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Bench: {athletes.length - startingCount}
          </span>
        </div>

        {beforeMatchDay && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Matches cannot be started before match day.
          </p>
        )}

        {athletes.length < STARTING_XI_SIZE && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Need at least 11 players for a full XI.
          </p>
        )}

        {submitError && (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {sortedAthletes.map((athlete) => {
            const selected = startingIds.has(athlete.id);
            return (
              <li key={athlete.id}>
                <button
                  type="button"
                  onClick={() => toggleStarter(athlete.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border bg-card p-4 text-left transition-colors",
                    "hover:border-primary/40 hover:bg-card/80",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    selected
                      ? "border-primary/60 bg-primary/5"
                      : "border-border",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {athleteLabel(athlete)}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {athlete.position ?? "Unlisted"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      selected
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {selected ? "Starting" : "Bench"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

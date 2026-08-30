import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Pencil, RotateCcw, ShieldAlert } from "lucide-react";
import { SportLogo } from "@/components/brand/SportLogo";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useDeleteMatchEvent,
  useFinishMatch,
  useLogMatchEvent,
  useMatch,
  useMatchEvents,
  useMatchSquad,
  useUpdateMatchEvent,
} from "@/features/matches/hooks";
import type {
  MatchEventTeam,
  MatchEventType,
  MatchLogEvent,
  MatchSquadAthlete,
} from "@/features/matches/types";
import {
  EVENT_COLOR,
  EVENT_LABEL,
  PENALTY_MISSED_DETAIL,
  PENALTY_SCORED_DETAIL,
  SECOND_YELLOW_DETAIL,
  eventDisplayLabel,
  hasPriorYellow,
  isSecondYellow,
} from "@/features/matches/event-visuals";
import { EventTypeGlyph } from "@/features/matches/EventTypeGlyph";
import "./LiveMatchPage.css";

type Period =
  | "not_started"
  | "first_half"
  | "half_time"
  | "second_half"
  | "full_time";

type LogAction = Exclude<MatchEventType, "assist">;

type Composer =
  | { kind: "closed" }
  | { kind: "team"; eventType: LogAction }
  | {
      kind: "keypad";
      eventType: LogAction;
      team: MatchEventTeam;
      reassignId?: string;
      detail?: string;
    }
  | { kind: "penalty-outcome"; team: MatchEventTeam }
  | { kind: "sub-out"; team: MatchEventTeam }
  | { kind: "sub-in"; team: MatchEventTeam; outgoing: MatchSquadAthlete | string };

type ConfirmKind = "pause" | "half" | "full" | null;

type PersistInput = {
  team: MatchEventTeam;
  eventType: MatchEventType;
  athleteId?: string;
  opponentLabel?: string;
  detail?: string;
  reassignId?: string;
};

const UNASSIGNED_SECONDS = 8;

const ACTIONS: {
  type: LogAction;
  label: string;
  color: string;
  glow: string;
}[] = [
  {
    type: "goal",
    label: "GOAL",
    color: EVENT_COLOR.goal,
    glow: "0 0 22px rgba(0,217,154,0.45)",
  },
  {
    type: "key_pass",
    label: "KEY PASS",
    color: EVENT_COLOR.key_pass,
    glow: "0 0 22px rgba(91,159,255,0.4)",
  },
  {
    type: "yellow_card",
    label: "YELLOW",
    color: EVENT_COLOR.yellow_card,
    glow: "0 0 22px rgba(245,197,24,0.4)",
  },
  {
    type: "red_card",
    label: "RED",
    color: EVENT_COLOR.red_card,
    glow: "0 0 22px rgba(255,91,95,0.45)",
  },
  {
    type: "substitution",
    label: "SUB",
    color: EVENT_COLOR.substitution,
    glow: "0 0 22px rgba(192,132,252,0.4)",
  },
  {
    type: "penalty",
    label: "PENALTY",
    color: EVENT_COLOR.penalty,
    glow: "0 0 22px rgba(32,230,166,0.4)",
  },
  {
    type: "injury",
    label: "INJURY",
    color: EVENT_COLOR.injury,
    glow: "0 0 22px rgba(251,146,60,0.4)",
  },
];

function formatClock(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function lastName(athlete: MatchSquadAthlete) {
  return athlete.lastName || athlete.firstName;
}

function shirtLabel(athlete: MatchSquadAthlete) {
  return athlete.squadNumber != null
    ? `#${athlete.squadNumber} ${lastName(athlete)}`
    : `${athlete.firstName} ${athlete.lastName}`.trim();
}

function isUnassigned(event: MatchLogEvent) {
  return !event.athleteId && !event.opponentLabel;
}

function substitutionIncoming(
  event: MatchLogEvent,
  squad: MatchSquadAthlete[],
) {
  if (event.eventType !== "substitution" || !event.detail) {
    return "";
  }
  const incoming = squad.find((athlete) => athlete.id === event.detail);
  return incoming ? ` → ${shirtLabel(incoming)}` : ` → ${event.detail}`;
}

function WhistleIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M10 28c0-6 5-11 12-11h16c8 0 14 6 14 13 0 4-2 8-6 10l4 8c1 2 0 4-2 5h-8c-2 0-3-1-4-3l-3-7H22c-7 0-12-5-12-10Z"
        fill="#00d99a"
      />
      <circle cx="22" cy="30" r="5" fill="#070d12" />
      <path d="M42 22h10c4 0 7 3 7 7v2c0 4-3 7-7 7h-4" stroke="#00d99a" strokeWidth="3" />
    </svg>
  );
}

/**
 * Full-screen live logger. Period/pause/clock are client-side only and reset
 * on refresh — v1 does not persist elapsed time.
 */
export default function LiveMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { team } = useAuth();

  const matchQuery = useMatch(matchId);
  const squadQuery = useMatchSquad(matchId);
  const eventsQuery = useMatchEvents(matchId);
  const logEvent = useLogMatchEvent(matchId ?? "");
  const updateEvent = useUpdateMatchEvent(matchId ?? "");
  const deleteEvent = useDeleteMatchEvent(matchId ?? "");
  const finishMatch = useFinishMatch(matchId ?? "");

  const [period, setPeriod] = useState<Period>("not_started");
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const baseRef = useRef(0);

  const [composer, setComposer] = useState<Composer>({ kind: "closed" });
  const [digits, setDigits] = useState("");
  const [countdown, setCountdown] = useState(UNASSIGNED_SECONDS);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [toast, setToast] = useState<{
    id?: string;
    label: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shirtError, setShirtError] = useState<string | null>(null);
  const elapsedRef = useRef(0);
  const autoSavedRef = useRef(false);
  const persistLockRef = useRef(false);
  const digitsRef = useRef("");
  const shirtErrorTimerRef = useRef<number | null>(null);
  const persistEventRef = useRef<(input: PersistInput) => Promise<void>>(
    async () => {},
  );
  const primedIdsRef = useRef(false);
  const knownIdsRef = useRef(new Set<string>());
  const enteringIdsRef = useRef(new Set<string>());

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    return () => {
      if (shirtErrorTimerRef.current != null) {
        window.clearTimeout(shirtErrorTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (matchQuery.data?.eventStatus === "completed") {
      setPeriod("full_time");
      setRunning(false);
    }
  }, [matchQuery.data?.eventStatus]);

  useEffect(() => {
    if (!running) {
      return;
    }
    const origin = Date.now() - baseRef.current;
    const id = window.setInterval(() => {
      const next = Date.now() - origin;
      elapsedRef.current = next;
      setElapsedMs(next);
    }, 200);
    return () => window.clearInterval(id);
  }, [running]);

  const squad = useMemo(() => squadQuery.data ?? [], [squadQuery.data]);
  const timeline = useMemo(
    () => eventsQuery.data ?? [],
    [eventsQuery.data],
  );
  const currentMinute = Math.floor(elapsedMs / 60_000);
  digitsRef.current = digits;

  const rowKey = (event: MatchLogEvent) => event.optimisticKey ?? event.id;

  if (eventsQuery.isSuccess && !primedIdsRef.current) {
    primedIdsRef.current = true;
    knownIdsRef.current = new Set(timeline.map(rowKey));
  } else if (primedIdsRef.current) {
    for (const event of timeline) {
      const key = rowKey(event);
      if (!knownIdsRef.current.has(key)) {
        enteringIdsRef.current.add(key);
        knownIdsRef.current.add(key);
      }
    }
  }

  const pitchState = useMemo(() => {
    const onPitch = new Set(
      squad.filter((athlete) => athlete.started).map((athlete) => athlete.id),
    );
    const bench = new Set(
      squad.filter((athlete) => !athlete.started).map((athlete) => athlete.id),
    );
    const chronological = [...timeline].sort((a, b) => {
      const byTime = a.minute - b.minute;
      if (byTime !== 0) {
        return byTime;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
    for (const event of chronological) {
      if (event.eventType !== "substitution" || event.team !== "own") {
        continue;
      }
      const outgoingId = event.athleteId;
      const incomingId = event.detail;
      if (outgoingId) {
        onPitch.delete(outgoingId);
        bench.add(outgoingId);
      }
      if (incomingId) {
        onPitch.add(incomingId);
        bench.delete(incomingId);
      }
    }
    return {
      onPitch: squad.filter((athlete) => onPitch.has(athlete.id)),
      bench: squad.filter((athlete) => bench.has(athlete.id)),
    };
  }, [squad, timeline]);

  const ownName = team?.name ?? "US";
  const oppName = matchQuery.data?.opponentName ?? "OPP";
  const isHome = matchQuery.data?.isHome ?? true;
  const teamScore = matchQuery.data?.teamScore ?? 0;
  const oppScore = matchQuery.data?.opponentScore ?? 0;
  const homeName = isHome ? ownName : oppName;
  const awayName = isHome ? oppName : ownName;
  const homeScore = isHome ? teamScore : oppScore;
  const awayScore = isHome ? oppScore : teamScore;

  const loggedGoalsOwn = timeline.filter(
    (event) => event.eventType === "goal" && event.team === "own",
  ).length;
  const loggedGoalsOpp = timeline.filter(
    (event) => event.eventType === "goal" && event.team === "opponent",
  ).length;

  const keypadLookup = useMemo(() => {
    if (!digits) {
      return null;
    }
    const number = Number(digits);
    if (composer.kind !== "keypad") {
      return null;
    }
    if (composer.team === "opponent") {
      return { label: `Opponent #${digits}`, athlete: null as MatchSquadAthlete | null };
    }
    const athlete = pitchState.onPitch.find(
      (player) => player.squadNumber === number,
    );
    return {
      label: athlete
        ? `#${digits} ${lastName(athlete)}`
        : `#${digits}`,
      athlete: athlete ?? null,
    };
  }, [digits, composer, pitchState.onPitch]);

  const startClock = () => {
    setRunning(true);
  };

  const pauseClock = () => {
    setRunning(false);
    baseRef.current = elapsedRef.current;
  };

  const startFirstHalf = () => {
    baseRef.current = 0;
    elapsedRef.current = 0;
    setElapsedMs(0);
    setPeriod("first_half");
    setRunning(true);
  };

  const goHalfTime = () => {
    pauseClock();
    setPeriod("half_time");
    setConfirm(null);
  };

  const startSecondHalf = () => {
    if (baseRef.current < 45 * 60_000) {
      baseRef.current = 45 * 60_000;
      elapsedRef.current = baseRef.current;
      setElapsedMs(baseRef.current);
    }
    setPeriod("second_half");
    setRunning(true);
  };

  const goFullTime = () => {
    pauseClock();
    setPeriod("full_time");
    setConfirm(null);
  };

  const backToFirstHalf = () => {
    setPeriod("first_half");
    setRunning(true);
  };

  const openKeypad = (
    eventType: LogAction,
    team: MatchEventTeam,
    options?: { reassignId?: string; detail?: string },
  ) => {
    autoSavedRef.current = false;
    persistLockRef.current = false;
    setShirtError(null);
    setDigits("");
    setCountdown(UNASSIGNED_SECONDS);
    setComposer({
      kind: "keypad",
      eventType,
      team,
      reassignId: options?.reassignId,
      detail: options?.detail,
    });
  };

  const closeComposer = useCallback(() => {
    setComposer({ kind: "closed" });
    setDigits("");
    setCountdown(UNASSIGNED_SECONDS);
  }, []);

  const persistEvent = useCallback(
    async (input: PersistInput) => {
      if (!matchId || persistLockRef.current) {
        return;
      }
      persistLockRef.current = true;
      autoSavedRef.current = true;
      setActionError(null);

      let eventType = input.eventType;
      let detail = input.detail;
      if (
        eventType === "yellow_card" &&
        hasPriorYellow(
          timeline,
          input.team,
          input.athleteId,
          input.opponentLabel,
        )
      ) {
        eventType = "red_card";
        detail = SECOND_YELLOW_DETAIL;
      }

      closeComposer();

      try {
        if (input.reassignId) {
          await updateEvent.mutateAsync({
            eventId: input.reassignId,
            input: {
              athleteId: input.athleteId ?? null,
              opponentLabel: input.opponentLabel ?? null,
            },
          });
        } else {
          const created = await logEvent.mutateAsync({
            team: input.team,
            eventType,
            minute: currentMinute,
            ...(input.athleteId ? { athleteId: input.athleteId } : {}),
            ...(input.opponentLabel
              ? { opponentLabel: input.opponentLabel }
              : {}),
            ...(detail ? { detail } : {}),
          });
          setToast({
            id: created.id,
            label: `${eventDisplayLabel({ eventType, detail: detail ?? null })} logged`,
          });
          window.setTimeout(() => setToast(null), 5000);
          if (eventType === "injury") {
            persistLockRef.current = false;
            if (input.team === "own" && input.athleteId) {
              const outgoing = squad.find(
                (athlete) => athlete.id === input.athleteId,
              );
              if (outgoing) {
                setComposer({
                  kind: "sub-in",
                  team: "own",
                  outgoing,
                });
              }
            } else if (input.team === "opponent" && input.opponentLabel) {
              setComposer({
                kind: "sub-in",
                team: "opponent",
                outgoing: input.opponentLabel,
              });
            }
          }
        }
      } catch (err) {
        autoSavedRef.current = false;
        persistLockRef.current = false;
        const message =
          err instanceof ApiError
            ? err.message
            : "Could not save this event. Please try again.";
        setActionError(message);
        setToast({ label: message });
        window.setTimeout(() => setToast(null), 5000);
      }
    },
    [matchId, currentMinute, timeline, squad, updateEvent, logEvent, closeComposer],
  );

  persistEventRef.current = persistEvent;

  useEffect(() => {
    if (composer.kind !== "keypad") {
      return;
    }
    setCountdown(UNASSIGNED_SECONDS);
    const keypad = composer;
    const id = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(id);
          if (!digitsRef.current && !autoSavedRef.current) {
            autoSavedRef.current = true;
            void persistEventRef.current({
              team: keypad.team,
              eventType: keypad.eventType,
              detail: keypad.detail,
              reassignId: keypad.reassignId,
            });
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [composer]);

  const flashUnknownShirt = () => {
    setShirtError("No player with that number on the field");
    if (shirtErrorTimerRef.current != null) {
      window.clearTimeout(shirtErrorTimerRef.current);
    }
    shirtErrorTimerRef.current = window.setTimeout(() => {
      setShirtError(null);
      setDigits("");
      setCountdown(UNASSIGNED_SECONDS);
      shirtErrorTimerRef.current = null;
    }, 1800);
  };

  const submitKeypad = () => {
    if (composer.kind !== "keypad" || persistLockRef.current) {
      return;
    }
    if (composer.team === "own" && digits && !keypadLookup?.athlete) {
      flashUnknownShirt();
      return;
    }
    autoSavedRef.current = true;
    if (composer.team === "own") {
      void persistEvent({
        team: "own",
        eventType: composer.eventType,
        athleteId: keypadLookup?.athlete?.id,
        detail: composer.detail,
        reassignId: composer.reassignId,
      });
      return;
    }
    void persistEvent({
      team: "opponent",
      eventType: composer.eventType,
      opponentLabel: digits ? `Opponent #${digits}` : undefined,
      detail: composer.detail,
      reassignId: composer.reassignId,
    });
  };

  const handleUndo = async (eventId: string) => {
    setActionError(null);
    try {
      await deleteEvent.mutateAsync(eventId);
      setToast(null);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not undo this event.";
      setActionError(message);
      setToast({ label: message });
      window.setTimeout(() => setToast(null), 5000);
    }
  };

  const handleFinish = async () => {
    setActionError(null);
    try {
      await finishMatch.mutateAsync();
      navigate("/events");
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Could not finish this match.",
      );
    }
  };

  const periodLabel =
    period === "not_started"
      ? "NOT STARTED"
      : period === "first_half"
        ? "1ST HALF"
        : period === "half_time"
          ? "HALF-TIME"
          : period === "second_half"
            ? "2ND HALF"
            : "FULL TIME";

  const liveLogging =
    period === "first_half" || period === "second_half";

  if (matchQuery.isLoading || squadQuery.isLoading || eventsQuery.isLoading) {
    return (
      <div className="live-match flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#00d99a]" />
      </div>
    );
  }

  if (matchQuery.isError || squadQuery.isError || eventsQuery.isError) {
    const error = matchQuery.error ?? squadQuery.error ?? eventsQuery.error;
    return (
      <div className="live-match flex min-h-screen items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="size-8 text-[#ff5b5f]" />
          <p className="font-oswald text-xl tracking-wide">FAILED TO LOAD MATCH</p>
          <p className="text-sm text-[#8e9ba8]">
            {error instanceof Error ? error.message : "Something went wrong."}
          </p>
          <button
            type="button"
            className="rounded-lg border border-[#233747] px-4 py-2 text-sm"
            onClick={() => {
              void matchQuery.refetch();
              void squadQuery.refetch();
              void eventsQuery.refetch();
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const match = matchQuery.data;
  if (!match) {
    return (
      <div className="live-match flex min-h-screen items-center justify-center">
        <p className="font-oswald text-xl tracking-wide">MATCH NOT FOUND</p>
      </div>
    );
  }

  return (
    <div className="live-match flex min-h-screen flex-col overflow-x-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[#1c2b36] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <SportLogo size={36} className="shrink-0 rounded-lg" />
          <div className="min-w-0">
            <h1 className="font-display text-base font-bold tracking-wide text-[#e8ecef]">
              GAFFER
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#8e9ba8]">
              Live Logger
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 font-oswald text-xs tracking-widest",
            period === "not_started"
              ? "bg-[#1a2530] text-[#8e9ba8]"
              : period === "full_time"
                ? "bg-[#ff5b5f]/15 text-[#ff5b5f]"
                : "bg-[#00d99a]/15 text-[#00d99a]",
          )}
        >
          {periodLabel}
        </span>
      </header>

      <div className="px-4 pb-28 pt-5">
        <div className="text-center">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <p className="truncate text-right text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8e9ba8] sm:text-[11px]">
              {homeName}
            </p>
            <p className="font-oswald text-5xl leading-none tabular-nums text-white sm:text-7xl">
              {homeScore}
              <span className="mx-1 text-2xl text-[#8e9ba8] sm:mx-2 sm:text-3xl">–</span>
              {awayScore}
            </p>
            <p className="truncate text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8e9ba8] sm:text-[11px]">
              {awayName}
            </p>
          </div>
          <p className="mt-4 font-oswald text-4xl tabular-nums tracking-wide text-white sm:text-5xl">
            {formatClock(elapsedMs)}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8e9ba8]">
            {periodLabel}
          </p>
        </div>

        {period === "not_started" && (
          <div className="mt-12 flex flex-col items-center">
            <button
              type="button"
              onClick={startFirstHalf}
              className="relative flex flex-col items-center gap-4"
            >
              <span className="absolute size-40 rounded-full bg-[#00d99a] opacity-25 blur-2xl animate-pulse" />
              <span className="relative flex size-32 items-center justify-center rounded-full border-2 border-[#00d99a] bg-[#101920] shadow-[0_0_40px_rgba(0,217,154,0.45)]">
                <WhistleIcon />
              </span>
              <span className="relative font-oswald text-2xl tracking-[0.28em] text-[#00d99a]">
                START GAME
              </span>
            </button>
          </div>
        )}

        {liveLogging && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[#233747] bg-[#101920] px-4 py-2 font-oswald text-xs tracking-widest"
              onClick={() => setConfirm("pause")}
            >
              {running ? "PAUSE TIME" : "RESUME TIME"}
            </button>
            {period === "first_half" && (
              <button
                type="button"
                className="rounded-lg border border-[#233747] bg-[#101920] px-4 py-2 font-oswald text-xs tracking-widest"
                onClick={() => setConfirm("half")}
              >
                HALF TIME
              </button>
            )}
            {period === "second_half" && (
              <button
                type="button"
                className="rounded-lg border border-[#233747] bg-[#101920] px-4 py-2 font-oswald text-xs tracking-widest"
                onClick={() => setConfirm("full")}
              >
                FULL TIME
              </button>
            )}
          </div>
        )}

        {period === "half_time" && (
          <PeriodSummary
            title="HALF-TIME"
            ownName={ownName}
            oppName={oppName}
            timeline={timeline}
            onContinue={startSecondHalf}
            continueLabel="START 2ND HALF"
            onBack={backToFirstHalf}
            backLabel="← Back to 1st Half"
          />
        )}

        {period === "full_time" && (
          <PeriodSummary
            title="FULL TIME"
            ownName={ownName}
            oppName={oppName}
            timeline={timeline}
            onContinue={() => setEndOpen(true)}
            continueLabel="END MATCH & SAVE REPORT"
            continueDisabled={match.eventStatus === "completed" || finishMatch.isPending}
          />
        )}

        {actionError && (
          <p role="alert" className="mt-4 text-center text-sm text-[#ff5b5f]">
            {actionError}
          </p>
        )}

        {liveLogging && (
          <div className="mt-8 grid grid-cols-2 gap-2 sm:gap-3">
            {ACTIONS.map((action) => (
              <button
                key={action.type}
                type="button"
                className="rounded-xl border bg-[#101920] px-2 py-3 font-oswald text-xs tracking-[0.18em] sm:px-3 sm:py-4 sm:text-sm disabled:opacity-40"
                style={{
                  borderColor: action.color,
                  color: action.color,
                  boxShadow: action.glow,
                }}
                onClick={() => {
                  persistLockRef.current = false;
                  setComposer({ kind: "team", eventType: action.type });
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        <section className="mt-8">
          <h2 className="font-oswald text-sm tracking-[0.22em] text-[#8e9ba8]">
            TIMELINE
          </h2>
          {timeline.length === 0 ? (
            <p className="mt-4 text-center text-sm text-[#8e9ba8]">
              No events yet.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 overflow-x-hidden">
              {timeline.map((event) => {
                const unassigned = isUnassigned(event);
                const who = event.athlete
                  ? shirtLabel(event.athlete)
                  : event.opponentLabel ?? "Unassigned";
                const accent = EVENT_COLOR[event.eventType];
                const key = rowKey(event);
                return (
                  <li
                    key={key}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl border border-l-4 px-3 py-3",
                      unassigned
                        ? "border-[#ffbe2e] bg-[#ffbe2e]/10"
                        : "border-[#1c2b36] bg-[#101920]",
                      event.pending && "opacity-55",
                      enteringIdsRef.current.has(key) &&
                        "live-timeline-enter",
                    )}
                    style={{ borderLeftColor: accent }}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <EventTypeGlyph
                        eventType={event.eventType}
                        secondYellow={isSecondYellow(event)}
                      />
                      <div className="min-w-0">
                        <p className="font-oswald text-sm tracking-wide">
                          {event.minute}&apos; {eventDisplayLabel(event)}
                        </p>
                        <p
                          className={cn(
                            "truncate text-xs",
                            unassigned ? "text-[#ffbe2e]" : "text-[#8e9ba8]",
                          )}
                        >
                          {event.team === "own" ? ownName : oppName} · {who}
                          {substitutionIncoming(event, squad)}
                        </p>
                      </div>
                    </div>
                    {period !== "full_time" && !event.pending && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          aria-label="Edit attribution"
                          className={cn(
                            "rounded-md p-2",
                            unassigned ? "text-[#ffbe2e]" : "text-[#8e9ba8]",
                          )}
                          onClick={() =>
                            openKeypad(event.eventType as LogAction, event.team, {
                              reassignId: event.id,
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Undo event"
                          className="rounded-md p-2 text-[#8e9ba8]"
                          onClick={() => void handleUndo(event.id)}
                        >
                          <RotateCcw className="size-4" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {toast && (
        <div
          className={cn(
            "fixed bottom-4 left-1/2 z-40 w-[min(92%,28rem)] -translate-x-1/2 rounded-xl bg-[#101920] px-4 py-3 shadow-lg",
            toast.id ? "border border-[#00d99a]/40" : "border border-[#ff5b5f]/40",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[#e8ecef]">{toast.label}</p>
            {toast.id ? (
              <button
                type="button"
                className="font-oswald text-xs tracking-widest text-[#00d99a]"
                onClick={() => void handleUndo(toast.id!)}
              >
                UNDO
              </button>
            ) : null}
          </div>
        </div>
      )}

      {composer.kind === "team" && (
        <Overlay onClose={closeComposer}>
          <p className="font-oswald text-2xl tracking-widest">WHO?</p>
          <p className="mt-1 text-sm text-[#8e9ba8]">
            {EVENT_LABEL[composer.eventType]}
          </p>
          <div className="mt-8 grid gap-3">
            <button
              type="button"
              className="rounded-2xl border-2 border-[#00d99a] bg-[#00d99a]/10 py-6 font-oswald text-xl tracking-widest text-[#00d99a] sm:text-2xl"
              onClick={() =>
                composer.eventType === "substitution"
                  ? setComposer({ kind: "sub-out", team: "own" })
                  : composer.eventType === "penalty"
                    ? setComposer({ kind: "penalty-outcome", team: "own" })
                    : openKeypad(composer.eventType, "own")
              }
            >
              {ownName}
            </button>
            <button
              type="button"
              className="rounded-2xl border-2 border-[#8e9ba8] bg-[#101920] py-6 font-oswald text-xl tracking-widest sm:text-2xl"
              onClick={() =>
                composer.eventType === "substitution"
                  ? setComposer({ kind: "sub-out", team: "opponent" })
                  : composer.eventType === "penalty"
                    ? setComposer({ kind: "penalty-outcome", team: "opponent" })
                    : openKeypad(composer.eventType, "opponent")
              }
            >
              {oppName}
            </button>
          </div>
        </Overlay>
      )}

      {composer.kind === "keypad" && (
        <Overlay onClose={closeComposer} fullScreen>
          <p className="font-oswald text-xl tracking-widest">
            {composer.detail === PENALTY_SCORED_DETAIL
              ? "PENALTY SCORED"
              : composer.detail === PENALTY_MISSED_DETAIL
                ? "PENALTY MISSED"
                : EVENT_LABEL[composer.eventType]}{" "}
            · {composer.team === "own" ? ownName : oppName}
          </p>
          <p className="mt-4 font-oswald text-5xl tabular-nums text-white">
            {digits || "—"}
          </p>
          <p
            className={cn(
              "mt-2 min-h-7 text-lg",
              shirtError ? "text-[#ff5b5f]" : "text-[#00d99a]",
            )}
          >
            {shirtError
              ? shirtError
              : keypadLookup?.athlete
                ? `→ ${keypadLookup.label}`
                : countdown > 0
                  ? `Unassigned in ${countdown}s`
                  : digits
                    ? ""
                    : "Saving as Unassigned…"}
          </p>
          <Keypad
            value={digits}
            onChange={(value) => {
              setShirtError(null);
              setDigits(value);
              setCountdown(UNASSIGNED_SECONDS);
              if (
                composer.kind === "keypad" &&
                composer.team === "own" &&
                value.length >= 1
              ) {
                const number = Number(value);
                const onPitch = pitchState.onPitch.some(
                  (player) => player.squadNumber === number,
                );
                if (!onPitch && value.length === 2) {
                  flashUnknownShirt();
                }
              }
            }}
          />
          <button
            type="button"
            className="mt-4 w-full rounded-xl bg-[#00d99a] py-3 font-oswald tracking-widest text-[#07110f]"
            onClick={submitKeypad}
            disabled={
              logEvent.isPending || updateEvent.isPending || Boolean(shirtError)
            }
          >
            CONFIRM
          </button>
          <button
            type="button"
            className="mt-3 w-full rounded-xl border border-[#233747] py-3 font-oswald tracking-widest"
            onClick={closeComposer}
          >
            NO, GO BACK
          </button>
        </Overlay>
      )}

      {composer.kind === "penalty-outcome" && (
        <Overlay onClose={closeComposer}>
          <p className="font-oswald text-2xl tracking-widest">PENALTY</p>
          <p className="mt-1 text-sm text-[#8e9ba8]">
            {composer.team === "own" ? ownName : oppName}
          </p>
          <div className="mt-8 grid gap-3">
            <button
              type="button"
              className="rounded-2xl border-2 border-[#00d99a] bg-[#00d99a]/10 py-6 font-oswald text-xl tracking-widest text-[#00d99a]"
              onClick={() =>
                openKeypad("goal", composer.team, {
                  detail: PENALTY_SCORED_DETAIL,
                })
              }
            >
              SCORED
            </button>
            <button
              type="button"
              className="rounded-2xl border-2 border-[#8e9ba8] bg-[#101920] py-6 font-oswald text-xl tracking-widest"
              onClick={() =>
                openKeypad("penalty", composer.team, {
                  detail: PENALTY_MISSED_DETAIL,
                })
              }
            >
              MISSED
            </button>
          </div>
        </Overlay>
      )}

      {composer.kind === "sub-out" && (
        <Overlay onClose={closeComposer}>
          <p className="font-oswald text-xl tracking-widest">COMING OFF</p>
          {composer.team === "own" ? (
            <PlayerList
              athletes={pitchState.onPitch}
              onPick={(athlete) =>
                setComposer({ kind: "sub-in", team: "own", outgoing: athlete })
              }
            />
          ) : (
            <KeypadPicker
              label="Outgoing number"
              onConfirm={(num) =>
                setComposer({
                  kind: "sub-in",
                  team: "opponent",
                  outgoing: `Opponent #${num}`,
                })
              }
            />
          )}
        </Overlay>
      )}

      {composer.kind === "sub-in" && (
        <Overlay onClose={closeComposer}>
          <p className="font-oswald text-xl tracking-widest">COMING ON</p>
          {composer.team === "own" ? (
            <PlayerList
              athletes={pitchState.bench}
              onPick={(incoming) => {
                const outgoing = composer.outgoing as MatchSquadAthlete;
                void persistEvent({
                  team: "own",
                  eventType: "substitution",
                  athleteId: outgoing.id,
                  detail: incoming.id,
                });
              }}
            />
          ) : (
            <KeypadPicker
              label="Incoming number"
              onConfirm={(num) => {
                void persistEvent({
                  team: "opponent",
                  eventType: "substitution",
                  opponentLabel:
                    typeof composer.outgoing === "string"
                      ? composer.outgoing
                      : undefined,
                  detail: `Opponent #${num}`,
                });
              }}
            />
          )}
        </Overlay>
      )}

      {confirm && (
        <Overlay onClose={() => setConfirm(null)}>
          <p className="font-oswald text-2xl tracking-widest">
            {confirm === "pause"
              ? running
                ? "PAUSE TIME?"
                : "RESUME TIME?"
              : confirm === "half"
                ? "HALF TIME?"
                : "FULL TIME?"}
          </p>
          <div className="mt-8 grid gap-3">
            <button
              type="button"
              className="rounded-xl bg-[#00d99a] py-3 font-oswald tracking-widest text-[#07110f]"
              onClick={() => {
                if (confirm === "pause") {
                  if (running) {
                    pauseClock();
                  } else {
                    startClock();
                  }
                  setConfirm(null);
                } else if (confirm === "half") {
                  goHalfTime();
                } else {
                  goFullTime();
                }
              }}
            >
              YES, CONFIRM
            </button>
            <button
              type="button"
              className="rounded-xl border border-[#233747] py-3 font-oswald tracking-widest"
              onClick={() => setConfirm(null)}
            >
              NO, GO BACK
            </button>
          </div>
        </Overlay>
      )}

      {endOpen && (
        <Overlay onClose={() => setEndOpen(false)}>
          <p className="font-oswald text-2xl tracking-widest">SAVE REPORT</p>
          <p className="mt-4 text-sm text-[#8e9ba8]">
            Reconcile the scoreboard with logged goals before saving.
          </p>
          <div className="mt-6 space-y-2 rounded-xl border border-[#1c2b36] bg-[#101920] p-4 font-oswald tracking-wide">
            <p>Scoreboard: {teamScore} – {oppScore}</p>
            <p>Logged goals: {loggedGoalsOwn} – {loggedGoalsOpp}</p>
          </div>
          <div className="mt-8 grid gap-3">
            <button
              type="button"
              className="rounded-xl bg-[#00d99a] py-3 font-oswald tracking-widest text-[#07110f]"
              onClick={() => void handleFinish()}
              disabled={finishMatch.isPending}
            >
              {finishMatch.isPending ? "SAVING…" : "END MATCH & SAVE REPORT"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-[#233747] py-3 font-oswald tracking-widest"
              onClick={() => setEndOpen(false)}
            >
              NO, GO BACK
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({
  children,
  onClose,
  fullScreen = false,
}: {
  children: ReactNode;
  onClose: () => void;
  fullScreen?: boolean;
}) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#070d12] p-5">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <button
            type="button"
            className="mb-4 self-end font-oswald text-xs tracking-widest text-[#8e9ba8]"
            onClick={onClose}
          >
            CLOSE
          </button>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#1c2b36] bg-[#070d12] p-5">
        {children}
      </div>
    </div>
  );
}

function Keypad({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"];
  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className="rounded-xl border border-[#1c2b36] bg-[#101920] py-4 font-oswald text-2xl"
          onClick={() => {
            if (key === "⌫") {
              onChange(value.slice(0, -1));
              return;
            }
            if (value.length >= 2) {
              return;
            }
            onChange(`${value}${key}`);
          }}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

function KeypadPicker({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: (num: string) => void;
}) {
  const [digits, setDigits] = useState("");
  return (
    <div>
      <p className="mt-2 text-sm text-[#8e9ba8]">{label}</p>
      <p className="mt-3 font-oswald text-5xl tabular-nums">{digits || "—"}</p>
      <Keypad value={digits} onChange={setDigits} />
      <button
        type="button"
        className="mt-4 w-full rounded-xl bg-[#00d99a] py-3 font-oswald tracking-widest text-[#07110f] disabled:opacity-40"
        disabled={!digits}
        onClick={() => onConfirm(digits)}
      >
        CONFIRM
      </button>
    </div>
  );
}

function PlayerList({
  athletes,
  onPick,
}: {
  athletes: MatchSquadAthlete[];
  onPick: (athlete: MatchSquadAthlete) => void;
}) {
  if (athletes.length === 0) {
    return <p className="mt-6 text-sm text-[#8e9ba8]">No players available.</p>;
  }
  return (
    <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
      {athletes.map((athlete) => (
        <button
          key={athlete.id}
          type="button"
          className="flex w-full rounded-xl border border-[#1c2b36] bg-[#101920] px-4 py-3 text-left font-oswald tracking-wide"
          onClick={() => onPick(athlete)}
        >
          {shirtLabel(athlete)}
        </button>
      ))}
    </div>
  );
}

function PeriodSummary({
  title,
  ownName,
  oppName,
  timeline,
  onContinue,
  continueLabel,
  continueDisabled,
  onBack,
  backLabel,
}: {
  title: string;
  ownName: string;
  oppName: string;
  timeline: MatchLogEvent[];
  onContinue: () => void;
  continueLabel: string;
  continueDisabled?: boolean;
  onBack?: () => void;
  backLabel?: string;
}) {
  const count = (type: MatchEventType, side: MatchEventTeam) =>
    timeline.filter((event) => event.eventType === type && event.team === side)
      .length;

  return (
    <div className="mt-8 rounded-2xl border border-[#1c2b36] bg-[#101920] p-5">
      <p className="font-oswald text-center text-2xl tracking-widest">{title}</p>
      <div className="mt-5 grid grid-cols-3 text-center text-sm">
        <p className="text-[#8e9ba8]">{ownName}</p>
        <p className="text-[#8e9ba8]"> </p>
        <p className="text-[#8e9ba8]">{oppName}</p>
        <p className="font-oswald text-2xl">{count("goal", "own")}</p>
        <p className="text-[10px] uppercase tracking-widest text-[#8e9ba8]">Goals</p>
        <p className="font-oswald text-2xl">{count("goal", "opponent")}</p>
        <p className="font-oswald text-2xl">{count("yellow_card", "own")}</p>
        <p className="text-[10px] uppercase tracking-widest text-[#8e9ba8]">Yellow</p>
        <p className="font-oswald text-2xl">{count("yellow_card", "opponent")}</p>
        <p className="font-oswald text-2xl">{count("red_card", "own")}</p>
        <p className="text-[10px] uppercase tracking-widest text-[#8e9ba8]">Red</p>
        <p className="font-oswald text-2xl">{count("red_card", "opponent")}</p>
      </div>
      <button
        type="button"
        className="mt-6 w-full rounded-xl bg-[#00d99a] py-3 font-oswald tracking-widest text-[#07110f] disabled:opacity-40"
        onClick={onContinue}
        disabled={continueDisabled}
      >
        {continueLabel}
      </button>
      {onBack && (
        <button
          type="button"
          className="mt-3 w-full rounded-xl border border-[#233747] py-3 font-oswald tracking-widest"
          onClick={onBack}
        >
          {backLabel}
        </button>
      )}
    </div>
  );
}

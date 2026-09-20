import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeftRight,
  HeartPulse,
  LayoutDashboard,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  ShieldAlert,
  Target,
} from "lucide-react";
import { GiWhistle } from "react-icons/gi";
import { SportLogo } from "@/components/brand/SportLogo";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { OfflineSyncStatus } from "@/offline/OfflineSyncStatus";
import { EventReviewPanel } from "@/offline/EventReviewPanel";
import { OfflineReadinessPanel } from "@/offline/OfflineReadinessPanel";
import {
  isClockAnchorPending,
  markClockAnchorSynced,
  readClockAnchor,
  saveClockAnchor,
} from "@/offline/match-store";
import { useGamePlan } from "@/features/team-tactics/api";
import {
  useDeleteMatchEvent,
  useFinishMatch,
  useFinaliseMatchProjection,
  useLogMatchEvent,
  useMatch,
  useMatchEvents,
  useMatchSquad,
  useUpdateMatchEvent,
  useUpdateMatchClock,
  useReopenMatchProjection,
} from "@/features/matches/hooks";
import type {
  MatchEventTeam,
  MatchEventType,
  MatchLogEvent,
  MatchSquadAthlete,
  OpponentMatchPlayer,
} from "@/features/matches/types";
import {
  PENALTY_MISSED_DETAIL,
  PENALTY_SCORED_DETAIL,
  SECOND_YELLOW_DETAIL,
  displayedGoalScore,
  eventDisplayLabel,
  hasPriorYellow,
  isPairedAssistEvent,
  isSecondYellow,
  linkedAssistsForGoal,
  pairAssistsToGoals,
} from "@/features/matches/event-visuals";
import { EventTypeGlyph } from "@/features/matches/EventTypeGlyph";
import {
  dimEventGridFor,
  isAssistCallout,
  isBenchIncomingCallout,
  isMandatorySubCallout,
  isSubOutCallout,
} from "@/features/matches/live-callouts";
import {
  opponentPitchState,
  ownPitchState,
  placeOppPlayers,
  placeOwnPlayers,
  resolveOppColor,
  resolveOwnColor,
  runningScoreByEvent,
  teamAbbrev,
} from "@/features/matches/live-match-model";
import { SoccerBallIcon, BootIcon } from "@/features/matches/match-icons";
import {
  LiveBenchRow,
  LivePitch,
  LivePitchPlayers,
} from "@/features/matches/live-tactical-view";
import "./LiveMatchPage.css";

type Period =
  "not_started" | "first_half" | "half_time" | "second_half" | "full_time";

type LogAction = Exclude<MatchEventType, "assist">;

type LogTarget =
  | { kind: "own"; athlete: MatchSquadAthlete }
  | { kind: "opp"; player: OpponentMatchPlayer }
  | { kind: "opp-generic" };

type Composer =
  | { kind: "closed" }
  | { kind: "penalty-outcome" }
  | {
      kind: "sub-in";
      team: MatchEventTeam;
      outgoing: MatchSquadAthlete | OpponentMatchPlayer | "generic";
    }
  | {
      kind: "mandatory-sub-in";
      team: MatchEventTeam;
      outgoing: MatchSquadAthlete | OpponentMatchPlayer | "generic";
    }
  | {
      kind: "sub-out";
      team: MatchEventTeam;
      incoming: MatchSquadAthlete | OpponentMatchPlayer;
    }
  | {
      kind: "assist-pick";
      team: MatchEventTeam;
      goalEventId: string;
      goalMinute: number;
      scorerAthleteId?: string;
      scorerOpponentPlayerId?: string;
    };

type SubIncomingComposer = Extract<
  Composer,
  { kind: "sub-in" | "mandatory-sub-in" }
>;

function isSubIncomingComposer(
  composer: Composer,
): composer is SubIncomingComposer {
  return composer.kind === "sub-in" || composer.kind === "mandatory-sub-in";
}

function mandatorySubInComposer(target: LogTarget): SubIncomingComposer {
  if (target.kind === "own") {
    return {
      kind: "mandatory-sub-in",
      team: "own",
      outgoing: target.athlete,
    };
  }
  if (target.kind === "opp") {
    return {
      kind: "mandatory-sub-in",
      team: "opponent",
      outgoing: target.player,
    };
  }
  return {
    kind: "mandatory-sub-in",
    team: "opponent",
    outgoing: "generic",
  };
}

type ConfirmKind = "pause" | "half" | "full" | null;

type PersistInput = {
  team: MatchEventTeam;
  eventType: MatchEventType;
  athleteId?: string;
  opponentLabel?: string;
  opponentPlayerId?: string;
  detail?: string;
  minute?: number;
  reassignId?: string;
};

function formatClock(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const FIRST_HALF_MS = 45 * 60_000;
const SECOND_HALF_MS = 90 * 60_000;

/**
 * How long the coach gets to respond at the 45:00 / 90:00 whistle before the
 * period ends on its own. Fires once per half — continuing hands control back
 * for the rest of that half.
 */
const CHECK_IN_MS = 90_000;

type CheckInPeriod = Extract<Period, "first_half" | "second_half">;

function regulationEndMs(period: Period) {
  if (period === "first_half") return FIRST_HALF_MS;
  if (period === "second_half") return SECOND_HALF_MS;
  return null;
}

function lastName(athlete: MatchSquadAthlete) {
  return athlete.lastName || athlete.firstName;
}

function shirtLabel(athlete: MatchSquadAthlete) {
  return athlete.squadNumber != null
    ? `#${athlete.squadNumber} ${lastName(athlete)}`
    : `${athlete.firstName} ${athlete.lastName}`.trim();
}

function opponentShirtLabel(
  player: OpponentMatchPlayer,
  visibility: "none" | "numbers" | "full",
) {
  if (visibility === "full" && player.name) {
    return `#${player.shirtNumber} ${player.name}`;
  }
  return `#${player.shirtNumber}`;
}

function substitutionIncoming(
  event: MatchLogEvent,
  squad: MatchSquadAthlete[],
  opponentSquad: OpponentMatchPlayer[],
) {
  if (event.eventType !== "substitution" || !event.detail) {
    return "";
  }
  if (event.team === "own") {
    const incoming = squad.find((athlete) => athlete.id === event.detail);
    return incoming ? ` → ${shirtLabel(incoming)}` : ` → ${event.detail}`;
  }
  const incoming = opponentSquad.find((player) => player.id === event.detail);
  return incoming
    ? ` → #${incoming.shirtNumber}${incoming.name ? ` ${incoming.name}` : ""}`
    : ` → ${event.detail}`;
}

function targetKey(target: LogTarget | null) {
  if (!target) {
    return null;
  }
  if (target.kind === "own") {
    return `own:${target.athlete.id}`;
  }
  if (target.kind === "opp") {
    return `opp:${target.player.id}`;
  }
  return "opp-generic";
}

function loggingForLabel(
  target: LogTarget | null,
  visibility: "none" | "numbers" | "full",
) {
  if (!target) {
    return "TAP A PLAYER";
  }
  if (target.kind === "own") {
    const number =
      target.athlete.squadNumber != null
        ? `#${target.athlete.squadNumber}`
        : "";
    return `LOGGING FOR ${number} ${lastName(target.athlete).toUpperCase()}`.replace(
      /\s+/g,
      " ",
    );
  }
  if (target.kind === "opp-generic") {
    return "LOGGING FOR OPPONENT";
  }
  return `LOGGING FOR ${opponentShirtLabel(target.player, visibility).toUpperCase()}`;
}

/**
 * Full-screen live logger with a persisted match clock shared across devices.
 */
export default function LiveMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { team } = useAuth();

  const matchQuery = useMatch(matchId);
  const clockAuthorityRevision = matchQuery.data?.updatedAt;
  const refetchMatch = matchQuery.refetch;
  const squadQuery = useMatchSquad(matchId);
  const eventsQuery = useMatchEvents(matchId);
  const gamePlanSnapshot = matchQuery.data?.gamePlanSnapshot ?? undefined;
  const gamePlanQuery = useGamePlan(
    gamePlanSnapshot ? undefined : (matchQuery.data?.gamePlanId ?? undefined),
  );
  const gamePlan = gamePlanSnapshot ?? gamePlanQuery.data;
  const logEvent = useLogMatchEvent(matchId ?? "");
  const updateEvent = useUpdateMatchEvent(matchId ?? "");
  const deleteEvent = useDeleteMatchEvent(matchId ?? "");
  const finishMatch = useFinishMatch(matchId ?? "");
  const finaliseProjection = useFinaliseMatchProjection(matchId ?? "");
  const reopenProjection = useReopenMatchProjection(matchId ?? "");
  const { mutateAsync: updateMatchClock } = useUpdateMatchClock(matchId ?? "");

  const [period, setPeriod] = useState<Period>("not_started");
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [checkIn, setCheckIn] = useState<{
    period: CheckInPeriod;
    endsAt: number;
  } | null>(null);
  const [checkInLeftMs, setCheckInLeftMs] = useState(CHECK_IN_MS);
  /** Periods whose end-of-regulation check-in has already been shown. */
  const checkedMarksRef = useRef(new Set<Period>());
  const baseRef = useRef(0);

  const [target, setTarget] = useState<LogTarget | null>(null);
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [composer, setComposer] = useState<Composer>({ kind: "closed" });
  useEffect(() => {
    console.log("[live-callout:render]", {
      kind: composer.kind,
      injuryBanner: isMandatorySubCallout(composer.kind),
      voluntarySubInBanner: isBenchIncomingCallout(composer.kind),
      subOutBanner: isSubOutCallout(composer.kind),
      assist: isAssistCallout(composer.kind),
      dimGrid: dimEventGridFor(composer.kind),
    });
  }, [composer]);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [offlineReadinessOpen, setOfflineReadinessOpen] = useState(false);
  const [toast, setToast] = useState<{
    id?: string;
    label: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const elapsedRef = useRef(0);
  const persistLockRef = useRef(false);
  const primedIdsRef = useRef(false);
  const knownIdsRef = useRef(new Set<string>());
  const lastAppliedClockRevisionRef = useRef<string | null>(null);
  const enteringIdsRef = useRef(new Set<string>());

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    const match = matchQuery.data;
    if (!match || lastAppliedClockRevisionRef.current === match.updatedAt)
      return;
    let cancelled = false;
    void (async () => {
      const local = matchId ? await readClockAnchor(matchId) : null;
      if (cancelled) return;
      if (match.eventStatus === "completed") {
        setPeriod("full_time");
        setRunning(false);
        lastAppliedClockRevisionRef.current = match.updatedAt;
        return;
      }
      const serverElapsed = Math.max(
        0,
        match.clockElapsedMs +
          (match.clockStartedAt
            ? Date.now() - new Date(match.clockStartedAt).getTime()
            : 0),
      );
      const useLocal = Boolean(
        matchId && local && isClockAnchorPending(matchId),
      );
      const elapsed = useLocal && local ? local.elapsedMs : serverElapsed;
      const nextPeriod = useLocal && local ? local.period : match.clockPeriod;
      const nextRunning =
        useLocal && local ? local.running : Boolean(match.clockStartedAt);
      if (local?.uncertain) {
        setActionError(
          "The offline match clock changed unexpectedly and was paused. Confirm the time before continuing.",
        );
      }
      baseRef.current = elapsed;
      elapsedRef.current = elapsed;
      setElapsedMs(elapsed);
      setPeriod(nextPeriod);
      const livePeriod =
        nextPeriod === "first_half" || nextPeriod === "second_half";
      const regulation =
        nextPeriod === "second_half" ? SECOND_HALF_MS : FIRST_HALF_MS;
      if (livePeriod && elapsed >= regulation) {
        checkedMarksRef.current.add(nextPeriod);
      }
      setRunning(nextRunning);
      lastAppliedClockRevisionRef.current = match.updatedAt;
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, matchQuery.data]);

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

  useEffect(() => {
    if (running) {
      return;
    }
    setEventPickerOpen(false);
    setComposer({ kind: "closed" });
  }, [running]);

  const squad = useMemo(() => squadQuery.data ?? [], [squadQuery.data]);
  const timeline = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const loggedGoalsOwn = timeline.filter(
    (event) => event.eventType === "goal" && event.team === "own",
  ).length;
  const loggedGoalsOpp = timeline.filter(
    (event) => event.eventType === "goal" && event.team === "opponent",
  ).length;
  const dismissedOwnIds = useMemo(
    () =>
      new Set(
        timeline
          .filter(
            (event) =>
              event.team === "own" &&
              event.eventType === "red_card" &&
              event.athleteId,
          )
          .map((event) => event.athleteId!),
      ),
    [timeline],
  );
  const dismissedOppIds = useMemo(
    () =>
      new Set(
        timeline
          .filter(
            (event) =>
              event.team === "opponent" &&
              event.eventType === "red_card" &&
              event.opponentPlayerId,
          )
          .map((event) => event.opponentPlayerId!),
      ),
    [timeline],
  );
  const assistsByGoal = useMemo(() => pairAssistsToGoals(timeline), [timeline]);
  const opponentSquad = useMemo(
    () => matchQuery.data?.opponentSquad ?? [],
    [matchQuery.data?.opponentSquad],
  );
  const visibility = matchQuery.data?.opponentSquadVisibility ?? "none";
  const currentMinute = Math.floor(elapsedMs / 60_000);

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

  const ownState = useMemo(
    () => ownPitchState(squad, timeline),
    [squad, timeline],
  );
  const oppState = useMemo(
    () => opponentPitchState(opponentSquad, timeline),
    [opponentSquad, timeline],
  );

  const ownName = team?.name ?? "US";
  const oppName = matchQuery.data?.opponentName ?? "OPP";
  const isHome = matchQuery.data?.isHome ?? true;
  const ownColor = resolveOwnColor(
    matchQuery.data?.teamColor,
    team?.primaryColor,
  );
  const oppColor = resolveOppColor(matchQuery.data?.opponentColor);
  const homeColor = isHome ? ownColor : oppColor;
  const awayColor = isHome ? oppColor : ownColor;
  const ownHalf = isHome ? "left" : "right";
  const oppHalf = isHome ? "right" : "left";
  // A reloaded offline page restores the last server score and the queued
  // timeline independently. Include locally queued goals without adding them
  // twice when the optimistic match cache already contains the same score.
  const teamScore = displayedGoalScore(
    matchQuery.data?.teamScore ?? 0,
    timeline,
    "own",
  );
  const oppScore = displayedGoalScore(
    matchQuery.data?.opponentScore ?? 0,
    timeline,
    "opponent",
  );
  const homeName = isHome ? ownName : oppName;
  const awayName = isHome ? oppName : ownName;
  const homeScore = isHome ? teamScore : oppScore;
  const awayScore = isHome ? oppScore : teamScore;
  const projection = matchQuery.data?.projection;
  const confirmedHomeScore = isHome
    ? projection?.confirmedTeamScore
    : projection?.confirmedOpponentScore;
  const confirmedAwayScore = isHome
    ? projection?.confirmedOpponentScore
    : projection?.confirmedTeamScore;
  const possibleGoalEffect =
    (projection?.possibleEffects.teamGoals ?? 0) +
    (projection?.possibleEffects.opponentGoals ?? 0);
  const homeAbbrev = teamAbbrev(homeName);
  const awayAbbrev = teamAbbrev(awayName);
  const ownAbbrev = teamAbbrev(ownName);
  const oppAbbrev = teamAbbrev(oppName);

  const ownPlaced = useMemo(
    () =>
      placeOwnPlayers(
        ownState.onPitch,
        gamePlan,
        ownHalf,
        timeline,
        visibility === "none" ? "own" : "full",
      ),
    [ownState.onPitch, gamePlan, ownHalf, timeline, visibility],
  );
  const oppPlaced = useMemo(
    () => placeOppPlayers(oppState.onPitch, oppHalf, timeline),
    [oppState.onPitch, oppHalf, timeline],
  );
  const ownPitchIds = useMemo(
    () => new Set(ownPlaced.map((placed) => placed.athlete.id)),
    [ownPlaced],
  );
  const oppPitchIds = useMemo(
    () => new Set(oppPlaced.map((placed) => placed.player.id)),
    [oppPlaced],
  );
  const ownBench = useMemo(() => {
    const overflow = ownState.onPitch.filter(
      (athlete) => !ownPitchIds.has(athlete.id),
    );
    return [
      ...ownState.bench.filter((athlete) => !ownPitchIds.has(athlete.id)),
      ...overflow,
    ];
  }, [ownState.bench, ownState.onPitch, ownPitchIds]);
  const oppBench = useMemo(() => {
    const overflow = oppState.onPitch.filter(
      (player) => !oppPitchIds.has(player.id),
    );
    return [
      ...oppState.bench.filter((player) => !oppPitchIds.has(player.id)),
      ...overflow,
    ];
  }, [oppState.bench, oppState.onPitch, oppPitchIds]);

  const runningScores = useMemo(
    () => runningScoreByEvent(timeline, isHome),
    [timeline, isHome],
  );

  const persistClock = useCallback(
    (nextPeriod: Period, nextRunning: boolean, elapsed: number) => {
      if (!matchId) return;
      void (async () => {
        const version = await saveClockAnchor(matchId, {
          period: nextPeriod,
          running: nextRunning,
          elapsedMs: elapsed,
          authorityRevision: clockAuthorityRevision ?? "offline",
        });
        if (!navigator.onLine) return;
        try {
          await updateMatchClock({
            period: nextPeriod,
            running: nextRunning,
            elapsedMs: elapsed,
          });
          markClockAnchorSynced(matchId, version);
          lastAppliedClockRevisionRef.current = null;
          await refetchMatch();
        } catch (error) {
          if (navigator.onLine) {
            setActionError(
              error instanceof Error
                ? error.message
                : "Could not save the match clock.",
            );
          }
        }
      })();
    },
    [
      matchId,
      clockAuthorityRevision,
      refetchMatch,
      updateMatchClock,
    ],
  );

  useEffect(() => {
    if (!matchId) return;
    const flushPendingClock = () => {
      if (!navigator.onLine || !isClockAnchorPending(matchId)) return;
      void (async () => {
        const anchor = await readClockAnchor(matchId);
        if (!anchor || anchor.uncertain) return;
        try {
          await updateMatchClock({
            period: anchor.period,
            running: anchor.running,
            elapsedMs: anchor.elapsedMs,
          });
          markClockAnchorSynced(matchId, anchor.updatedAt);
          lastAppliedClockRevisionRef.current = null;
          await refetchMatch();
        } catch (error) {
          setActionError(
            error instanceof Error
              ? error.message
              : "Could not synchronise the match clock.",
          );
        }
      })();
    };
    window.addEventListener("online", flushPendingClock);
    flushPendingClock();
    return () => window.removeEventListener("online", flushPendingClock);
  }, [matchId, refetchMatch, updateMatchClock]);

  const startClock = () => {
    setRunning(true);
    persistClock(period, true, elapsedRef.current);
  };

  const pauseClock = () => {
    setRunning(false);
    baseRef.current = elapsedRef.current;
    persistClock(period, false, elapsedRef.current);
  };

  const startFirstHalf = () => {
    baseRef.current = 0;
    elapsedRef.current = 0;
    setElapsedMs(0);
    checkedMarksRef.current.clear();
    setCheckIn(null);
    setPeriod("first_half");
    setRunning(true);
    persistClock("first_half", true, 0);
  };

  const goHalfTime = useCallback(() => {
    setRunning(false);
    baseRef.current = elapsedRef.current;
    setCheckIn(null);
    setPeriod("half_time");
    persistClock("half_time", false, elapsedRef.current);
    setConfirm(null);
    setSettingsOpen(false);
  }, [persistClock]);

  const startSecondHalf = () => {
    if (baseRef.current < FIRST_HALF_MS) {
      baseRef.current = FIRST_HALF_MS;
      elapsedRef.current = baseRef.current;
      setElapsedMs(baseRef.current);
    }
    setCheckIn(null);
    setPeriod("second_half");
    setRunning(true);
    persistClock("second_half", true, elapsedRef.current);
  };

  const goFullTime = useCallback(() => {
    setRunning(false);
    baseRef.current = elapsedRef.current;
    setCheckIn(null);
    setPeriod("full_time");
    persistClock("full_time", false, elapsedRef.current);
    setConfirm(null);
    setSettingsOpen(false);
  }, [persistClock]);

  const backToFirstHalf = () => {
    // The 45:00 check-in is deliberately left spent: the clock is already past
    // the mark, so re-arming it would fire again immediately.
    setCheckIn(null);
    setPeriod("first_half");
    setRunning(true);
    persistClock("first_half", true, elapsedRef.current);
  };

  const dismissCheckIn = useCallback(() => {
    // The clock was never stopped, so play simply continues into added time.
    setCheckIn(null);
  }, []);

  // Any key counts as the coach responding, same as tapping the screen.
  useEffect(() => {
    if (!checkIn) {
      return;
    }
    window.addEventListener("keydown", dismissCheckIn);
    return () => window.removeEventListener("keydown", dismissCheckIn);
  }, [checkIn, dismissCheckIn]);

  // Arm the one-time check-in the moment regulation time is reached.
  useEffect(() => {
    if (!running || checkIn) {
      return;
    }
    if (period !== "first_half" && period !== "second_half") {
      return;
    }
    const regulation = regulationEndMs(period);
    if (regulation === null || elapsedMs < regulation) {
      return;
    }
    if (checkedMarksRef.current.has(period)) {
      return;
    }
    checkedMarksRef.current.add(period);
    setCheckInLeftMs(CHECK_IN_MS);
    setCheckIn({ period, endsAt: Date.now() + CHECK_IN_MS });
  }, [elapsedMs, running, period, checkIn]);

  useEffect(() => {
    if (!checkIn) {
      return;
    }
    const tick = () =>
      setCheckInLeftMs(Math.max(0, checkIn.endsAt - Date.now()));
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [checkIn]);

  // No response in time: end the period exactly as the coach's own button would.
  useEffect(() => {
    if (!checkIn || checkInLeftMs > 0) {
      return;
    }
    if (checkIn.period === "first_half") {
      goHalfTime();
    } else {
      goFullTime();
      setEndOpen(true);
    }
  }, [checkIn, checkInLeftMs, goHalfTime, goFullTime]);

  const closeComposer = useCallback(() => {
    setComposer({ kind: "closed" });
  }, []);

  const persistEvent = useCallback(
    async (input: PersistInput) => {
      if (!matchId || persistLockRef.current) {
        return;
      }
      const dismissed =
        (input.team === "own" &&
          Boolean(input.athleteId && dismissedOwnIds.has(input.athleteId))) ||
        (input.team === "opponent" &&
          Boolean(
            input.opponentPlayerId &&
            dismissedOppIds.has(input.opponentPlayerId),
          ));
      if (dismissed) {
        closeComposer();
        setEventPickerOpen(false);
        setActionError(
          "That player has been sent off. Undo the red card before logging another action.",
        );
        return;
      }
      persistLockRef.current = true;
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
          input.opponentPlayerId,
        )
      ) {
        eventType = "red_card";
        detail = SECOND_YELLOW_DETAIL;
      }

      const canSelectOpponentTeammate =
        input.team !== "opponent" ||
        (visibility !== "none" && opponentSquad.length > 0);
      const keepComposerForFollowUp =
        (eventType === "injury" && canSelectOpponentTeammate) ||
        (eventType === "goal" &&
          detail !== PENALTY_SCORED_DETAIL &&
          canSelectOpponentTeammate);
      if (!keepComposerForFollowUp) {
        closeComposer();
      }

      try {
        if (input.reassignId) {
          await updateEvent.mutateAsync({
            eventId: input.reassignId,
            input: {
              athleteId: input.athleteId ?? null,
              opponentLabel: input.opponentLabel ?? null,
              opponentPlayerId: input.opponentPlayerId ?? null,
            },
          });
        } else {
          const created = await logEvent.mutateAsync({
            clientRequestId: crypto.randomUUID(),
            clientCreatedAt: new Date().toISOString(),
            period,
            matchElapsedMs: elapsedRef.current,
            team: input.team,
            eventType,
            minute: input.minute ?? currentMinute,
            ...(input.athleteId ? { athleteId: input.athleteId } : {}),
            ...(input.opponentLabel
              ? { opponentLabel: input.opponentLabel }
              : {}),
            ...(input.opponentPlayerId
              ? { opponentPlayerId: input.opponentPlayerId }
              : {}),
            ...(detail ? { detail } : {}),
          });
          const label = eventDisplayLabel({
            eventType,
            detail: detail ?? null,
          });
          setToast({
            id: created.id,
            label:
              created.syncStatus && created.syncStatus !== "synced"
                ? `${label} saved on this device`
                : `${label} logged`,
          });
          window.setTimeout(() => setToast(null), 5000);
          if (eventType === "injury" && canSelectOpponentTeammate) {
            console.log("[live-callout:persist]", {
              eventType,
              nextKind: "mandatory-sub-in",
            });
            if (input.team === "own" && input.athleteId) {
              const outgoing = squad.find(
                (athlete) => athlete.id === input.athleteId,
              );
              if (outgoing) {
                setComposer({
                  kind: "mandatory-sub-in",
                  team: "own",
                  outgoing,
                });
              }
            } else if (input.team === "opponent") {
              const outgoing =
                opponentSquad.find(
                  (player) => player.id === input.opponentPlayerId,
                ) ?? "generic";
              setComposer({
                kind: "mandatory-sub-in",
                team: "opponent",
                outgoing,
              });
            }
          } else if (
            eventType === "goal" &&
            detail !== PENALTY_SCORED_DETAIL &&
            canSelectOpponentTeammate
          ) {
            console.log("[live-callout:persist]", {
              eventType,
              nextKind: "assist-pick",
            });
            setComposer({
              kind: "assist-pick",
              team: input.team,
              goalEventId: created.id,
              goalMinute: created.minute,
              scorerAthleteId: input.athleteId,
              scorerOpponentPlayerId: input.opponentPlayerId,
            });
          }
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not save this event. Please try again.";
        setActionError(message);
        setToast({ label: message });
        window.setTimeout(() => setToast(null), 5000);
        if (keepComposerForFollowUp) {
          closeComposer();
        }
      } finally {
        persistLockRef.current = false;
      }
    },
    [
      matchId,
      currentMinute,
      period,
      timeline,
      dismissedOwnIds,
      dismissedOppIds,
      squad,
      opponentSquad,
      visibility,
      logEvent,
      updateEvent,
      closeComposer,
    ],
  );

  const persistFromTarget = (eventType: LogAction, detail?: string) => {
    if (!target) {
      setActionError("Select a player first.");
      return;
    }
    if (persistLockRef.current) {
      return;
    }
    if (target.kind === "own") {
      void persistEvent({
        team: "own",
        eventType,
        athleteId: target.athlete.id,
        detail,
      });
      return;
    }
    if (target.kind === "opp") {
      void persistEvent({
        team: "opponent",
        eventType,
        opponentPlayerId: target.player.id,
        opponentLabel: opponentShirtLabel(target.player, visibility),
        detail,
      });
      return;
    }
    void persistEvent({
      team: "opponent",
      eventType,
      opponentLabel: oppName,
      detail,
    });
  };

  const handleAction = (eventType: LogAction) => {
    if (!target) {
      setActionError("Tap a player marker to log an event.");
      return;
    }
    setEventPickerOpen(false);
    setActionError(null);
    const benchTarget =
      (target.kind === "own" && !ownPitchIds.has(target.athlete.id)) ||
      (target.kind === "opp" && !oppPitchIds.has(target.player.id));
    if (
      benchTarget &&
      (eventType === "goal" ||
        eventType === "key_pass" ||
        eventType === "penalty" ||
        eventType === "injury")
    ) {
      setActionError(
        "That event can only be logged for a player on the pitch.",
      );
      return;
    }
    console.log("[live-callout:handleAction]", eventType);
    if (eventType === "substitution") {
      if (target.kind === "opp-generic") {
        persistFromTarget("substitution");
        return;
      }
      if (target.kind === "own") {
        if (ownPitchIds.has(target.athlete.id)) {
          const next = {
            kind: "sub-in" as const,
            team: "own" as const,
            outgoing: target.athlete,
          };
          console.log("[live-callout:sub-button] setting composer", next.kind);
          setComposer(next);
          return;
        }
        const next = {
          kind: "sub-out" as const,
          team: "own" as const,
          incoming: target.athlete,
        };
        console.log("[live-callout:sub-button] setting composer", next.kind);
        setComposer(next);
        return;
      }
      if (target.kind === "opp") {
        if (oppPitchIds.has(target.player.id)) {
          const next = {
            kind: "sub-in" as const,
            team: "opponent" as const,
            outgoing: target.player,
          };
          console.log("[live-callout:sub-button] setting composer", next.kind);
          setComposer(next);
          return;
        }
        const next = {
          kind: "sub-out" as const,
          team: "opponent" as const,
          incoming: target.player,
        };
        console.log("[live-callout:sub-button] setting composer", next.kind);
        setComposer(next);
        return;
      }
      const next = {
        kind: "sub-in" as const,
        team: "opponent" as const,
        outgoing: "generic" as const,
      };
      console.log("[live-callout:sub-button] setting composer", next.kind);
      setComposer(next);
      return;
    }
    if (eventType === "injury") {
      if (target.kind === "opp-generic") {
        persistFromTarget("injury");
        return;
      }
      const next = mandatorySubInComposer(target);
      console.log("[live-callout:handleAction] opening", next.kind);
      setComposer(next);
      persistFromTarget("injury");
      return;
    }
    if (eventType === "penalty") {
      setComposer({ kind: "penalty-outcome" });
      return;
    }
    persistFromTarget(eventType);
  };

  const skipAssist = () => {
    setComposer({ kind: "closed" });
  };

  const completeAssist = (
    incoming: MatchSquadAthlete | OpponentMatchPlayer,
  ) => {
    if (composer.kind !== "assist-pick") {
      return;
    }
    if (composer.team === "own" && "firstName" in incoming) {
      if (incoming.id === composer.scorerAthleteId) {
        setActionError("Pick a teammate, or skip.");
        return;
      }
      if (!ownPitchIds.has(incoming.id)) {
        setActionError("Pick a teammate on the pitch, or skip.");
        return;
      }
      void persistEvent({
        team: "own",
        eventType: "assist",
        athleteId: incoming.id,
        detail: composer.goalEventId,
        minute: composer.goalMinute,
      });
      return;
    }
    if (composer.team === "opponent" && "shirtNumber" in incoming) {
      if (incoming.id === composer.scorerOpponentPlayerId) {
        setActionError("Pick a teammate, or skip.");
        return;
      }
      if (!oppPitchIds.has(incoming.id)) {
        setActionError("Pick a teammate on the pitch, or skip.");
        return;
      }
      void persistEvent({
        team: "opponent",
        eventType: "assist",
        opponentPlayerId: incoming.id,
        opponentLabel: opponentShirtLabel(incoming, visibility),
        detail: composer.goalEventId,
        minute: composer.goalMinute,
      });
    }
  };

  const completeSubOut = (
    outgoing: MatchSquadAthlete | OpponentMatchPlayer,
  ) => {
    if (composer.kind !== "sub-out") {
      return;
    }
    if (composer.team === "own" && "firstName" in outgoing) {
      const incoming = composer.incoming as MatchSquadAthlete;
      void persistEvent({
        team: "own",
        eventType: "substitution",
        athleteId: outgoing.id,
        detail: incoming.id,
      });
      return;
    }
    if (composer.team === "opponent" && "shirtNumber" in outgoing) {
      const incoming = composer.incoming;
      if (!("shirtNumber" in incoming)) {
        return;
      }
      void persistEvent({
        team: "opponent",
        eventType: "substitution",
        opponentPlayerId: outgoing.id,
        opponentLabel: opponentShirtLabel(outgoing, visibility),
        detail: incoming.id,
      });
    }
  };

  const completeSubIn = (incoming: MatchSquadAthlete | OpponentMatchPlayer) => {
    if (composer.kind !== "sub-in" && composer.kind !== "mandatory-sub-in") {
      return;
    }
    if (composer.team === "own" && "firstName" in incoming) {
      const outgoing = composer.outgoing as MatchSquadAthlete;
      void persistEvent({
        team: "own",
        eventType: "substitution",
        athleteId: outgoing.id,
        detail: incoming.id,
      });
      return;
    }
    if (composer.team === "opponent" && "shirtNumber" in incoming) {
      const outgoing = composer.outgoing;
      void persistEvent({
        team: "opponent",
        eventType: "substitution",
        opponentPlayerId:
          outgoing !== "generic" && "shirtNumber" in outgoing
            ? outgoing.id
            : undefined,
        opponentLabel:
          outgoing !== "generic" && "shirtNumber" in outgoing
            ? opponentShirtLabel(outgoing, visibility)
            : oppName,
        detail: incoming.id,
      });
    }
  };

  const selectOwn = (athlete: MatchSquadAthlete) => {
    if (dismissedOwnIds.has(athlete.id)) {
      setComposer({ kind: "closed" });
      setTarget(null);
      setEventPickerOpen(false);
      setActionError(
        "That player has been sent off. Undo the red card before logging another action.",
      );
      return;
    }
    if (composer.kind === "assist-pick" && composer.team === "own") {
      completeAssist(athlete);
      return;
    }
    if (
      isSubIncomingComposer(composer) &&
      composer.team === "own" &&
      ownBench.some((player) => player.id === athlete.id)
    ) {
      completeSubIn(athlete);
      return;
    }
    if (
      composer.kind === "sub-out" &&
      composer.team === "own" &&
      ownPitchIds.has(athlete.id)
    ) {
      completeSubOut(athlete);
      return;
    }
    setComposer({ kind: "closed" });
    setTarget({ kind: "own", athlete });
    setEventPickerOpen(period === "first_half" || period === "second_half");
    setActionError(null);
  };

  const selectOpp = (player: OpponentMatchPlayer) => {
    if (dismissedOppIds.has(player.id)) {
      setComposer({ kind: "closed" });
      setTarget(null);
      setEventPickerOpen(false);
      setActionError(
        "That player has been sent off. Undo the red card before logging another action.",
      );
      return;
    }
    if (composer.kind === "assist-pick" && composer.team === "opponent") {
      completeAssist(player);
      return;
    }
    if (
      isSubIncomingComposer(composer) &&
      composer.team === "opponent" &&
      oppBench.some((item) => item.id === player.id)
    ) {
      completeSubIn(player);
      return;
    }
    if (
      composer.kind === "sub-out" &&
      composer.team === "opponent" &&
      oppPitchIds.has(player.id)
    ) {
      completeSubOut(player);
      return;
    }
    setComposer({ kind: "closed" });
    setTarget({ kind: "opp", player });
    setEventPickerOpen(period === "first_half" || period === "second_half");
    setActionError(null);
  };

  const handleUndo = async (eventId: string) => {
    setActionError(null);
    const targetEvent = timeline.find((event) => event.id === eventId);
    const linkedAssists = linkedAssistsForGoal(timeline, targetEvent);
    try {
      await deleteEvent.mutateAsync(eventId);
      for (const assist of linkedAssists) {
        await deleteEvent.mutateAsync(assist.id);
      }
      if (composer.kind === "assist-pick" && composer.goalEventId === eventId) {
        setComposer({ kind: "closed" });
      }
      setToast(null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not undo this event.";
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
        err instanceof ApiError ? err.message : "Could not finish this match.",
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

  const liveLogging = period === "first_half" || period === "second_half";
  const regulation = regulationEndMs(period);
  // Broadcast style: 45:00 reads "+1", 46:00 reads "+2".
  const addedStoppageMin =
    regulation && elapsedMs >= regulation
      ? Math.floor((elapsedMs - regulation) / 60_000) + 1
      : 0;
  const selectedKey = targetKey(target);
  const logEnabled = liveLogging && Boolean(target);
  const targetIsBench =
    (target?.kind === "own" && !ownPitchIds.has(target.athlete.id)) ||
    (target?.kind === "opp" && !oppPitchIds.has(target.player.id));
  const pitchLogEnabled = logEnabled && !targetIsBench;
  const benchIncomingCallout = isBenchIncomingCallout(composer.kind);
  const subOutCallout = composer.kind === "sub-out";
  const assistPick = composer.kind === "assist-pick";
  const ownBenchCallToAction =
    (composer.kind === "mandatory-sub-in" || composer.kind === "sub-in") &&
    composer.team === "own";
  const oppBenchCallToAction =
    (composer.kind === "mandatory-sub-in" || composer.kind === "sub-in") &&
    composer.team === "opponent";
  const assistHighlightOwnIds =
    assistPick && composer.team === "own"
      ? new Set(
          ownPlaced
            .filter((placed) => placed.athlete.id !== composer.scorerAthleteId)
            .map((placed) => placed.athlete.id),
        )
      : undefined;
  const assistHighlightOppIds =
    assistPick && composer.team === "opponent"
      ? new Set(
          oppPlaced
            .filter(
              (placed) => placed.player.id !== composer.scorerOpponentPlayerId,
            )
            .map((placed) => placed.player.id),
        )
      : undefined;
  const subOutHighlightOwnIds =
    subOutCallout && composer.team === "own"
      ? new Set(ownPlaced.map((placed) => placed.athlete.id))
      : undefined;
  const subOutHighlightOppIds =
    subOutCallout && composer.team === "opponent"
      ? new Set(oppPlaced.map((placed) => placed.player.id))
      : undefined;
  const pitchCallOwnIds = assistHighlightOwnIds ?? subOutHighlightOwnIds;
  const pitchCallOppIds = assistHighlightOppIds ?? subOutHighlightOppIds;
  const pitchCallTone = assistPick ? "assist" : "warning";

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
          <p className="font-oswald text-xl tracking-wide">
            FAILED TO LOAD MATCH
          </p>
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
    <div className="live-match relative flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <SportLogo size={36} className="rounded-lg" />
          <h1 className="font-display text-base font-bold tracking-wide text-[#00d99a]">
            GAFFER
          </h1>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#233747] px-2.5 py-1.5 text-xs font-semibold text-[#c5ced6] hover:border-[#00d99a]/60 hover:text-white"
          >
            <LayoutDashboard className="size-3.5" aria-hidden="true" />
            <span>Dashboard</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {matchId ? <OfflineSyncStatus matchId={matchId} /> : null}
          <div className="relative">
            <button
              type="button"
              aria-label="Match settings"
              className="rounded-md p-2 text-[#c5ced6] hover:bg-white/5"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings className="size-5" />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-[#1c2b36] bg-[#101920] p-2 shadow-xl">
                {team?.role === "coach" ? (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      setReviewOpen(true);
                    }}
                  >
                    Review duplicates
                  </SettingsItem>
                ) : null}
                <SettingsItem
                  onClick={() => {
                    setSettingsOpen(false);
                    setOfflineReadinessOpen(true);
                  }}
                >
                  Prepare for offline use
                </SettingsItem>
                {team?.role === "coach" &&
                period === "full_time" &&
                matchQuery.data?.projection?.finalisationState === "open" ? (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      const projection = matchQuery.data?.projection;
                      if (!projection) return;
                      finaliseProjection.mutate(projection.revision, {
                        onSuccess: () =>
                          setToast({ label: "Result finalised" }),
                        onError: (error) =>
                          setActionError(
                            error instanceof Error
                              ? error.message
                              : "Could not finalise the result.",
                          ),
                      });
                    }}
                  >
                    Finalise result
                  </SettingsItem>
                ) : null}
                {team?.role === "coach" &&
                matchQuery.data?.projection &&
                matchQuery.data.projection.finalisationState !== "open" ? (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      reopenProjection.mutate(
                        "Coach reopened the published result for amendment.",
                        {
                          onSuccess: () =>
                            setToast({ label: "Result reopened" }),
                          onError: (error) =>
                            setActionError(
                              error instanceof Error
                                ? error.message
                                : "Could not reopen the result.",
                            ),
                        },
                      );
                    }}
                  >
                    Reopen result
                  </SettingsItem>
                ) : null}
                {period === "not_started" && (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      startFirstHalf();
                    }}
                  >
                    Start game
                  </SettingsItem>
                )}
                {liveLogging && !checkIn && (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      setConfirm("pause");
                    }}
                  >
                    {running ? "Pause time" : "Resume time"}
                  </SettingsItem>
                )}
                {period === "first_half" && (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      setConfirm("half");
                    }}
                  >
                    Half time
                  </SettingsItem>
                )}
                {period === "half_time" && (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      startSecondHalf();
                    }}
                  >
                    Start 2nd half
                  </SettingsItem>
                )}
                {period === "second_half" && (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      setConfirm("full");
                    }}
                  >
                    Full time
                  </SettingsItem>
                )}
              </div>
            )}
          </div>
          {liveLogging && !checkIn && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-[#1c2b36] px-3 py-1.5 text-xs font-semibold tracking-wide text-white sm:px-4 sm:text-sm"
              onClick={() => {
                if (running) {
                  pauseClock();
                } else {
                  startClock();
                }
              }}
            >
              {running ? (
                <Pause className="size-3.5 sm:size-4" />
              ) : (
                <Play className="size-3.5 sm:size-4" />
              )}
              {running ? "Pause" : "Resume"}
            </button>
          )}
          {liveLogging && period === "first_half" && (
            <button
              type="button"
              className="rounded-md bg-[#3b82f6] px-3 py-1.5 text-xs font-semibold tracking-wide text-white sm:px-4 sm:text-sm"
              onClick={() => setConfirm("half")}
            >
              Half Time
            </button>
          )}
          <button
            type="button"
            className="rounded-md bg-[#e23d3d] px-3 py-1.5 text-xs font-semibold tracking-wide text-white sm:px-4 sm:text-sm"
            onClick={() => {
              if (period !== "full_time") {
                goFullTime();
              }
              setEndOpen(true);
            }}
          >
            End Match
          </button>
        </div>
      </header>

      {reviewOpen && matchId ? (
        <EventReviewPanel
          matchId={matchId}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}
      {offlineReadinessOpen && matchId ? (
        <OfflineReadinessPanel
          matchId={matchId}
          onClose={() => setOfflineReadinessOpen(false)}
        />
      ) : null}

      <div className="live-match-layout min-h-0 flex-1 gap-3 px-3 pb-3 pt-0 sm:px-4">
        <div className="live-match-score mx-auto w-full max-w-5xl shrink-0">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="flex flex-col items-end">
              <p className="live-match-team-code font-oswald text-lg tracking-[0.14em] text-white sm:text-xl">
                {homeAbbrev}
              </p>
              <span
                className="mt-0.5 h-0.5 w-10 rounded-full sm:w-14"
                style={{ backgroundColor: homeColor }}
              />
            </div>
            <p className="live-match-scoreline font-oswald text-4xl leading-none tabular-nums sm:text-5xl">
              <span style={{ color: homeColor }}>{homeScore}</span>
              <span className="mx-1.5 text-2xl text-[#8e9ba8]">-</span>
              <span style={{ color: awayColor }}>{awayScore}</span>
            </p>
            <div className="flex flex-col items-start">
              <p className="live-match-team-code font-oswald text-lg tracking-[0.14em] text-white sm:text-xl">
                {awayAbbrev}
              </p>
              <span
                className="mt-0.5 h-0.5 w-10 rounded-full sm:w-14"
                style={{ backgroundColor: awayColor }}
              />
            </div>
          </div>
          {projection ? (
            <div className="mt-1 flex justify-center">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
                  projection.finalisationState === "finalised"
                    ? "bg-[#00d99a]/12 text-[#00d99a]"
                    : projection.unresolvedReviewCount > 0 ||
                        projection.finalisationState === "amendment_required"
                      ? "bg-[#ffbe2e]/12 text-[#ffbe2e]"
                      : "bg-[#5d6b76]/15 text-[#9fadb8]",
                )}
              >
                {projection.finalisationState === "finalised"
                  ? `Final result · revision ${projection.revision}`
                  : projection.finalisationState === "amendment_required"
                    ? "Result changed · amendment review required"
                    : projection.unresolvedReviewCount > 0
                      ? `Provisional · confirmed ${confirmedHomeScore}-${confirmedAwayScore} · ${projection.unresolvedReviewCount} review${projection.unresolvedReviewCount === 1 ? "" : "s"}${possibleGoalEffect ? ` · possible ${possibleGoalEffect} goal effect` : ""}`
                      : `Live provisional · revision ${projection.revision}`}
              </span>
            </div>
          ) : null}
          <div className="mt-1.5 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#1c2b36] bg-[#0c1218] px-3 py-0.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  running ? "animate-pulse bg-[#ff5b5f]" : "bg-[#5d6b76]",
                )}
              />
              <span className="font-oswald text-sm tabular-nums tracking-wide text-white">
                {formatClock(elapsedMs)}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8e9ba8]">
                {periodLabel}
              </span>
              {addedStoppageMin > 0 ? (
                <span className="rounded-full bg-[#ffbe2e]/15 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.12em] text-[#ffbe2e]">
                  +{addedStoppageMin}
                </span>
              ) : null}
            </span>
          </div>

          {period === "full_time" && (
            <PeriodSummary
              title="FULL TIME"
              ownName={ownName}
              oppName={oppName}
              timeline={timeline}
              onContinue={() => setEndOpen(true)}
              continueLabel="END MATCH & SAVE REPORT"
              continueDisabled={
                match.eventStatus === "completed" || finishMatch.isPending
              }
              compact
            />
          )}

          {actionError && (
            <p
              role="alert"
              className="shrink-0 text-center text-xs text-[#ff5b5f]"
            >
              {actionError}
            </p>
          )}
        </div>

        <section className="live-match-pitch-area flex min-h-0 flex-col">
          <h2 className="mb-1 shrink-0 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
            Tactical view
          </h2>
          <div className="relative min-h-0 flex-1">
            <LivePitch
              className="live-pitch-panel-landscape"
              layout="full"
              ownHalf={ownHalf}
              ownColor={ownColor}
              oppColor={oppColor}
            >
              <LivePitchPlayers
                ownPlaced={ownPlaced}
                oppPlaced={oppPlaced}
                ownColor={ownColor}
                oppColor={oppColor}
                visibility={visibility}
                timeline={timeline}
                selectedKey={selectedKey}
                onSelectOwn={selectOwn}
                onSelectOpp={selectOpp}
                callToActionOwnIds={pitchCallOwnIds}
                callToActionOppIds={pitchCallOppIds}
                callToActionTone={pitchCallTone}
              />
              {visibility === "none" && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      isAssistCallout(composer.kind) ||
                      isBenchIncomingCallout(composer.kind) ||
                      isSubOutCallout(composer.kind)
                    ) {
                      return;
                    }
                    setComposer({ kind: "closed" });
                    setTarget({ kind: "opp-generic" });
                    setEventPickerOpen(liveLogging);
                    setActionError(null);
                  }}
                  className={cn(
                    "absolute top-2 rounded-full border border-white/35 bg-[#123528]/80 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/90 shadow-sm backdrop-blur-[1px]",
                    "hover:border-white/60 hover:bg-[#1b4d36]/90",
                    isHome ? "right-2" : "left-2",
                    selectedKey === "opp-generic" &&
                      "border-[#00d99a] text-[#00d99a] ring-1 ring-[#00d99a]/70",
                  )}
                >
                  {oppAbbrev} · log opponent
                </button>
              )}
            </LivePitch>
          </div>
        </section>

        <section
          className={cn(
            "live-match-bench-area grid min-h-0 grid-cols-2 gap-1 rounded-xl border bg-[#0c1218] px-1.5 py-2",
            benchIncomingCallout || subOutCallout
              ? "border-[#ffbe2e]/55"
              : assistPick
                ? "border-[#00d99a]/40"
                : "border-[#1c2b36]",
          )}
        >
          <LiveBenchRow
            label={`${ownAbbrev} bench`}
            color={ownColor}
            athletes={ownBench}
            timeline={timeline}
            selectedKey={selectedKey}
            onSelectOwn={selectOwn}
            callToAction={ownBenchCallToAction}
            align="left"
          />
          <LiveBenchRow
            label={`${oppAbbrev} bench`}
            color={oppColor}
            opponents={oppBench}
            visibility={visibility}
            timeline={timeline}
            selectedKey={selectedKey}
            onSelectOpp={selectOpp}
            callToAction={oppBenchCallToAction}
            align="right"
          />
        </section>

        {composer.kind === "mandatory-sub-in" || composer.kind === "sub-in" ? (
          <div
            role="alert"
            data-callout={
              composer.kind === "mandatory-sub-in"
                ? "mandatory-sub"
                : "voluntary-sub-in"
            }
            className="live-match-callout live-callout-banner flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-3"
          >
            <span className="relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ffbe2e]/20 text-[#ffbe2e]">
              {composer.kind === "mandatory-sub-in" ? (
                <HeartPulse className="size-5" aria-hidden="true" />
              ) : (
                <ArrowLeftRight className="size-5" aria-hidden="true" />
              )}
            </span>
            <div className="relative z-[1] min-w-0">
              <p className="font-oswald text-sm tracking-[0.22em] text-[#ffbe2e]">
                {composer.kind === "mandatory-sub-in"
                  ? "SUBSTITUTION REQUIRED"
                  : "PICK WHO COMES ON"}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#e8ecef]">
                Tap a {composer.team === "own" ? ownAbbrev : oppAbbrev} bench
                player to come on
                {composer.team === "opponent" && visibility === "none"
                  ? " — no opponent bench is available"
                  : ""}
                .
              </p>
            </div>
          </div>
        ) : null}

        {composer.kind === "sub-out" ? (
          <div
            role="alert"
            data-callout="voluntary-sub-out"
            className="live-match-callout live-callout-banner flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-3"
          >
            <span className="relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ffbe2e]/20 text-[#ffbe2e]">
              <ArrowLeftRight className="size-5" aria-hidden="true" />
            </span>
            <div className="relative z-[1] min-w-0">
              <p className="font-oswald text-sm tracking-[0.22em] text-[#ffbe2e]">
                PICK WHO COMES OFF
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#e8ecef]">
                Tap the {composer.team === "own" ? ownAbbrev : oppAbbrev} player
                coming off the pitch.
              </p>
            </div>
          </div>
        ) : null}

        {composer.kind === "assist-pick" && (
          <div
            role="status"
            data-callout="assist-pick"
            className="live-match-callout live-callout-banner live-callout-banner-assist flex shrink-0 flex-wrap items-center gap-3 rounded-xl px-3.5 py-3"
          >
            <span className="relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full bg-[#3b82f6]/20 text-[#60a5fa]">
              <BootIcon className="size-5" />
            </span>
            <div className="relative z-[1] min-w-0 flex-1">
              <p className="font-oswald text-sm tracking-[0.22em] text-[#60a5fa]">
                GOAL LOGGED — SELECT THE ASSIST
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#e8ecef]">
                Tap the assisting teammate on the pitch, or choose no assist.
              </p>
            </div>
            <button
              type="button"
              className="relative z-[1] rounded-lg border border-[#60a5fa]/70 px-3 py-1.5 font-oswald text-[10px] tracking-widest text-[#93c5fd]"
              onClick={skipAssist}
            >
              NO ASSIST
            </button>
          </div>
        )}

        <div className="live-match-activity min-h-0">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#1c2b36] bg-[#0c1218] p-2.5">
            <h2 className="shrink-0 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
              Match log
            </h2>
            {timeline.length === 0 ? (
              <p className="mt-3 text-center text-sm text-[#8e9ba8]">
                No events yet.
              </p>
            ) : (
              <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden">
                {timeline
                  .filter((event) => !isPairedAssistEvent(event, assistsByGoal))
                  .map((event) => {
                    const who = event.athlete
                      ? shirtLabel(event.athlete)
                      : event.opponentPlayer
                        ? opponentShirtLabel(event.opponentPlayer, visibility)
                        : (event.opponentLabel ?? "Unassigned");
                    const assist =
                      event.eventType === "goal"
                        ? assistsByGoal.get(event.id)
                        : undefined;
                    const assistWho = assist
                      ? assist.athlete
                        ? shirtLabel(assist.athlete)
                        : assist.opponentPlayer
                          ? opponentShirtLabel(
                              assist.opponentPlayer,
                              visibility,
                            )
                          : (assist.opponentLabel ?? "Unassigned")
                      : null;
                    const key = rowKey(event);
                    const teamBorder =
                      event.team === "own" ? ownColor : oppColor;
                    const score = runningScores.get(key);
                    return (
                      <li
                        key={key}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg border border-[#1c2b36] border-l-4 bg-[#101920] px-3 py-2.5",
                          event.pending && "opacity-55",
                          enteringIdsRef.current.has(key) &&
                            "live-timeline-enter",
                        )}
                        style={{ borderLeftColor: teamBorder }}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <EventTypeGlyph
                            eventType={event.eventType}
                            secondYellow={isSecondYellow(event)}
                          />
                          <div className="min-w-0">
                            <p className="font-oswald text-sm tracking-wide">
                              {event.minute}&apos; {eventDisplayLabel(event)}
                              {event.eventType === "goal" && score
                                ? `  ${score}`
                                : ""}
                            </p>
                            <p className="truncate text-xs text-[#8e9ba8]">
                              {event.team === "own" ? ownName : oppName} · {who}
                              {assistWho ? `, Assist: ${assistWho}` : ""}
                              {substitutionIncoming(
                                event,
                                squad,
                                opponentSquad,
                              )}
                            </p>
                            {event.lifecycleStatus === "needs_review" ? (
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffbe2e]">
                                Possible duplicate · coach review needed
                              </p>
                            ) : event.syncStatus === "queued" ? (
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffbe2e]">
                                Saved on this device
                              </p>
                            ) : event.syncStatus === "uploading" ? (
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffbe2e]">
                                Uploading
                              </p>
                            ) : event.syncStatus === "accepted" ? (
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6fb6ff]">
                                Accepted · awaiting reconciliation
                              </p>
                            ) : event.syncStatus === "dependency_pending" ? (
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ffbe2e]">
                                Waiting for an earlier change
                              </p>
                            ) : event.syncStatus === "quarantined" ? (
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ff5b5f]">
                                Access changed · retained on this device
                              </p>
                            ) : event.syncStatus === "reconciled" ? (
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#00d99a]">
                                Reconciled
                              </p>
                            ) : event.syncStatus === "rejected" ? (
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ff5b5f]">
                                Sync rejected · {event.syncError}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {period !== "full_time" && !event.pending && (
                          <button
                            type="button"
                            aria-label="Undo event"
                            className="rounded-md p-2 text-[#8e9ba8]"
                            onClick={() => void handleUndo(event.id)}
                          >
                            <RotateCcw className="size-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </div>

        {period === "half_time" && (
          <div
            className="live-match-pause-overlay flex min-h-0 items-center justify-center overflow-auto bg-[#070d12]/70 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Half time"
          >
            <div className="w-full max-w-md rounded-2xl border border-[#1c2b36] bg-[#101920]/95 p-6 shadow-[0_0_40px_rgba(0,0,0,0.45)]">
              <p className="font-oswald text-center text-2xl tracking-[0.28em] text-white sm:text-3xl">
                HALF TIME
              </p>
              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <div className="flex flex-col items-end">
                  <p className="font-oswald text-lg tracking-[0.14em] text-white sm:text-xl">
                    {homeAbbrev}
                  </p>
                  <span
                    className="mt-0.5 h-0.5 w-10 rounded-full sm:w-14"
                    style={{ backgroundColor: homeColor }}
                  />
                </div>
                <p className="font-oswald text-4xl leading-none tabular-nums sm:text-5xl">
                  <span style={{ color: homeColor }}>{homeScore}</span>
                  <span className="mx-1.5 text-2xl text-[#8e9ba8]">-</span>
                  <span style={{ color: awayColor }}>{awayScore}</span>
                </p>
                <div className="flex flex-col items-start">
                  <p className="font-oswald text-lg tracking-[0.14em] text-white sm:text-xl">
                    {awayAbbrev}
                  </p>
                  <span
                    className="mt-0.5 h-0.5 w-10 rounded-full sm:w-14"
                    style={{ backgroundColor: awayColor }}
                  />
                </div>
              </div>
              <HalfTimeFacts
                ownName={ownName}
                oppName={oppName}
                timeline={timeline}
              />
              <button
                type="button"
                className="mt-6 w-full rounded-xl bg-[#00d99a] py-3 font-oswald tracking-widest text-[#07110f]"
                onClick={startSecondHalf}
              >
                START SECOND HALF
              </button>
              <button
                type="button"
                className="mt-2 w-full py-2 text-center text-xs font-medium tracking-wide text-[#8e9ba8] hover:text-white"
                onClick={backToFirstHalf}
              >
                Back to 1st Half
              </button>
            </div>
          </div>
        )}
        {checkIn && (
          <div
            className="live-match-pause-overlay flex min-h-0 items-center justify-center overflow-auto bg-[#070d12]/70 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={
              checkIn.period === "first_half"
                ? "End of first half check-in"
                : "End of match check-in"
            }
            onClick={dismissCheckIn}
          >
            <div className="w-full max-w-md rounded-2xl border border-[#ffbe2e]/50 bg-[#101920]/95 p-6 text-center shadow-[0_0_40px_rgba(255,190,46,0.18)]">
              <p className="font-oswald text-2xl tracking-[0.28em] text-[#ffbe2e] sm:text-3xl">
                {checkIn.period === "first_half"
                  ? "END OF 1ST HALF"
                  : "END OF MATCH"}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#8e9ba8]">
                {formatClock(
                  checkIn.period === "first_half"
                    ? FIRST_HALF_MS
                    : SECOND_HALF_MS,
                )}{" "}
                reached
              </p>
              <p
                className="mt-6 font-oswald text-6xl leading-none tabular-nums text-white sm:text-7xl"
                aria-live="off"
              >
                {formatClock(checkInLeftMs)}
              </p>
              <p className="mt-4 text-sm text-[#c5ced6]">
                {checkIn.period === "first_half"
                  ? "Half time starts automatically when this reaches zero."
                  : "The match ends automatically when this reaches zero."}
              </p>
              <button
                type="button"
                className="mt-6 w-full rounded-xl bg-[#ffbe2e] py-3 font-oswald tracking-widest text-[#07110f]"
                onClick={dismissCheckIn}
              >
                CONTINUE — PLAYING ADDED TIME
              </button>
              <p className="mt-3 text-[11px] text-[#8e9ba8]">
                Tap anywhere to keep the clock running. You then end the{" "}
                {checkIn.period === "first_half" ? "half" : "match"} yourself.
              </p>
            </div>
          </div>
        )}
        {liveLogging && !running && !checkIn && (
          <div
            className="live-match-pause-overlay flex min-h-0 items-center justify-center bg-[#070d12]/70 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Match paused"
          >
            <button
              type="button"
              onClick={startClock}
              className={cn(
                "flex flex-col items-center gap-3 rounded-2xl border border-[#00d99a]/70 bg-[#101920]/90 px-10 py-7",
                "shadow-[0_0_40px_rgba(0,217,154,0.28)]",
                "transition hover:border-[#00d99a] hover:bg-[#101920] hover:shadow-[0_0_48px_rgba(0,217,154,0.4)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d99a] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
              )}
            >
              <span className="flex size-16 items-center justify-center rounded-full border-2 border-[#00d99a] bg-[#070d12] sm:size-[4.5rem]">
                <Play className="size-8 fill-[#00d99a] text-[#00d99a]" />
              </span>
              <span className="font-oswald text-xl tracking-[0.28em] text-[#00d99a] sm:text-2xl">
                RESUME
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e9ba8]">
                Match paused
              </span>
            </button>
          </div>
        )}
      </div>

      {period === "not_started" && (
        <div
          className="live-match-kickoff-overlay flex items-center justify-center bg-[#070d12]/70 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Start game"
        >
          <button
            type="button"
            onClick={startFirstHalf}
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border border-[#00d99a]/70 bg-[#101920]/90 px-10 py-7",
              "shadow-[0_0_40px_rgba(0,217,154,0.28)]",
              "transition hover:border-[#00d99a] hover:bg-[#101920] hover:shadow-[0_0_48px_rgba(0,217,154,0.4)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d99a] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
            )}
          >
            <span className="flex size-16 items-center justify-center rounded-full border-2 border-[#00d99a] bg-[#070d12] sm:size-[4.5rem]">
              <GiWhistle className="size-9 text-[#00d99a]" aria-hidden />
            </span>
            <span className="font-oswald text-xl tracking-[0.28em] text-[#00d99a] sm:text-2xl">
              START GAME
            </span>
          </button>
        </div>
      )}

      {eventPickerOpen && target && (
        <Overlay onClose={() => setEventPickerOpen(false)} wide>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
                Log match event
              </p>
              <p className="mt-1 font-oswald text-2xl tracking-widest text-white">
                {loggingForLabel(target, visibility).replace(
                  "LOGGING FOR ",
                  "",
                )}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close event menu"
              className="rounded-lg border border-[#233747] px-3 py-1.5 text-sm text-[#8e9ba8] hover:text-white"
              onClick={() => setEventPickerOpen(false)}
            >
              CLOSE
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <LogButton
              label="Goal"
              color="#00d99a"
              disabled={!pitchLogEnabled}
              onClick={() => handleAction("goal")}
              icon={<SoccerBallIcon className="size-7" />}
            />
            <LogButton
              label="Yellow"
              color="#f5c518"
              disabled={!logEnabled}
              onClick={() => handleAction("yellow_card")}
              icon={
                <span className="inline-block h-6 w-4 rounded-[2px] bg-[#f5c518] shadow-[0_0_0_1px_rgba(16,32,24,0.7)]" />
              }
            />
            <LogButton
              label="Red"
              color="#ff5b5f"
              disabled={!logEnabled}
              onClick={() => handleAction("red_card")}
              icon={
                <span className="inline-block h-6 w-4 rounded-[2px] bg-[#ff5b5f] shadow-[0_0_0_1px_rgba(255,255,255,0.75)]" />
              }
            />
            <LogButton
              label="Substitution"
              color="#f5c518"
              disabled={!logEnabled}
              onClick={() => handleAction("substitution")}
              icon={<ArrowLeftRight className="size-6" />}
            />
            <LogButton
              label="Penalty"
              color="#20e6a6"
              disabled={!pitchLogEnabled}
              onClick={() => handleAction("penalty")}
              icon={<Target className="size-7" />}
            />
            <LogButton
              label="Injury"
              color="#fb923c"
              disabled={!pitchLogEnabled}
              onClick={() => handleAction("injury")}
              icon={<HeartPulse className="size-7" />}
            />
          </div>
          {targetIsBench && (
            <p className="mt-3 text-xs text-[#8e9ba8]">
              Bench players can receive cards or be selected for a substitution.
            </p>
          )}
        </Overlay>
      )}

      {toast && (
        <div
          className={cn(
            "fixed bottom-4 left-1/2 z-40 w-[min(92%,28rem)] -translate-x-1/2 rounded-xl bg-[#101920] px-4 py-3 shadow-lg",
            toast.id
              ? "border border-[#00d99a]/40"
              : "border border-[#ff5b5f]/40",
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

      {composer.kind === "penalty-outcome" && (
        <Overlay onClose={closeComposer}>
          <p className="font-oswald text-2xl tracking-widest">PENALTY</p>
          <p className="mt-1 text-sm text-[#8e9ba8]">
            {loggingForLabel(target, visibility)}
          </p>
          <div className="mt-8 grid gap-3">
            <button
              type="button"
              className="rounded-2xl border-2 border-[#00d99a] bg-[#00d99a]/10 py-6 font-oswald text-xl tracking-widest text-[#00d99a]"
              onClick={() => persistFromTarget("goal", PENALTY_SCORED_DETAIL)}
            >
              SCORED
            </button>
            <button
              type="button"
              className="rounded-2xl border-2 border-[#8e9ba8] bg-[#101920] py-6 font-oswald text-xl tracking-widest"
              onClick={() =>
                persistFromTarget("penalty", PENALTY_MISSED_DETAIL)
              }
            >
              MISSED
            </button>
          </div>
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
            <p>
              Scoreboard: {teamScore} – {oppScore}
            </p>
            <p>
              Logged goals: {loggedGoalsOwn} – {loggedGoalsOpp}
            </p>
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

function SettingsItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#e8ecef] hover:bg-white/5"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function mixHex(accent: string, base: string, amount: number) {
  const parse = (hex: string) => {
    const value = hex.replace("#", "");
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ] as const;
  };
  const [r1, g1, b1] = parse(accent);
  const [r2, g2, b2] = parse(base);
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r1 * amount + r2 * (1 - amount))}${toHex(g1 * amount + g2 * (1 - amount))}${toHex(b1 * amount + b2 * (1 - amount))}`;
}

function accentIsLight(color: string) {
  const value = color.replace("#", "");
  if (value.length !== 6) {
    return false;
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

function logButtonFill(color: string) {
  if (color.replace("#", "").length !== 6) {
    return mixHex("#00d99a", "#101920", 0.48);
  }
  return mixHex(color, "#101920", accentIsLight(color) ? 0.82 : 0.48);
}

function LogButton({
  label,
  color,
  icon,
  onClick,
  disabled,
  className,
}: {
  label: string;
  color: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const fill = logButtonFill(color);
  const fg = accentIsLight(color) ? "#102018" : "#ffffff";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "live-log-btn inline-flex min-h-14 w-full flex-row items-center justify-center gap-2.5 rounded-xl px-3 py-2.5 font-oswald text-xs font-semibold tracking-[0.16em] sm:min-h-16 sm:text-sm",
        className,
      )}
      style={{
        backgroundColor: fill,
        borderColor: color,
        color: fg,
        ["--log-btn-color" as string]: color,
      }}
    >
      <span className="inline-flex shrink-0 items-center justify-center">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function Overlay({
  children,
  onClose,
  wide = false,
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full rounded-2xl border border-[#1c2b36] bg-[#070d12] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
          wide ? "max-w-2xl" : "max-w-md",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function halfTimeCount(
  timeline: MatchLogEvent[],
  type: MatchEventType,
  side: MatchEventTeam,
) {
  return timeline.filter(
    (event) => event.eventType === type && event.team === side,
  ).length;
}

function HalfTimeFacts({
  ownName,
  oppName,
  timeline,
}: {
  ownName: string;
  oppName: string;
  timeline: MatchLogEvent[];
}) {
  const rows: { type: MatchEventType; label: string }[] = [
    { type: "goal", label: "Goals" },
    { type: "yellow_card", label: "Yellow" },
    { type: "red_card", label: "Red" },
    { type: "substitution", label: "Subs" },
  ];

  return (
    <div className="mt-5 grid grid-cols-3 text-center text-sm">
      <p className="text-[#8e9ba8]">{ownName}</p>
      <p className="text-[#8e9ba8]"> </p>
      <p className="text-[#8e9ba8]">{oppName}</p>
      {rows.map((row) => (
        <Fragment key={row.type}>
          <p className="font-oswald text-2xl">
            {halfTimeCount(timeline, row.type, "own")}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-[#8e9ba8]">
            {row.label}
          </p>
          <p className="font-oswald text-2xl">
            {halfTimeCount(timeline, row.type, "opponent")}
          </p>
        </Fragment>
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
  compact = false,
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
  compact?: boolean;
}) {
  const count = (type: MatchEventType, side: MatchEventTeam) =>
    timeline.filter((event) => event.eventType === type && event.team === side)
      .length;

  if (compact) {
    return (
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-[#1c2b36] bg-[#101920] px-3 py-1.5">
        <p className="font-oswald text-sm tracking-widest">{title}</p>
        <div className="flex shrink-0 gap-2">
          {onBack && (
            <button
              type="button"
              className="rounded-md border border-[#233747] px-3 py-1 text-xs tracking-wide"
              onClick={onBack}
            >
              {backLabel}
            </button>
          )}
          <button
            type="button"
            className="rounded-md bg-[#00d99a] px-3 py-1 font-oswald text-xs tracking-widest text-[#07110f] disabled:opacity-40"
            onClick={onContinue}
            disabled={continueDisabled}
          >
            {continueLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-[#1c2b36] bg-[#101920] p-5">
      <p className="font-oswald text-center text-2xl tracking-widest">
        {title}
      </p>
      <div className="mt-5 grid grid-cols-3 text-center text-sm">
        <p className="text-[#8e9ba8]">{ownName}</p>
        <p className="text-[#8e9ba8]"> </p>
        <p className="text-[#8e9ba8]">{oppName}</p>
        <p className="font-oswald text-2xl">{count("goal", "own")}</p>
        <p className="text-[10px] uppercase tracking-widest text-[#8e9ba8]">
          Goals
        </p>
        <p className="font-oswald text-2xl">{count("goal", "opponent")}</p>
        <p className="font-oswald text-2xl">{count("yellow_card", "own")}</p>
        <p className="text-[10px] uppercase tracking-widest text-[#8e9ba8]">
          Yellow
        </p>
        <p className="font-oswald text-2xl">
          {count("yellow_card", "opponent")}
        </p>
        <p className="font-oswald text-2xl">{count("red_card", "own")}</p>
        <p className="text-[10px] uppercase tracking-widest text-[#8e9ba8]">
          Red
        </p>
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

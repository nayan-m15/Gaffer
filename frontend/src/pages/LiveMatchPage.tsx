import { sessionPlayerLabel } from "@/features/matches/session-report-model";
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
  Hand,
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EventReviewPanel } from "@/offline/EventReviewPanel";
import { ResumeMatchDialog } from "@/features/matches/ResumeMatchDialog";
import { OfflineReadinessPanel } from "@/offline/OfflineReadinessPanel";
import {
  isClockAnchorPending,
  markClockAnchorSynced,
  readClockAnchor,
  saveClockAnchor,
} from "@/offline/match-store";
import { useGamePlan } from "@/features/team-tactics/api";
import { getFormationPlayerCount } from "@/features/team-management/formations";
import type { FormationPlayerCount } from "@/features/team-management/types";
import {
  useDeleteMatchEvent,
  useFinishMatch,
  useFinaliseMatchProjection,
  useLogMatchEvent,
  useMatchView,
  useMatchSquad,
  useUpdateMatchEvent,
  useUpdateMatchClock,
  useReopenMatchProjection,
} from "@/features/matches/hooks";
import type {
  MatchEventTeam,
  MatchTacticalChange,
  MatchEventType,
  MatchLogEvent,
  MatchSquadAthlete,
  OpponentMatchPlayer,
} from "@/features/matches/types";
import type { OpponentSquadVisibility } from "@/features/events/types";
import {
  PENALTY_MISSED_DETAIL,
  PENALTY_SAVED_BY_GOALKEEPER_DETAIL,
  PENALTY_SCORED_DETAIL,
  SECOND_YELLOW_DETAIL,
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
  publicOpponentTimeline,
  opponentEventAttribution,
  opponentSubstitutionDetail,
  friendlyLineupPlayers,
  friendlyLineupStarterIds,
  opponentPitchState,
  ownPitchState,
  placeOppPlayers,
  effectiveGamePlan,
  placeOwnPlayers,
  resolveOppColor,
  resolveOwnColor,
  runningScoreByEvent,
  teamAbbrev,
} from "@/features/matches/live-match-model";
import { SoccerBallIcon, BootIcon } from "@/features/matches/match-icons";
import {
  LiveInjurySheet,
  type LiveInjurySpec,
} from "@/features/matches/LiveInjurySheet";
import { LiveTacticsSheet } from "@/features/matches/LiveTacticsSheet";
import { injuryTitle } from "@/features/injuries/body-regions";
import { useCreateInjury } from "@/features/injuries/hooks";
import {
  LiveBenchRow,
  LivePitch,
  LivePitchPlayers,
} from "@/features/matches/live-tactical-view";
import {
  findOpposingGoalkeeper,
  isGoalkeeperPosition,
} from "@/features/matches/opposing-goalkeeper";
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
  | { kind: "penalty-miss-reason" }
  | {
      /**
       * The injury-specification step. Own-team, on-pitch players only —
       * an opponent's clinical record is not ours to keep.
       */
      kind: "injury-detail";
      athlete: MatchSquadAthlete;
      minute: number;
    }
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

function substitutionComposer(
  target: LogTarget,
  ownPitchIds: Set<string>,
  opponentPitchIds: Set<string>,
): Composer {
  if (target.kind === "own") {
    return ownPitchIds.has(target.athlete.id)
      ? { kind: "sub-in", team: "own", outgoing: target.athlete }
      : { kind: "sub-out", team: "own", incoming: target.athlete };
  }
  if (target.kind === "opp") {
    return opponentPitchIds.has(target.player.id)
      ? { kind: "sub-in", team: "opponent", outgoing: target.player }
      : { kind: "sub-out", team: "opponent", incoming: target.player };
  }
  return { kind: "sub-in", team: "opponent", outgoing: "generic" };
}

function isRestrictedBenchAction(
  target: LogTarget,
  eventType: LogAction,
  ownPitchIds: Set<string>,
  opponentPitchIds: Set<string>,
) {
  const isBenchTarget =
    (target.kind === "own" && !ownPitchIds.has(target.athlete.id)) ||
    (target.kind === "opp" && !opponentPitchIds.has(target.player.id));
  const requiresOnPitchPlayer = ["goal", "key_pass", "penalty", "injury", "goalkeeper_save"].includes(eventType);
  return isBenchTarget && requiresOnPitchPlayer;
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
  /**
   * Diagnosis from the injury sheet. When present, an injury record is
   * created after the match event lands and linked back to it.
   */
  injurySpec?: LiveInjurySpec;
};

function isDismissedPlayer(
  input: PersistInput,
  ownDismissedIds: Set<string>,
  opponentDismissedIds: Set<string>,
) {
  if (input.team === "own") return Boolean(input.athleteId && ownDismissedIds.has(input.athleteId));
  return Boolean(input.opponentPlayerId && opponentDismissedIds.has(input.opponentPlayerId));
}

function resolvePersistedEventType(input: PersistInput, timeline: MatchLogEvent[]) {
  const isSecondBooking = input.eventType === "yellow_card" && hasPriorYellow(
    timeline,
    input.team,
    input.athleteId,
    input.opponentLabel,
    input.opponentPlayerId,
  );
  return isSecondBooking
    ? { eventType: "red_card" as const, detail: SECOND_YELLOW_DETAIL }
    : { eventType: input.eventType, detail: input.detail };
}

function shouldKeepEventComposer(
  eventType: MatchEventType,
  detail: string | undefined,
  team: MatchEventTeam,
  visibility: OpponentSquadVisibility,
  opponentSquadSize: number,
) {
  const canSelectOpponentTeammate = team !== "opponent" || (visibility !== "none" && opponentSquadSize > 0);
  const keepOpen = (eventType === "injury" || (eventType === "goal" && detail !== PENALTY_SCORED_DETAIL)) && canSelectOpponentTeammate;
  return { canSelectOpponentTeammate, keepOpen };
}

function persistEventErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Could not save this event. Please try again.";
}

function formatClock(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function LiveClockTime({ elapsedMs, running }: { elapsedMs: number; running: boolean }) {
  const [displayMs, setDisplayMs] = useState(elapsedMs);

  useEffect(() => {
    setDisplayMs(elapsedMs);
    if (!running) return;
    const origin = Date.now() - elapsedMs;
    const id = window.setInterval(() => setDisplayMs(Date.now() - origin), 1_000);
    return () => window.clearInterval(id);
  }, [elapsedMs, running]);

  return formatClock(displayMs);
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
    return [player.shirtNumber == null ? "" : `#${player.shirtNumber}`, player.name].filter(Boolean).join(" ");
  }
  return player.shirtNumber == null ? "Unassigned" : `#${player.shirtNumber}`;
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
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 640px)").matches
      : false,
  );
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const handleChange = (event: MediaQueryListEvent) => setIsPhone(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    setIsPhone(mediaQuery.matches);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  const orientation = isPhone ? "vertical" : "horizontal";
  const [phoneView, setPhoneView] = useState<"pitch" | "logs">("pitch");
  const [benchPanel, setBenchPanel] = useState<"own" | "opponent" | null>(null);
  const phonePitchCentreRef = useRef<HTMLDivElement>(null);
  const ownBenchTabRef = useRef<HTMLButtonElement>(null);
  const oppBenchTabRef = useRef<HTMLButtonElement>(null);
  const lastBenchSideRef = useRef<"own" | "opponent">("own");
  const phoneLogRef = useRef<HTMLUListElement>(null);
  const phoneLogScrollRef = useRef(0);
  useEffect(() => { if (benchPanel) lastBenchSideRef.current = benchPanel; }, [benchPanel]);
  const { team } = useAuth();

  const { matchQuery, eventsQuery, sessionReport, privateEventsQuery } = useMatchView(matchId);
  const clockAuthorityRevision = matchQuery.data?.clockRevision ?? 0;
  const refetchMatch = matchQuery.refetch;
  const squadQuery = useMatchSquad(matchId);
  const gamePlanSnapshot = matchQuery.data?.gamePlanSnapshot ?? undefined;
  const gamePlanQuery = useGamePlan(
    gamePlanSnapshot ? undefined : (matchQuery.data?.gamePlanId ?? undefined),
  );
  const gamePlan = gamePlanSnapshot ?? gamePlanQuery.data;
  const logEvent = useLogMatchEvent(matchId ?? "", { backgroundUpload: true });
  const updateEvent = useUpdateMatchEvent(matchId ?? "");
  const deleteEvent = useDeleteMatchEvent(matchId ?? "");
  const finishMatch = useFinishMatch(matchId ?? "");
  const finaliseProjection = useFinaliseMatchProjection(matchId ?? "");
  const reopenProjection = useReopenMatchProjection(matchId ?? "");
  const { mutateAsync: updateMatchClock } = useUpdateMatchClock(matchId ?? "");
  const createInjury = useCreateInjury();

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
  const clockOriginRef = useRef(0);

  const [tacticsOpen, setTacticsOpen] = useState(false);
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
  const finishingRef = useRef(false);
  const [resumeOpen, setResumeOpen] = useState(false);
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
  // Resolves when the in-flight persistEvent releases its lock.
  const persistIdleRef = useRef<Promise<void>>(Promise.resolve());
  const subInPendingRef = useRef(false);
  const primedIdsRef = useRef(false);
  const knownIdsRef = useRef(new Set<string>());
  const lastAppliedClockRevisionRef = useRef<string | null>(null);
  const applyingClockKeyRef = useRef<string | null>(null);
  const enteringIdsRef = useRef(new Set<string>());

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    const match = matchQuery.data;
    if (!match) return;
    // The peer can change the session clock without changing this sheet's timestamp.
    const clockKey = JSON.stringify([
      match.id,
      match.clockRevision,
      match.clockPeriod,
      match.clockElapsedMs,
      match.clockStartedAt,
      match.eventStatus,
    ]);
    if (lastAppliedClockRevisionRef.current === clockKey) return;
    // A refetch that returns the same clock must not restart an application
    // already in flight. Reading the local anchor can take seconds on a busy
    // device, and restarting on every refetch meant a peer's pause or resume
    // could go unapplied indefinitely. Only a newer clock supersedes it.
    if (applyingClockKeyRef.current === clockKey) return;
    applyingClockKeyRef.current = clockKey;
    const superseded = () => applyingClockKeyRef.current !== clockKey;
    void (async () => {
      try {
        const local = matchId ? await readClockAnchor(matchId) : null;
        if (superseded()) return;
        const serverElapsed = Math.max(
          0,
          match.clockElapsedMs +
            (match.clockStartedAt
              ? Date.now() - new Date(match.clockStartedAt).getTime()
              : 0),
        );
        const supersededFullTime = local?.period === "full_time" &&
          match.clockPeriod !== "full_time" && match.clockRevision > Number(local.authorityRevision);
        if (supersededFullTime && local && matchId) markClockAnchorSynced(matchId, local.updatedAt);
        const useLocal = Boolean(
          match.eventStatus !== "completed" && matchId && local &&
          !supersededFullTime && isClockAnchorPending(matchId),
        );
        const elapsed = useLocal && local ? local.elapsedMs : serverElapsed;
        const nextPeriod = match.eventStatus === "completed"
          ? "full_time"
          : useLocal && local ? local.period : match.clockPeriod;
        const nextRunning =
          match.eventStatus !== "completed" &&
          (useLocal && local ? local.running : Boolean(match.clockStartedAt));
        if (local?.uncertain) {
          setActionError(
            "The offline match clock changed unexpectedly and was paused. Confirm the time before continuing.",
          );
        }
        baseRef.current = elapsed;
        clockOriginRef.current = Date.now() - elapsed;
        elapsedRef.current = elapsed;
        setElapsedMs(elapsed);
        setPeriod(nextPeriod);
        setCheckIn(null);
        const livePeriod =
          nextPeriod === "first_half" || nextPeriod === "second_half";
        const regulation =
          nextPeriod === "second_half" ? SECOND_HALF_MS : FIRST_HALF_MS;
        if (livePeriod && elapsed >= regulation) {
          checkedMarksRef.current.add(nextPeriod);
        }
        setRunning(nextRunning);
        lastAppliedClockRevisionRef.current = clockKey;
      } finally {
        if (!superseded()) applyingClockKeyRef.current = null;
      }
    })();
  }, [matchId, matchQuery.data]);

  useEffect(() => {
    if (!running) {
      return;
    }
    clockOriginRef.current = Date.now() - baseRef.current;
    const id = window.setInterval(() => {
      const next = Date.now() - clockOriginRef.current;
      const minuteChanged =
        Math.floor(elapsedRef.current / 60_000) !== Math.floor(next / 60_000);
      elapsedRef.current = next;
      if (minuteChanged) setElapsedMs(next);
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
  const manualOpponentSquad = matchQuery.data?.opponentSquad;
  const opponentSquad = useMemo(
    () => manualOpponentSquad?.length
      ? manualOpponentSquad
      : friendlyLineupPlayers(matchQuery.data?.friendlyOpponentLineup),
    [manualOpponentSquad, matchQuery.data?.friendlyOpponentLineup],
  );
  const visibility = opponentSquad.some((player) => player.publicLineup)
    ? "full" : matchQuery.data?.opponentSquadVisibility ?? "none";
  const opponentDisplaySquad = opponentSquad;
  const timeline = useMemo(() => publicOpponentTimeline(eventsQuery.data ?? [], opponentSquad), [eventsQuery.data, opponentSquad]);

  /**
   * The plan in force right now: the one the match kicked off with, plus every
   * tactical change the coach has logged. `gamePlan` stays the starting plan,
   * so the squad size it was locked at never moves.
   */
  const effectivePlan = useMemo(
    () => effectiveGamePlan(gamePlan, timeline),
    [gamePlan, timeline],
  );
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
    () => ownPitchState(squad, privateEventsQuery.data ?? timeline),
    [squad, timeline, privateEventsQuery.data],
  );
  const matchPlayerCount: FormationPlayerCount = gamePlan
    ? getFormationPlayerCount(gamePlan.formationId)
    : ownState.onPitch.length === 5 || ownState.onPitch.length === 7
      ? ownState.onPitch.length
      : 11;
  const oppState = useMemo(
    () =>
      opponentPitchState(
        opponentDisplaySquad,
        timeline,
        matchPlayerCount,
        manualOpponentSquad?.length
          ? undefined
          : friendlyLineupStarterIds(matchQuery.data?.friendlyOpponentLineup),
      ),
    [
      matchPlayerCount,
      matchQuery.data?.friendlyOpponentLineup,
      opponentDisplaySquad,
      manualOpponentSquad,
      timeline,
    ],
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
  // Once the timeline is loaded, its effective rows determine the displayed
  // score. A cached match total may be from a different projection revision.
  const teamScore = sessionReport ? (isHome ? sessionReport.score.home : sessionReport.score.away) : eventsQuery.isSuccess
    ? timeline.filter(
        (event) =>
          event.team === "own" &&
          event.eventType === "goal" &&
          event.lifecycleStatus !== "voided",
      ).length
    : (matchQuery.data?.teamScore ?? 0);
  const oppScore = sessionReport ? (isHome ? sessionReport.score.away : sessionReport.score.home) : eventsQuery.isSuccess
    ? timeline.filter(
        (event) =>
          event.team === "opponent" &&
          event.eventType === "goal" &&
          event.lifecycleStatus !== "voided",
      ).length
    : (matchQuery.data?.opponentScore ?? 0);
  const homeName = isHome ? ownName : oppName;
  const awayName = isHome ? oppName : ownName;
  const homeScore = isHome ? teamScore : oppScore;
  const awayScore = isHome ? oppScore : teamScore;
  const projection = matchQuery.data?.projection;
  const projectionConsistent =
    !projection ||
    timeline
      .filter((event) => event.syncStatus === "reconciled")
      .every((event) => event.projectionRevision === projection.revision);
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
        effectivePlan,
        ownHalf,
        timeline,
        visibility === "none" ? "own" : "full",
      ),
    [ownState.onPitch, effectivePlan, ownHalf, timeline, visibility],
  );
  const oppPlaced = useMemo(
    () => placeOppPlayers(
        oppState.onPitch,
        oppHalf,
        timeline,
        matchPlayerCount,
      ),
    [matchPlayerCount, oppState.onPitch, oppHalf, timeline],
  );
  const ownPitchIds = useMemo(
    () => new Set(ownPlaced.map((placed) => placed.athlete.id)),
    [ownPlaced],
  );
  const oppPitchIds = useMemo(
    () => new Set(oppState.onPitch.map((player) => player.id)),
    [oppState.onPitch],
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
      (player) => !oppPlaced.some((placed) => placed.player.id === player.id),
    );
    return [
      ...oppState.bench.filter((player) => !oppPitchIds.has(player.id)),
      ...overflow,
    ];
  }, [oppState.bench, oppState.onPitch, oppPitchIds, oppPlaced]);

  const phoneLayoutReady = Boolean(matchQuery.data) && !squadQuery.isLoading && !eventsQuery.isLoading;
  useEffect(() => {
    if (!isPhone || phoneView !== "pitch" || !phoneLayoutReady) return;
    const centre = phonePitchCentreRef.current;
    if (!centre) return;
    const shell = centre.closest<HTMLElement>(".live-match");
    const layout = centre.closest<HTMLElement>(".live-match-layout");
    const header = shell?.querySelector<HTMLElement>(".live-match-header");
    if (!shell || !layout || !header) return;
    const prompts = Array.from(layout.querySelectorAll<HTMLElement>(":scope > .live-match-summary, :scope > .live-match-opponent-action, :scope > .live-match-callout"));
    const MIN_RATIO = .48, MAX_RATIO = .75;
    let lastFit = "";
    const fit = () => {
      // Measure the fixed viewport shell and non-pitch rows, never the expanded pitch.
      const shellStyle = getComputedStyle(shell);
      const promptHeight = prompts.reduce((total, prompt) => total + prompt.getBoundingClientRect().height, 0);
      const gaps = (parseFloat(getComputedStyle(layout).rowGap) || 0) * 3;
      const W = Math.max(0, shell.clientWidth - parseFloat(shellStyle.paddingLeft) - parseFloat(shellStyle.paddingRight) - 48);
      const H = Math.max(0, shell.clientHeight - parseFloat(shellStyle.paddingTop) - parseFloat(shellStyle.paddingBottom) - header.getBoundingClientRect().height - promptHeight - gaps);
      const ratio = H > 0 ? W / H : 0;
      let width = Math.max(0, ratio > MAX_RATIO ? H * MAX_RATIO : W);
      let height = Math.max(0, ratio < MIN_RATIO ? Math.min(H, W / MIN_RATIO) : H);
      const minimum = width < 260 || height < 420;
      if (minimum) {
        const fittedRatio = height > 0 ? Math.max(MIN_RATIO, Math.min(width / height, MAX_RATIO)) : MAX_RATIO;
        width = Math.max(width, 260, 420 * fittedRatio);
        height = width / fittedRatio;
      }
      const key = `${W}:${H}:${width}:${height}:${promptHeight}:${gaps}`;
      if (key === lastFit) return;
      lastFit = key;
      shell.toggleAttribute("data-phone-pitch-minimum", minimum);
      shell.style.setProperty("--phone-minimum-layout-height", `${height + promptHeight + gaps}px`);
      centre.style.setProperty("--phone-pitch-width", `${width}px`);
      centre.style.setProperty("--phone-pitch-height", `${height}px`);
      centre.style.setProperty("--phone-pitch-scale", `${Math.max(.7, Math.min(width / 352, 1.15))}`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(shell);
    observer.observe(header);
    prompts.forEach(prompt => observer.observe(prompt));
    observer.observe(centre);
    // Callouts can mount without changing the viewport itself.
    const promptObserver = new MutationObserver(() => {
      const next = Array.from(layout.querySelectorAll<HTMLElement>(":scope > .live-match-summary, :scope > .live-match-opponent-action, :scope > .live-match-callout"));
      prompts.forEach(prompt => observer.unobserve(prompt));
      prompts.splice(0, prompts.length, ...next);
      prompts.forEach(prompt => observer.observe(prompt));
      fit();
    });
    promptObserver.observe(layout, { childList: true });
    return () => {
      observer.disconnect();
      promptObserver.disconnect();
      shell.removeAttribute("data-phone-pitch-minimum");
      shell.style.removeProperty("--phone-minimum-layout-height");
    };
  }, [isPhone, phoneView, phoneLayoutReady]);

  useEffect(() => {
    if (!isPhone) return;
    if (composer.kind === "sub-in" || composer.kind === "mandatory-sub-in") {
      setPhoneView("pitch");
      setBenchPanel(composer.team === "own" ? "own" : visibility !== "none" && oppBench.length > 0 ? "opponent" : null);
    } else if (composer.kind === "sub-out" || composer.kind === "assist-pick" || composer.kind === "closed") {
      setBenchPanel(null);
    }
  }, [isPhone, composer, visibility, oppBench.length]);

  useEffect(() => {
    if (!isPhone || phoneView !== "logs") return;
    if (phoneLogRef.current) phoneLogRef.current.scrollTop = phoneLogScrollRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setPhoneView("pitch");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPhone, phoneView]);

  const runningScores = useMemo(
    () => runningScoreByEvent(timeline, isHome),
    [timeline, isHome],
  );

  const persistClock = useCallback(
    (nextPeriod: Period, nextRunning: boolean, elapsed: number) => {
      if (!matchId) return;
      void (async () => {
        const saved = await saveClockAnchor(matchId, {
          period: nextPeriod,
          running: nextRunning,
          elapsedMs: elapsed,
          authorityRevision: String(clockAuthorityRevision),
        });
        if (!navigator.onLine) return;
        try {
          await updateMatchClock({
            operationId: saved.operationId,
            baseRevision: clockAuthorityRevision,
            clientCreatedAt: saved.clientCreatedAt,
            period: nextPeriod,
            running: nextRunning,
            elapsedMs: elapsed,
          });
          markClockAnchorSynced(matchId, saved.version);
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
    [matchId, clockAuthorityRevision, refetchMatch, updateMatchClock],
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
            operationId: anchor.operationId,
            baseRevision: Number(anchor.authorityRevision) || 0,
            clientCreatedAt: anchor.clientCreatedAt,
            period: anchor.period,
            running: anchor.running,
            elapsedMs: anchor.operationElapsedMs,
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
    setElapsedMs(elapsedRef.current);
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
    setElapsedMs(elapsedRef.current);
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
    setElapsedMs(elapsedRef.current);
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
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [checkIn]);

  // No response in time: half time pauses; full time still needs confirmation.
  useEffect(() => {
    if (!checkIn || checkInLeftMs > 0) {
      return;
    }
    if (checkIn.period === "first_half") {
      goHalfTime();
    } else {
      setCheckIn(null);
      setEndOpen(true);
    }
  }, [checkIn, checkInLeftMs, goHalfTime]);

  const closeComposer = useCallback(() => {
    setComposer({ kind: "closed" });
  }, []);

  const handleLoggedEventFollowUp = useCallback(async (
    input: PersistInput,
    created: Awaited<ReturnType<typeof logEvent.mutateAsync>>,
    eventType: MatchEventType,
    detail: string | undefined,
    canSelectOpponentTeammate: boolean,
  ) => {
    const label = eventDisplayLabel({ eventType, detail: detail ?? null });
    setToast({
      id: created.id,
      label: created.syncStatus && created.syncStatus !== "synced"
        ? `${label} saved on this device`
        : `${label} logged`,
    });
    window.setTimeout(() => setToast(null), 5000);

    if (eventType === "injury" && canSelectOpponentTeammate) {
      console.log("[live-callout:persist]", {
        eventType,
        nextKind: "mandatory-sub-in",
      });
      if (input.injurySpec && input.athleteId && matchId) {
        const spec = input.injurySpec;
        try {
          await createInjury.mutateAsync({
            athleteId: input.athleteId,
            bodyRegion: spec.bodyRegion,
            injuryType: spec.injuryType,
            severity: spec.severity,
            occurredOn: new Date().toISOString().slice(0, 10),
            context: "match",
            matchId,
            matchEventId: created.id,
            minute: created.minute,
          });
          setToast({ label: `${injuryTitle(spec)} recorded` });
          window.setTimeout(() => setToast(null), 5000);
        } catch {
          setToast({
            label: "Injury logged, but the details were not saved. Add them on the Injury page.",
          });
          window.setTimeout(() => setToast(null), 6000);
        }
      }
      if (input.team === "own" && input.athleteId) {
        const outgoing = squad.find((athlete) => athlete.id === input.athleteId);
        if (outgoing) setComposer({ kind: "mandatory-sub-in", team: "own", outgoing });
      } else if (input.team === "opponent") {
        const outgoing = opponentSquad.find((player) => player.id === input.opponentPlayerId) ?? "generic";
        setComposer({ kind: "mandatory-sub-in", team: "opponent", outgoing });
      }
      return;
    }

    if (eventType === "goal" && detail !== PENALTY_SCORED_DETAIL && canSelectOpponentTeammate) {
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
  }, [createInjury, matchId, opponentSquad, squad]);

  const persistEvent = useCallback(
    async (input: PersistInput) => {
      if (!matchId || persistLockRef.current) {
        return false;
      }
      if (isDismissedPlayer(input, dismissedOwnIds, dismissedOppIds)) {
        closeComposer();
        setEventPickerOpen(false);
        setActionError(
          "That player has been sent off. Undo the red card before logging another action.",
        );
        return false;
      }
      persistLockRef.current = true;
      let releaseIdle = () => {};
      persistIdleRef.current = new Promise((resolve) => {
        releaseIdle = resolve;
      });
      setActionError(null);

      const { eventType, detail } = resolvePersistedEventType(input, timeline);
      const { canSelectOpponentTeammate, keepOpen: keepComposerForFollowUp } =
        shouldKeepEventComposer(eventType, detail, input.team, visibility, opponentSquad.length);
      if (!keepComposerForFollowUp) {
        closeComposer();
      }

      const publicPlayer = opponentSquad.find((player) =>
        player.publicLineup && player.id === input.opponentPlayerId);
      const publicIncoming = eventType === "substitution"
        ? opponentSquad.find((player) => player.publicLineup && player.id === detail)
        : undefined;
      const safeOpponentId = publicPlayer ? opponentEventAttribution(publicPlayer).opponentPlayerId : input.opponentPlayerId;
      const safeDetail = publicIncoming ? opponentSubstitutionDetail(publicIncoming) : detail;
      try {
        if (input.reassignId) {
          await updateEvent.mutateAsync({
            eventId: input.reassignId,
            input: {
              athleteId: input.athleteId ?? null,
              opponentLabel: input.opponentLabel ?? null,
              opponentPlayerId: safeOpponentId ?? null,
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
            ...(input.opponentLabel ? { opponentLabel: input.opponentLabel } : {}),
            ...(safeOpponentId ? { opponentPlayerId: safeOpponentId } : {}),
            ...(safeDetail ? { detail: safeDetail } : {}),
          });
          await handleLoggedEventFollowUp(input, created, eventType, detail, canSelectOpponentTeammate);
          return created.id;
        }
        return false;
      } catch (err) {
        const message = persistEventErrorMessage(err);
        setActionError(message);
        setToast({ label: message });
        window.setTimeout(() => setToast(null), 5000);
        if (keepComposerForFollowUp) {
          closeComposer();
        }
        return false;
      } finally {
        persistLockRef.current = false;
        releaseIdle();
      }
    },
    [
      matchId,
      currentMinute,
      period,
      timeline,
      dismissedOwnIds,
      dismissedOppIds,
      opponentSquad,
      visibility,
      logEvent,
      updateEvent,
      closeComposer,
      handleLoggedEventFollowUp,
    ],
  );

  /**
   * Logs one tactical change. Deliberately not routed through `persistEvent`:
   * this is a coach instruction, not an observation of play, so none of the
   * attribution, dismissal or follow-up rules there apply to it. The saved game
   * plan is never touched — the timeline carries what changed and when.
   */
  const logTacticalChange = useCallback(
    async (change: MatchTacticalChange) => {
      if (!matchId || Object.keys(change).length === 0) return;
      setTacticsOpen(false);
      try {
        await logEvent.mutateAsync({
          clientRequestId: crypto.randomUUID(),
          clientCreatedAt: new Date().toISOString(),
          period,
          matchElapsedMs: elapsedRef.current,
          team: "own",
          eventType: "tactical_change",
          minute: currentMinute,
          tacticalChange: change,
        });
      } catch (err) {
        const message = persistEventErrorMessage(err);
        setActionError(message);
        setToast({ label: message });
        window.setTimeout(() => setToast(null), 5000);
      }
    },
    [matchId, logEvent, period, currentMinute],
  );

  const persistFromTarget = (
    eventType: LogAction,
    detail?: string,
    injurySpec?: LiveInjurySpec,
  ) => {
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
        ...(injurySpec ? { injurySpec } : {}),
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

  const opposingGoalkeeper = () => {
    if (!target) {
      return null;
    }
    return findOpposingGoalkeeper({
      shooterTeam: target.kind === "own" ? "own" : "opponent",
      squad,
      opponentSquad,
      ownOnPitchIds: new Set(ownState.onPitch.map((athlete) => athlete.id)),
      opponentOnPitchIds: new Set(oppState.onPitch.map((player) => player.id)),
      dismissedOwnIds,
      dismissedOpponentIds: dismissedOppIds,
    });
  };

  const persistPenaltySavedByKeeper = async () => {
    if (!target) {
      setActionError("Select a player first.");
      return;
    }
    const keeper = opposingGoalkeeper();
    const penaltyId = await persistEvent(
      target.kind === "own"
        ? {
            team: "own",
            eventType: "penalty",
            athleteId: target.athlete.id,
            detail: PENALTY_SAVED_BY_GOALKEEPER_DETAIL,
          }
        : target.kind === "opp"
          ? {
              team: "opponent",
              eventType: "penalty",
              opponentPlayerId: target.player.id,
              opponentLabel: opponentShirtLabel(target.player, visibility),
              detail: PENALTY_SAVED_BY_GOALKEEPER_DETAIL,
            }
          : {
              team: "opponent",
              eventType: "penalty",
              opponentLabel: oppName,
              detail: PENALTY_SAVED_BY_GOALKEEPER_DETAIL,
            },
    );
    if (!penaltyId || !keeper) {
      return;
    }
    if (keeper.team === "own") {
      await persistEvent({
        team: "own",
        eventType: "goalkeeper_save",
        athleteId: keeper.athlete.id,
        detail: penaltyId,
      });
      return;
    }
    await persistEvent({
      team: "opponent",
      eventType: "goalkeeper_save",
      opponentPlayerId: keeper.player.id,
      opponentLabel: opponentShirtLabel(keeper.player, visibility),
      detail: penaltyId,
    });
  };

  const handleAction = (eventType: LogAction) => {
    if (!target) {
      setActionError("Tap a player marker to log an event.");
      return;
    }
    setEventPickerOpen(false);
    setActionError(null);
    if (isRestrictedBenchAction(target, eventType, ownPitchIds, oppPitchIds)) {
      setActionError(
        "That event can only be logged for a player on the pitch.",
      );
      return;
    }
    console.log("[live-callout:handleAction]", eventType);
    if (eventType === "substitution") {
      const next = substitutionComposer(target, ownPitchIds, oppPitchIds);
      if (target.kind === "opp-generic") persistFromTarget("substitution");
      else {
        console.log("[live-callout:sub-button] setting composer", next.kind);
        setComposer(next);
      }
      return;
    }
    if (eventType === "injury") {
      /* An own-team injury is specified first, so the record carries a
       * diagnosis and a return estimate. Opponent injuries keep the original
       * behaviour: we do not hold their athlete records. */
      if (target.kind === "own") {
        setComposer({
          kind: "injury-detail",
          athlete: target.athlete,
          minute: currentMinute,
        });
        return;
      }
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

  const completeSubIn = async (incoming: MatchSquadAthlete | OpponentMatchPlayer) => {
    if (composer.kind !== "sub-in" && composer.kind !== "mandatory-sub-in") {
      return;
    }
    // The mandatory substitution opens while the injury is still being saved.
    // Wait for that save instead of letting persistEvent's lock drop the tap,
    // and ignore repeat taps meanwhile so only one substitution is logged.
    if (subInPendingRef.current) return;
    subInPendingRef.current = true;
    try {
      await persistIdleRef.current;
      if (composer.team === "own" && "firstName" in incoming) {
        const outgoing = composer.outgoing as MatchSquadAthlete;
        await persistEvent({
          team: "own",
          eventType: "substitution",
          athleteId: outgoing.id,
          detail: incoming.id,
        });
        return;
      }
      if (composer.team === "opponent" && "shirtNumber" in incoming) {
        const outgoing = composer.outgoing;
        await persistEvent({
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
    } finally {
      subInPendingRef.current = false;
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
      void completeSubIn(athlete);
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
      oppState.bench.some((item) => item.id === player.id)
    ) {
      void completeSubIn(player);
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
    if (finishingRef.current) return;
    finishingRef.current = true;
    setActionError(null);
    try {
      await finishMatch.mutateAsync();
      navigate(`/matches/${matchId}/report`);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not finish this match.",
      );
    } finally {
      finishingRef.current = false;
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
  const targetIsGoalkeeper =
    target?.kind === "own"
      ? isGoalkeeperPosition(target.athlete.position)
      : target?.kind === "opp"
        ? isGoalkeeperPosition(target.player.position)
        : false;
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
  const projectionStatus = !projection ? "" : !projectionConsistent
    ? "Syncing result and event log"
    : projection.finalisationState === "finalised"
      ? `Final result · revision ${projection.revision}`
      : projection.finalisationState === "amendment_required"
        ? "Result changed · amendment review required"
        : projection.unresolvedReviewCount > 0
          ? `Provisional · confirmed ${confirmedHomeScore}-${confirmedAwayScore} · ${projection.unresolvedReviewCount} review${projection.unresolvedReviewCount === 1 ? "" : "s"}${possibleGoalEffect ? ` · possible ${possibleGoalEffect} goal effect` : ""}`
          : `Live provisional · revision ${projection.revision}`;
  const renderBench = (side: "own" | "opponent", vertical = false) => side === "own" ? (
    <LiveBenchRow label={`${ownAbbrev} bench`} color={ownColor} athletes={ownBench}
      timeline={timeline} selectedKey={selectedKey} onSelectOwn={selectOwn}
      callToAction={ownBenchCallToAction} align="left" orientation={vertical ? "vertical" : "horizontal"} />
  ) : (
    <LiveBenchRow label={`${oppAbbrev} ${oppBench.some((player) => oppPitchIds.has(player.id)) ? "bench / unplaced starters" : "bench"}`}
      color={oppColor} opponents={oppBench} visibility={visibility} timeline={timeline}
      selectedKey={selectedKey} onSelectOpp={selectOpp} callToAction={oppBenchCallToAction}
      align="right" orientation={vertical ? "vertical" : "horizontal"} />
  );

  if (matchQuery.isLoading || squadQuery.isLoading || eventsQuery.isLoading) {
    return (
      <div className="live-match flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#16d99a]" />
      </div>
    );
  }

  if (matchQuery.isError || squadQuery.isError || eventsQuery.isError) {
    const error = matchQuery.error ?? squadQuery.error ?? eventsQuery.error;
    return (
      <div className="live-match flex min-h-screen items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="size-8 text-[#e36a6d]" />
          <p className="font-oswald text-xl tracking-wide">
            FAILED TO LOAD MATCH
          </p>
          <p className="text-sm text-[#9ca39f]">
            {error instanceof Error ? error.message : "Something went wrong."}
          </p>
          <button
            type="button"
            className="rounded-lg border border-[#3e4448] px-4 py-2 text-sm"
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
    <div className={cn("live-match relative flex min-h-dvh flex-col", isPhone && phoneView === "logs" && "live-match-phone-logs")}>
      <header className="live-match-header shrink-0 items-center gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <SportLogo size={36} className="rounded-lg" />
          <h1 className="font-display text-base font-bold tracking-wide text-[#16d99a]">
            GAFFER
          </h1>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#3e4448] px-2.5 py-1.5 text-xs font-semibold text-[#c7ccc9] hover:border-[#16d99a]/60 hover:text-white"
          >
            <LayoutDashboard className="size-3.5" aria-hidden="true" />
            <span>Dashboard</span>
          </button>
        </div>
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
              <span className="mx-1.5 text-2xl text-[#9ca39f]">-</span>
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
          {!isPhone && projection ? (
            <div className="mt-1 flex justify-center">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]",
                  projection.finalisationState === "finalised"
                    ? "bg-[#16d99a]/12 text-[#16d99a]"
                    : projection.unresolvedReviewCount > 0 ||
                        projection.finalisationState === "amendment_required"
                      ? "bg-[#d6a447]/12 text-[#d6a447]"
                      : "bg-[#707773]/15 text-[#9ca39f]",
                )}
              >
                {projectionStatus}
              </span>
            </div>
          ) : null}
        </div>
        <div className="live-match-clock mt-1.5 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2a2e31] bg-[#0d0f10] px-3 py-0.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                running ? "animate-pulse bg-[#e36a6d]" : "bg-[#707773]",
              )}
            />
            <span className="font-oswald text-sm tabular-nums tracking-wide text-white">
              <LiveClockTime elapsedMs={elapsedMs} running={running} />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9ca39f]">
              {periodLabel}
            </span>
            {addedStoppageMin > 0 ? (
              <span className="rounded-full bg-[#d6a447]/15 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.12em] text-[#d6a447]">
                +{addedStoppageMin}
              </span>
            ) : null}
          </span>
        </div>
        <h2 className="live-match-tactical-label text-[10px] font-bold uppercase tracking-[0.22em] text-[#9ca39f]">
          Tactical view
        </h2>
        <div className="live-match-controls flex items-center gap-2">
          {!isPhone && matchId ? <OfflineSyncStatus matchId={matchId} /> : null}
          <div className="relative">
            <button
              type="button"
              aria-label="Match settings"
              className="rounded-md p-2 text-[#c7ccc9] hover:bg-white/5"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings className="size-5" />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-[#2a2e31] bg-[#111315] p-2 shadow-xl">
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
                {team?.role === "coach" && period !== "full_time" ? (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      setTacticsOpen(true);
                    }}
                  >
                    Change tactics
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
                      finaliseProjection.mutate({ expectedRevision: projection.revision, expectedSessionRevision: sessionReport?.reportRevision }, {
                        onSuccess: () =>
                          setToast({ label: sessionReport ? "Your team confirmed the report" : "Result finalised" }),
                        onError: (error) =>
                          setActionError(
                            error instanceof Error
                              ? error.message
                              : "Could not finalise the result.",
                          ),
                      });
                    }}
                  >
                    {sessionReport ? "Confirm report" : "Finalise result"}
                  </SettingsItem>
                ) : null}
                {team?.role === "coach" &&
                matchQuery.data?.projection &&
                matchQuery.data.projection.finalisationState !== "open" ? (
                  <SettingsItem
                    onClick={() => {
                      setSettingsOpen(false);
                      if (sessionReport?.finalisedAt) { navigate(`/matches/${matchId}/report?amendments=1`); return; }
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
                    {sessionReport?.finalisedAt ? "Review report amendments" : "Reopen result"}
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
              aria-label={running ? "Pause" : "Resume"}
              title={running ? "Pause" : "Resume"}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-[#2a2e31] px-3 py-1.5 text-xs font-semibold tracking-wide text-white sm:px-4 sm:text-sm"
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
              <span className="live-match-control-label">{running ? "Pause" : "Resume"}</span>
            </button>
          )}
          {liveLogging && period === "first_half" && (
            <button
              type="button"
              aria-label="Half Time"
              className="rounded-md bg-[#72a7d5] px-3 py-1.5 text-xs font-semibold tracking-wide text-white sm:px-4 sm:text-sm"
              onClick={() => setConfirm("half")}
            >
              <span className="live-match-control-label">Half Time</span>
              <span className="live-match-control-short" aria-hidden="true">HT</span>
            </button>
          )}
          {period === "full_time" && team?.role === "coach" && !sessionReport?.finalisedAt &&
            (!projection || projection.finalisationState === "open") ? (
            <button type="button" onClick={() => setResumeOpen(true)}
              className="rounded-md bg-[#16d99a] px-3 py-1.5 text-xs font-semibold tracking-wide text-[#06120e] sm:px-4 sm:text-sm">
              Resume match
            </button>
          ) : null}
          <button
            type="button"
            aria-label={match.eventStatus === "completed" ? "View report" : "End Match"}
            className="rounded-md bg-[#e23d3d] px-3 py-1.5 text-xs font-semibold tracking-wide text-white sm:px-4 sm:text-sm"
            onClick={() => {
              if (match.eventStatus === "completed") {
                navigate(`/matches/${matchId}/report`);
              } else {
                setActionError(null);
                setEndOpen(true);
              }
            }}
          >
            <span className="live-match-control-label">{match.eventStatus === "completed" ? "View report" : "End Match"}</span>
            <span className="live-match-control-short" aria-hidden="true">FT</span>
          </button>
          {isPhone && <button type="button" className="live-match-view-logs rounded-md border border-[#3e4448] text-xs font-semibold" onClick={() => { setBenchPanel(null); setPhoneView("logs"); }}>View logs</button>}
        </div>
        {isPhone && matchId ? <div className="live-match-phone-sync"><OfflineSyncStatus matchId={matchId} />{projection && <span className="live-match-phone-projection">{projectionStatus}</span>}</div> : null}
      </header>

      {reviewOpen && matchId ? (
        <EventReviewPanel
          matchId={matchId}
          expectedReviewCount={projection?.unresolvedReviewCount ?? 0}
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
        <div className="live-match-summary">
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
              className="shrink-0 text-center text-xs text-[#e36a6d]"
            >
              {actionError}
            </p>
          )}
        </div>

        {visibility === "none" ? (
          <div className="live-match-opponent-action">
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
                "w-full rounded-lg bg-[#B45309] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-sm sm:px-6 sm:py-3 sm:text-sm",
                "hover:bg-[#92400e]",
                selectedKey === "opp-generic" && "ring-2 ring-white/80",
              )}
            >
              {oppAbbrev} · log opponent
            </button>
          </div>
        ) : null}

        <section className="live-match-pitch-area flex min-h-0 flex-col">
          <h2 className="mb-1 shrink-0 text-[10px] font-bold uppercase tracking-[0.22em] text-[#9ca39f]">
            Tactical view
          </h2>
          <div className={cn("relative min-h-0 flex-1", isPhone && "live-match-phone-stage")}>
            {isPhone && <button ref={ownBenchTabRef} type="button" className="live-match-bench-tab live-match-bench-tab-own" style={{ backgroundColor: ownColor }} aria-label={`${ownName} bench`} aria-expanded={benchPanel === "own"} onClick={() => setBenchPanel(current => current === "own" ? null : "own")}><span>BENCH</span></button>}
            <div ref={phonePitchCentreRef} className={isPhone ? "live-match-phone-pitch-centre" : "contents"}>
            <LivePitch
              className={cn(
                "live-pitch-panel-landscape",
                isPhone && "live-pitch-panel-portrait",
              )}
              orientation={orientation}
              layout="full"
              ownHalf={ownHalf}
              ownColor={ownColor}
              oppColor={oppColor}
            >
              <LivePitchPlayers
                orientation={orientation}
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
            </LivePitch>
            </div>
            {isPhone && visibility !== "none" && oppBench.length > 0 && <button ref={oppBenchTabRef} type="button" className="live-match-bench-tab live-match-bench-tab-opponent" style={{ backgroundColor: oppColor }} aria-label={`${oppName} bench`} aria-expanded={benchPanel === "opponent"} onClick={() => setBenchPanel(current => current === "opponent" ? null : "opponent")}><span>BENCH</span></button>}
          </div>
        </section>

        <section
          className={cn(
            "live-match-bench-area grid min-h-0 grid-cols-2 gap-1 rounded-xl border bg-[#0d0f10] px-1.5 py-2",
            benchIncomingCallout || subOutCallout
              ? "border-[#d6a447]/55"
              : assistPick
                ? "border-[#16d99a]/40"
                : "border-[#2a2e31]",
          )}
        >
          {!isPhone && <>{renderBench("own")}{renderBench("opponent")}</>}
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
            <span className="relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d6a447]/20 text-[#d6a447]">
              {composer.kind === "mandatory-sub-in" ? (
                <HeartPulse className="size-5" aria-hidden="true" />
              ) : (
                <ArrowLeftRight className="size-5" aria-hidden="true" />
              )}
            </span>
            <div className="relative z-[1] min-w-0">
              <p className="font-oswald text-sm tracking-[0.22em] text-[#d6a447]">
                {composer.kind === "mandatory-sub-in"
                  ? "SUBSTITUTION REQUIRED"
                  : "PICK WHO COMES ON"}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#ecefed]">
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
            <span className="relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d6a447]/20 text-[#d6a447]">
              <ArrowLeftRight className="size-5" aria-hidden="true" />
            </span>
            <div className="relative z-[1] min-w-0">
              <p className="font-oswald text-sm tracking-[0.22em] text-[#d6a447]">
                PICK WHO COMES OFF
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#ecefed]">
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
            <span className="relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full bg-[#72a7d5]/20 text-[#82b2dc]">
              <BootIcon className="size-5" />
            </span>
            <div className="relative z-[1] min-w-0 flex-1">
              <p className="font-oswald text-sm tracking-[0.22em] text-[#82b2dc]">
                GOAL LOGGED — SELECT THE ASSIST
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#ecefed]">
                Tap the assisting teammate on the pitch, or choose no assist.
              </p>
            </div>
            <button
              type="button"
              className="relative z-[1] rounded-lg border border-[#82b2dc]/70 px-3 py-1.5 font-oswald text-[10px] tracking-widest text-[#b1cce4]"
              onClick={skipAssist}
            >
              NO ASSIST
            </button>
          </div>
        )}

        <div className="live-match-activity min-h-0">
          {isPhone && <button type="button" className="live-match-log-back rounded-lg border border-[#3e4448] px-3 py-2 text-sm font-semibold" onClick={() => setPhoneView("pitch")}>Back to pitch</button>}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#2a2e31] bg-[#0d0f10] p-2.5">
            <h2 className="shrink-0 text-[10px] font-bold uppercase tracking-[0.22em] text-[#9ca39f]">
              Match log
            </h2>
            {timeline.length === 0 ? (
              <p className="mt-3 text-center text-sm text-[#9ca39f]">
                No events yet.
              </p>
            ) : (
              <ul ref={phoneLogRef} onScroll={(event) => { if (isPhone && phoneView === "logs") phoneLogScrollRef.current = event.currentTarget.scrollTop; }} className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden">
                {timeline
                  .filter((event) => !isPairedAssistEvent(event, assistsByGoal))
                  .map((event) => {
                    const key = rowKey(event);
                    return (
                      <TimelineEventRow
                        key={key}
                        event={event}
                        assist={event.eventType === "goal" ? assistsByGoal.get(event.id) : undefined}
                        visibility={visibility}
                        ownName={ownName}
                        opponentName={oppName}
                        ownColor={ownColor}
                        opponentColor={oppColor}
                        score={runningScores.get(key)}
                        entering={enteringIdsRef.current.has(key)}
                        squad={squad}
                        opponentSquad={opponentSquad}
                        canUndo={period !== "full_time"}
                        onUndo={(eventId) => void handleUndo(eventId)}
                      />
                    );
                  })}
              </ul>
            )}
          </section>
        </div>

        {period === "half_time" && (
          <div
            className="live-match-pause-overlay flex min-h-0 items-center justify-center overflow-auto bg-[#090a0b]/70 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Half time"
          >
            <div className="w-full max-w-md rounded-2xl border border-[#2a2e31] bg-[#111315]/95 p-6 shadow-[0_0_40px_rgba(0,0,0,0.45)]">
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
                  <span className="mx-1.5 text-2xl text-[#9ca39f]">-</span>
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
                className="mt-6 w-full rounded-xl bg-[#16d99a] py-3 font-oswald tracking-widest text-[#06120e]"
                onClick={startSecondHalf}
              >
                START SECOND HALF
              </button>
              <button
                type="button"
                className="mt-2 w-full py-2 text-center text-xs font-medium tracking-wide text-[#9ca39f] hover:text-white"
                onClick={backToFirstHalf}
              >
                Back to 1st Half
              </button>
            </div>
          </div>
        )}
        {checkIn && (
          <div
            className="live-match-pause-overlay flex min-h-0 items-center justify-center overflow-auto bg-[#090a0b]/70 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={
              checkIn.period === "first_half"
                ? "End of first half check-in"
                : "End of match check-in"
            }
            onClick={dismissCheckIn}
          >
            <div className="w-full max-w-md rounded-2xl border border-[#d6a447]/50 bg-[#111315]/95 p-6 text-center shadow-[0_0_40px_rgba(255,190,46,0.18)]">
              <p className="font-oswald text-2xl tracking-[0.28em] text-[#d6a447] sm:text-3xl">
                {checkIn.period === "first_half"
                  ? "END OF 1ST HALF"
                  : "END OF MATCH"}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#9ca39f]">
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
              <p className="mt-4 text-sm text-[#c7ccc9]">
                {checkIn.period === "first_half"
                  ? "Half time starts automatically when this reaches zero."
                  : "The match ends automatically when this reaches zero."}
              </p>
              <button
                type="button"
                className="mt-6 w-full rounded-xl bg-[#d6a447] py-3 font-oswald tracking-widest text-[#06120e]"
                onClick={dismissCheckIn}
              >
                CONTINUE — PLAYING ADDED TIME
              </button>
              <p className="mt-3 text-[11px] text-[#9ca39f]">
                Tap anywhere to keep the clock running. You then end the{" "}
                {checkIn.period === "first_half" ? "half" : "match"} yourself.
              </p>
            </div>
          </div>
        )}
        {liveLogging && !running && !checkIn && (
          <div
            className="live-match-pause-overlay flex min-h-0 items-center justify-center bg-[#090a0b]/70 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Match paused"
          >
            <button
              type="button"
              onClick={startClock}
              className={cn(
                "flex flex-col items-center gap-3 rounded-2xl border border-[#16d99a]/70 bg-[#111315]/90 px-10 py-7",
                "shadow-[0_0_40px_rgba(22,217,154,0.12)]",
                "transition hover:border-[#16d99a] hover:bg-[#111315] hover:shadow-[0_0_48px_rgba(22,217,154,0.18)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16d99a] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
              )}
            >
              <span className="flex size-16 items-center justify-center rounded-full border-2 border-[#16d99a] bg-[#090a0b] sm:size-[4.5rem]">
                <Play className="size-8 fill-[#16d99a] text-[#16d99a]" />
              </span>
              <span className="font-oswald text-xl tracking-[0.28em] text-[#16d99a] sm:text-2xl">
                RESUME
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9ca39f]">
                Match paused
              </span>
            </button>
          </div>
        )}
      </div>

      {period === "not_started" && (
        <div
          className="live-match-kickoff-overlay flex items-center justify-center bg-[#090a0b]/70 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Start game"
        >
          <button
            type="button"
            onClick={startFirstHalf}
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border border-[#16d99a]/70 bg-[#111315]/90 px-10 py-7",
              "shadow-[0_0_40px_rgba(22,217,154,0.12)]",
              "transition hover:border-[#16d99a] hover:bg-[#111315] hover:shadow-[0_0_48px_rgba(22,217,154,0.18)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16d99a] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
            )}
          >
            <span className="flex size-16 items-center justify-center rounded-full border-2 border-[#16d99a] bg-[#090a0b] sm:size-[4.5rem]">
              <GiWhistle className="size-9 text-[#16d99a]" aria-hidden />
            </span>
            <span className="font-oswald text-xl tracking-[0.28em] text-[#16d99a] sm:text-2xl">
              START GAME
            </span>
          </button>
        </div>
      )}

      {isPhone && <Dialog open={benchPanel !== null} onOpenChange={(open) => { if (!open) setBenchPanel(null); }}>
        <DialogContent className={cn("live-match-phone-bench-panel", (benchPanel ?? lastBenchSideRef.current) === "own" ? "live-match-phone-bench-left" : "live-match-phone-bench-right")}
          finalFocus={() => lastBenchSideRef.current === "own" ? ownBenchTabRef.current : oppBenchTabRef.current}>
          <DialogTitle>{(benchPanel ?? lastBenchSideRef.current) === "own" ? ownName : oppName} bench</DialogTitle>
          <div className="live-match-phone-bench-body">{renderBench(benchPanel ?? lastBenchSideRef.current, true)}</div>
        </DialogContent>
      </Dialog>}

      {eventPickerOpen && target && (
        <Overlay onClose={() => setEventPickerOpen(false)} wide>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9ca39f]">
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
              className="rounded-lg border border-[#3e4448] px-3 py-1.5 text-sm text-[#9ca39f] hover:text-white"
              onClick={() => setEventPickerOpen(false)}
            >
              CLOSE
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <LogButton
              label="Goal"
              color="#16d99a"
              disabled={!pitchLogEnabled}
              onClick={() => handleAction("goal")}
              icon={<SoccerBallIcon className="size-7" />}
            />
            <LogButton
              label="Yellow"
              color="#d7ba55"
              disabled={!logEnabled}
              onClick={() => handleAction("yellow_card")}
              icon={
                <span className="inline-block h-6 w-4 rounded-[2px] bg-[#d7ba55] shadow-[0_0_0_1px_rgba(16,32,24,0.7)]" />
              }
            />
            <LogButton
              label="Red"
              color="#e36a6d"
              disabled={!logEnabled}
              onClick={() => handleAction("red_card")}
              icon={
                <span className="inline-block h-6 w-4 rounded-[2px] bg-[#e36a6d] shadow-[0_0_0_1px_rgba(255,255,255,0.75)]" />
              }
            />
            <LogButton
              label="Substitution"
              color="#d7ba55"
              disabled={!logEnabled}
              onClick={() => handleAction("substitution")}
              icon={<ArrowLeftRight className="size-6" />}
            />
            <LogButton
              label="Penalty"
              color="#48e3af"
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
            {targetIsGoalkeeper ? (
              <LogButton
                label="Save"
                color="#67e8f9"
                disabled={!pitchLogEnabled}
                onClick={() => handleAction("goalkeeper_save")}
                icon={<Hand className="size-7" />}
              />
            ) : null}
          </div>
          {targetIsBench && (
            <p className="mt-3 text-xs text-[#9ca39f]">
              Bench players can receive cards or be selected for a substitution.
            </p>
          )}
        </Overlay>
      )}

      {toast && (
        <div
          className={cn(
            "live-match-undo-toast fixed bottom-4 left-1/2 z-40 w-[min(92%,28rem)] -translate-x-1/2 rounded-xl bg-[#111315] px-4 py-3 shadow-lg",
            toast.id
              ? "border border-[#16d99a]/40"
              : "border border-[#e36a6d]/40",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[#ecefed]">{toast.label}</p>
            {toast.id ? (
              <button
                type="button"
                className="font-oswald text-xs tracking-widest text-[#16d99a]"
                onClick={() => void handleUndo(toast.id!)}
              >
                UNDO
              </button>
            ) : null}
          </div>
        </div>
      )}

      {tacticsOpen && (
        <LiveTacticsSheet
          plan={effectivePlan}
          playerCount={matchPlayerCount}
          onPitch={ownState.onPitch}
          minute={currentMinute}
          onApply={(change) => void logTacticalChange(change)}
          onClose={() => setTacticsOpen(false)}
        />
      )}

      {composer.kind === "injury-detail" && (
        <LiveInjurySheet
          athlete={composer.athlete}
          minute={composer.minute}
          onConfirm={(spec) => {
            /* Hand straight over to the mandatory substitution: the coach
               still has to bring someone on, and the record is created in
               the background by persistEvent. */
            setComposer(
              mandatorySubInComposer({
                kind: "own",
                athlete: composer.athlete,
              }),
            );
            persistFromTarget("injury", undefined, spec);
          }}
          onSkip={() => {
            setComposer(
              mandatorySubInComposer({
                kind: "own",
                athlete: composer.athlete,
              }),
            );
            persistFromTarget("injury");
          }}
          onClose={closeComposer}
        />
      )}

      {composer.kind === "penalty-outcome" && (
        <Overlay onClose={closeComposer}>
          <p className="font-oswald text-2xl tracking-widest">PENALTY</p>
          <p className="mt-1 text-sm text-[#9ca39f]">
            {loggingForLabel(target, visibility)}
          </p>
          <div className="mt-8 grid gap-3">
            <button
              type="button"
              className="rounded-2xl border-2 border-[#16d99a] bg-[#16d99a]/10 py-6 font-oswald text-xl tracking-widest text-[#16d99a]"
              onClick={() => persistFromTarget("goal", PENALTY_SCORED_DETAIL)}
            >
              SCORED
            </button>
            <button
              type="button"
              className="rounded-2xl border-2 border-[#9ca39f] bg-[#111315] py-6 font-oswald text-xl tracking-widest"
              onClick={() => setComposer({ kind: "penalty-miss-reason" })}
            >
              MISSED
            </button>
          </div>
        </Overlay>
      )}

      {composer.kind === "penalty-miss-reason" && (
        <Overlay onClose={closeComposer}>
          <p className="font-oswald text-2xl tracking-widest">MISSED</p>
          <p className="mt-1 text-sm text-[#9ca39f]">
            {loggingForLabel(target, visibility)}
          </p>
          <div className="mt-8 grid gap-3">
            <button
              type="button"
              className="rounded-2xl border-2 border-[#9ca39f] bg-[#111315] py-6 font-oswald text-xl tracking-widest"
              onClick={() =>
                persistFromTarget("penalty", PENALTY_MISSED_DETAIL)
              }
            >
              MISSED TARGET
            </button>
            <button
              type="button"
              className="rounded-2xl border-2 border-[#67e8f9] bg-[#67e8f9]/10 py-6 font-oswald text-xl tracking-widest text-[#67e8f9]"
              onClick={() => void persistPenaltySavedByKeeper()}
            >
              SAVED BY KEEPER
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
              className="rounded-xl bg-[#16d99a] py-3 font-oswald tracking-widest text-[#06120e]"
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
              className="rounded-xl border border-[#3e4448] py-3 font-oswald tracking-widest"
              onClick={() => setConfirm(null)}
            >
              NO, GO BACK
            </button>
          </div>
        </Overlay>
      )}

      {resumeOpen ? <ResumeMatchDialog match={match} onClose={() => setResumeOpen(false)}
        onResumed={() => { setEndOpen(false); setCheckIn(null); }} /> : null}
      {endOpen && (
        <Overlay onClose={() => { if (!finishMatch.isPending) setEndOpen(false); }}>
          <p className="font-oswald text-2xl tracking-widest">END MATCH?</p>
          <p className="mt-4 text-sm text-[#9ca39f]">
            {match.sharedSessionId
              ? "This ends live play for both teams and saves the report. Check the score before confirming."
              : "This ends live play and saves the report. Check the score before confirming."}
          </p>
          {actionError ? <p role="alert" className="mt-3 text-sm text-[#e36a6d]">{actionError}</p> : null}
          <div className="mt-6 space-y-2 rounded-xl border border-[#2a2e31] bg-[#111315] p-4 font-oswald tracking-wide">
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
              className="rounded-xl bg-[#16d99a] py-3 font-oswald tracking-widest text-[#06120e]"
              onClick={() => void handleFinish()}
              disabled={finishMatch.isPending}
            >
              {finishMatch.isPending ? "SAVING…" : "END MATCH & SAVE REPORT"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-[#3e4448] py-3 font-oswald tracking-widest"
              onClick={() => setEndOpen(false)}
              disabled={finishMatch.isPending}
            >
              NO, GO BACK
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function timelinePersonLabel(
  event: MatchLogEvent,
  visibility: OpponentSquadVisibility,
) {
  const sharedLabel = sessionPlayerLabel(event);
  if (sharedLabel) return sharedLabel;
  if (event.athlete) return shirtLabel(event.athlete);
  if (event.opponentPlayer) return opponentShirtLabel(event.opponentPlayer, visibility);
  return event.opponentLabel ?? "Unassigned";
}

function TimelineSyncStatus({ event }: { event: MatchLogEvent }) {
  if (event.lifecycleStatus === "needs_review") {
    return <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#d6a447]">Possible duplicate · coach review needed</p>;
  }
  const statusCopy: Partial<Record<NonNullable<MatchLogEvent["syncStatus"]>, { text: string; color: string }>> = {
    queued: { text: "Saved on this device", color: "text-[#d6a447]" },
    uploading: { text: "Uploading", color: "text-[#d6a447]" },
    accepted: { text: "Accepted · awaiting reconciliation", color: "text-[#72a7d5]" },
    dependency_pending: { text: "Waiting for an earlier change", color: "text-[#d6a447]" },
    quarantined: { text: "Access changed · retained on this device", color: "text-[#e36a6d]" },
    reconciled: { text: "Reconciled", color: "text-[#16d99a]" },
    rejected: { text: `Sync rejected · ${event.syncError}`, color: "text-[#e36a6d]" },
  };
  const copy = event.syncStatus ? statusCopy[event.syncStatus] : undefined;
  if (!copy) return null;
  return <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide ${copy.color}`}>{copy.text}</p>;
}

function TimelineEventRow({
  event,
  assist,
  visibility,
  ownName,
  opponentName,
  ownColor,
  opponentColor,
  score,
  entering,
  squad,
  opponentSquad,
  canUndo,
  onUndo,
}: {
  event: MatchLogEvent;
  assist?: MatchLogEvent;
  visibility: OpponentSquadVisibility;
  ownName: string;
  opponentName: string;
  ownColor: string;
  opponentColor: string;
  score?: string;
  entering: boolean;
  squad: MatchSquadAthlete[];
  opponentSquad: OpponentMatchPlayer[];
  canUndo: boolean;
  onUndo: (eventId: string) => void;
}) {
  const teamBorder = event.team === "own" ? ownColor : opponentColor;
  const assistWho = assist ? timelinePersonLabel(assist, visibility) : null;
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border border-[#2a2e31] border-l-4 bg-[#111315] px-3 py-2.5",
        event.pending && "opacity-55",
        entering && "live-timeline-enter",
      )}
      style={{ borderLeftColor: teamBorder }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <EventTypeGlyph eventType={event.eventType} secondYellow={isSecondYellow(event)} />
        <div className="min-w-0">
          <p className="font-oswald text-sm tracking-wide">
            {event.minute}&apos; {eventDisplayLabel(event)}
            {event.eventType === "goal" && score ? `  ${score}` : ""}
          </p>
          <p className="truncate text-xs text-[#9ca39f]">
            {event.team === "own" ? ownName : opponentName} · {timelinePersonLabel(event, visibility)}
            {assistWho ? `, Assist: ${assistWho}` : ""}
            {substitutionIncoming(event, squad, opponentSquad)}
          </p>
          <TimelineSyncStatus event={event} />
        </div>
      </div>
      {canUndo && !event.pending && (
        <button
          type="button"
          aria-label="Undo event"
          className="rounded-md p-2 text-[#9ca39f]"
          onClick={() => onUndo(event.id)}
        >
          <RotateCcw className="size-4" />
        </button>
      )}
    </li>
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
      className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#ecefed] hover:bg-white/5"
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
    return mixHex("#16d99a", "#111315", 0.48);
  }
  return mixHex(color, "#111315", accentIsLight(color) ? 0.82 : 0.48);
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
          "live-match-event-overlay relative z-10 w-full rounded-2xl border border-[#2a2e31] bg-[#090a0b] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
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
      <p className="text-[#9ca39f]">{ownName}</p>
      <p className="text-[#9ca39f]"> </p>
      <p className="text-[#9ca39f]">{oppName}</p>
      {rows.map((row) => (
        <Fragment key={row.type}>
          <p className="font-oswald text-2xl">
            {halfTimeCount(timeline, row.type, "own")}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-[#9ca39f]">
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
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-[#2a2e31] bg-[#111315] px-3 py-1.5">
        <p className="font-oswald text-sm tracking-widest">{title}</p>
        <div className="flex shrink-0 gap-2">
          {onBack && (
            <button
              type="button"
              className="rounded-md border border-[#3e4448] px-3 py-1 text-xs tracking-wide"
              onClick={onBack}
            >
              {backLabel}
            </button>
          )}
          <button
            type="button"
            className="rounded-md bg-[#16d99a] px-3 py-1 font-oswald text-xs tracking-widest text-[#06120e] disabled:opacity-40"
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
    <div className="mt-6 rounded-2xl border border-[#2a2e31] bg-[#111315] p-5">
      <p className="font-oswald text-center text-2xl tracking-widest">
        {title}
      </p>
      <div className="mt-5 grid grid-cols-3 text-center text-sm">
        <p className="text-[#9ca39f]">{ownName}</p>
        <p className="text-[#9ca39f]"> </p>
        <p className="text-[#9ca39f]">{oppName}</p>
        <p className="font-oswald text-2xl">{count("goal", "own")}</p>
        <p className="text-[10px] uppercase tracking-widest text-[#9ca39f]">
          Goals
        </p>
        <p className="font-oswald text-2xl">{count("goal", "opponent")}</p>
        <p className="font-oswald text-2xl">{count("yellow_card", "own")}</p>
        <p className="text-[10px] uppercase tracking-widest text-[#9ca39f]">
          Yellow
        </p>
        <p className="font-oswald text-2xl">
          {count("yellow_card", "opponent")}
        </p>
        <p className="font-oswald text-2xl">{count("red_card", "own")}</p>
        <p className="text-[10px] uppercase tracking-widest text-[#9ca39f]">
          Red
        </p>
        <p className="font-oswald text-2xl">{count("red_card", "opponent")}</p>
      </div>
      <button
        type="button"
        className="mt-6 w-full rounded-xl bg-[#16d99a] py-3 font-oswald tracking-widest text-[#06120e] disabled:opacity-40"
        onClick={onContinue}
        disabled={continueDisabled}
      >
        {continueLabel}
      </button>
      {onBack && (
        <button
          type="button"
          className="mt-3 w-full rounded-xl border border-[#3e4448] py-3 font-oswald tracking-widest"
          onClick={onBack}
        >
          {backLabel}
        </button>
      )}
    </div>
  );
}

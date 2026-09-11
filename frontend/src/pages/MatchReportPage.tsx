import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeftRight,
  ChevronLeft,
  Loader2,
  Plus,
  Share2,
  ShieldAlert,
  Square,
  Timer,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useGamePlan } from "@/features/team-tactics/api";
import { AthletePicker, OpponentPlayerPicker } from "@/features/matches/AthletePicker";
import {
  useDeleteMatchEvent,
  useLogMatchEvent,
  useMatch,
  useMatchEvents,
  useMatchSquad,
  useUpdateMatchEvent,
} from "@/features/matches/hooks";
import {
  emptyEventDraft,
  linkedSubstitutionForInjury,
  looksLikeId,
  opponentPlayerLabel,
  planAddEvent,
  planEditEvent,
  usesOpponentRoster,
  type EventFormDraft,
  type PlannedOp,
} from "@/features/matches/match-report-event-form";
import type {
  MatchEventTeam,
  MatchEventType,
  MatchLogEvent,
  MatchSquadAthlete,
  OpponentMatchPlayer,
  OpponentSquadVisibility,
} from "@/features/matches/types";
import {
  EVENT_COLOR,
  EVENT_LABEL,
  eventDisplayLabel,
  isPairedAssistEvent,
  isSecondYellow,
  linkedAssistsForGoal,
  pairAssistsToGoals,
  uniqueTimelineEvents,
} from "@/features/matches/event-visuals";
import { EventTypeGlyph } from "@/features/matches/EventTypeGlyph";
import {
  EventBreakdownChart,
  ScoreProgressionChart,
  TeamComparisonChart,
} from "@/features/matches/match-report-charts";
import { matchFacts, matchStory } from "@/features/matches/match-report-model";
import {
  LiveBenchRow,
  LivePitch,
  LivePitchPlayers,
} from "@/features/matches/live-tactical-view";
import {
  opponentPitchState,
  ownPitchState,
  placeOppPlayers,
  placeOwnPlayers,
  resolveOppColor,
  resolveOwnColor,
  teamAbbrev,
} from "@/features/matches/live-match-model";
import "./LiveMatchPage.css";
import "./MatchReportPage.css";

type Tab = "match" | "squad" | "events";

const EVENT_TYPES: { value: MatchEventType; label: string }[] = [
  { value: "goal", label: EVENT_LABEL.goal },
  { value: "yellow_card", label: EVENT_LABEL.yellow_card },
  { value: "red_card", label: EVENT_LABEL.red_card },
  { value: "substitution", label: EVENT_LABEL.substitution },
  { value: "penalty", label: EVENT_LABEL.penalty },
  { value: "injury", label: EVENT_LABEL.injury },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "match", label: "Match Center" },
  { id: "squad", label: "Squad & Tactics" },
  { id: "events", label: "Match Events" },
];

function lastName(athlete: MatchSquadAthlete) {
  return athlete.lastName || athlete.firstName;
}

function shirtLabel(athlete: MatchSquadAthlete) {
  return athlete.squadNumber != null
    ? `#${athlete.squadNumber} ${lastName(athlete)}`
    : `${athlete.firstName} ${athlete.lastName}`.trim();
}

function whoLabel(event: MatchLogEvent, squad: MatchSquadAthlete[]) {
  if (event.athlete) {
    return shirtLabel(event.athlete);
  }
  if (event.opponentPlayer) {
    return event.opponentPlayer.name
      ? `#${event.opponentPlayer.shirtNumber} ${event.opponentPlayer.name}`
      : `#${event.opponentPlayer.shirtNumber}`;
  }
  if (event.opponentLabel) {
    return event.opponentLabel;
  }
  if (event.athleteId) {
    const athlete = squad.find((player) => player.id === event.athleteId);
    if (athlete) {
      return shirtLabel(athlete);
    }
  }
  return "Unassigned";
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

function formatMatchDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function minuteOrDash(value: number | null) {
  return value == null ? "—" : `${value}'`;
}

function AdjustedBadge() {
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ffbe2e] bg-[#ffbe2e]/15">
      Manually adjusted
    </span>
  );
}

/**
 * Post-match report: result header, summary/timeline/player tabs,
 * post-match add, overwrite editing, and confirmed delete of logged events.
 */
export default function MatchReportPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { team } = useAuth();

  const matchQuery = useMatch(matchId);
  const squadQuery = useMatchSquad(matchId);
  const eventsQuery = useMatchEvents(matchId);
  const gamePlanSnapshot = matchQuery.data?.gamePlanSnapshot ?? undefined;
  const gamePlanQuery = useGamePlan(
    gamePlanSnapshot ? undefined : (matchQuery.data?.gamePlanId ?? undefined),
  );
  const gamePlan = gamePlanSnapshot ?? gamePlanQuery.data;
  const updateEvent = useUpdateMatchEvent(matchId ?? "");
  const deleteEvent = useDeleteMatchEvent(matchId ?? "");
  const logEvent = useLogMatchEvent(matchId ?? "");

  const [tab, setTab] = useState<Tab>("match");
  const [editing, setEditing] = useState<MatchLogEvent | null>(null);
  const [deleting, setDeleting] = useState<MatchLogEvent | null>(null);
  const [adding, setAdding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const squad = useMemo(() => squadQuery.data ?? [], [squadQuery.data]);
  const timeline = useMemo(() => {
    const rows = uniqueTimelineEvents(eventsQuery.data ?? []);
    return [...rows].sort((a, b) => {
      const byMinute = a.minute - b.minute;
      if (byMinute !== 0) {
        return byMinute;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [eventsQuery.data]);

  const ownName = team?.name ?? "US";
  const match = matchQuery.data;
  const oppName = match?.opponentName ?? "OPP";
  const isHome = match?.isHome ?? true;
  const visibility = match?.opponentSquadVisibility ?? "none";
  const ownColor = resolveOwnColor(match?.teamColor, team?.primaryColor);
  const oppColor = resolveOppColor(match?.opponentColor);
  const ownHalf = isHome ? "left" : "right";
  const oppHalf = isHome ? "right" : "left";
  const teamScore = match?.teamScore ?? 0;
  const oppScore = match?.opponentScore ?? 0;
  const homeName = isHome ? ownName : oppName;
  const awayName = isHome ? oppName : ownName;
  const homeScore = isHome ? teamScore : oppScore;
  const awayScore = isHome ? oppScore : teamScore;
  const homeColor = isHome ? ownColor : oppColor;
  const awayColor = isHome ? oppColor : ownColor;
  const ownAbbrev = teamAbbrev(ownName);
  const oppAbbrev = teamAbbrev(oppName);

  const ownState = useMemo(
    () => ownPitchState(squad, timeline),
    [squad, timeline],
  );
  const oppState = useMemo(
    () => opponentPitchState(match?.opponentSquad ?? [], timeline),
    [match?.opponentSquad, timeline],
  );
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

  const playerStats = useMemo(() => {
    return squad.map((athlete) => {
      const ownEvents = timeline.filter(
        (event) => event.athleteId === athlete.id,
      );
      return {
        athlete,
        goals: ownEvents.filter((event) => event.eventType === "goal").length,
        assists: ownEvents.filter((event) => event.eventType === "assist")
          .length,
        yellow: ownEvents.filter((event) => event.eventType === "yellow_card")
          .length,
        red: ownEvents.filter((event) => event.eventType === "red_card")
          .length,
      };
    });
  }, [squad, timeline]);

  const topPerformers = useMemo(
    () =>
      [...playerStats]
        .filter((row) => row.goals > 0 || row.assists > 0)
        .sort(
          (left, right) =>
            right.goals - left.goals || right.assists - left.assists,
        )
        .slice(0, 3),
    [playerStats],
  );

  const assistsByGoal = pairAssistsToGoals(timeline);
  const goals = timeline.filter((event) => event.eventType === "goal");
  const facts = matchFacts(timeline);
  const story = matchStory({
    ownName,
    oppName,
    teamScore,
    oppScore,
    goals,
    squad,
  });

  const shareReport = async () => {
    const url = window.location.href;
    const title = `${ownName} ${teamScore}-${oppScore} ${oppName}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text: story, url });
        return;
      }
      await navigator.clipboard.writeText(`${title}\n${story}\n${url}`);
      setShareNote("Link copied");
      window.setTimeout(() => setShareNote(null), 2500);
    } catch {
      setShareNote("Could not share");
      window.setTimeout(() => setShareNote(null), 2500);
    }
  };

  const confirmDeleteEvent = async () => {
    if (!deleting || deleting.pending) {
      return;
    }
    setDeleteError(null);
    const linkedAssists = linkedAssistsForGoal(timeline, deleting);
    try {
      await deleteEvent.mutateAsync(deleting.id);
      for (const assist of linkedAssists) {
        await deleteEvent.mutateAsync(assist.id);
      }
      setDeleting(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Could not delete this event.",
      );
    }
  };

  const persistPlannedOps = async (ops: PlannedOp[]) => {
    let primaryId: string | undefined;
    for (const op of ops) {
      if (op.kind === "create") {
        if (op.detailFromPrimary && !primaryId) {
          throw new Error("Could not link the assist to the goal.");
        }
        const input = op.detailFromPrimary
          ? { ...op.input, detail: primaryId }
          : op.input;
        const created = await logEvent.mutateAsync(input);
        if (op.captureId) {
          primaryId = created.id;
        }
      } else if (op.kind === "update") {
        await updateEvent.mutateAsync({
          eventId: op.eventId,
          input: op.input,
        });
      } else {
        await deleteEvent.mutateAsync(op.eventId);
      }
    }
  };

  const formPending =
    logEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  if (matchQuery.isLoading || squadQuery.isLoading || eventsQuery.isLoading) {
    return (
      <div className="match-report flex min-h-[70dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#00d99a]" />
      </div>
    );
  }

  if (matchQuery.isError || squadQuery.isError || eventsQuery.isError) {
    const error = matchQuery.error ?? squadQuery.error ?? eventsQuery.error;
    return (
      <div className="match-report flex min-h-[70dvh] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="size-8 text-[#ff5b5f]" />
          <p className="font-oswald text-xl tracking-wide">FAILED TO LOAD REPORT</p>
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

  if (!match) {
    return (
      <div className="match-report flex min-h-[70dvh] items-center justify-center">
        <p className="font-oswald text-xl tracking-wide">MATCH NOT FOUND</p>
      </div>
    );
  }

  const metaLine = [
    match.competitionName ?? "Friendly",
    formatMatchDate(match.eventScheduledAt),
    match.eventLocation,
  ]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  return (
    <div className="match-report min-h-full overflow-x-hidden">
      <header className="border-b border-[#1c2b36]">
        <div className="w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[#8e9ba8] transition-colors hover:text-white"
            onClick={() => navigate("/live-logger")}
          >
            <ChevronLeft className="size-4" />
            Back to Live Logger
          </button>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-oswald text-2xl font-semibold uppercase tracking-widest text-white sm:text-3xl">
                Match Report
              </h1>
              <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8e9ba8] sm:text-xs">
                {metaLine}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#00d99a] text-[#07110f] transition-opacity hover:opacity-90"
              onClick={() => void shareReport()}
              aria-label="Share match report"
            >
              <Share2 className="size-4" />
            </button>
          </div>
          {shareNote ? (
            <p className="mt-2 text-right text-[11px] text-[#00d99a]">{shareNote}</p>
          ) : null}
        </div>
      </header>

      <div className="w-full px-4 pb-12 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <div className="mb-5 flex w-full max-w-md justify-center rounded-xl border border-[#1c2b36] bg-[#101920] p-1 shadow-inner">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex-1 rounded-lg px-1 py-2 font-oswald text-[10px] tracking-wide transition-colors sm:text-sm",
                item.id === "events" && "xl:hidden",
                tab === item.id
                  ? "bg-[#0f3d32] font-semibold text-white shadow-sm"
                  : "bg-transparent text-[#c5ced6] hover:text-white",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {(tab === "match" || tab === "events") && (
          <div
            className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12"
          >
            {/* Left Column: Score, Facts, Analytical Charts */}
            <div
              className={cn(
                "space-y-5 xl:col-span-7",
                tab === "events" && "hidden xl:block",
              )}
            >
              <section className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4 sm:p-5">
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:gap-3">
                  <div className="min-w-0 text-left">
                    <p className="truncate font-oswald text-lg tracking-wide text-white sm:text-2xl">
                      {homeName}
                    </p>
                    <span
                      className="mt-1 block h-1 w-12 rounded-full"
                      style={{ backgroundColor: homeColor }}
                    />
                  </div>
                  <div className="rounded-xl border border-[#1c2b36]/60 bg-[#0c1218] px-4 py-2">
                    <p className="font-oswald text-3xl leading-none tabular-nums sm:text-5xl">
                      <span style={{ color: homeColor }}>{homeScore}</span>
                      <span className="mx-2 text-2xl text-white">-</span>
                      <span style={{ color: awayColor }}>{awayScore}</span>
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="truncate font-oswald text-lg tracking-wide text-white sm:text-2xl">
                      {awayName}
                    </p>
                    <span
                      className="ml-auto mt-1 block h-1 w-12 rounded-full"
                      style={{ backgroundColor: awayColor }}
                    />
                  </div>
                </div>
                <p className="mt-5 border-l-2 border-[#00d99a] pl-3 text-sm leading-relaxed text-[#c5ced6]">
                  {story}
                </p>
              </section>

              <section>
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
                  Match facts
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <FactCard
                    label="First goal"
                    value={minuteOrDash(facts.firstGoalMinute)}
                    color="#00d99a"
                    icon={<Zap className="size-4" />}
                  />
                  <FactCard
                    label="First card"
                    value={minuteOrDash(facts.firstCardMinute)}
                    color="#f5c518"
                    icon={<Square className="size-3.5 fill-current" />}
                  />
                  <FactCard
                    label="Substitutions"
                    value={String(facts.substitutionCount)}
                    color="#c084fc"
                    icon={<ArrowLeftRight className="size-4" />}
                  />
                  <FactCard
                    label="Total events logged"
                    value={String(facts.totalEvents)}
                    color="#ff8fab"
                    icon={<Timer className="size-4" />}
                  />
                </div>
              </section>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
                  <TeamComparisonChart
                    events={timeline}
                    ownName={ownAbbrev}
                    oppName={oppAbbrev}
                    ownColor={ownColor}
                    oppColor={oppColor}
                  />
                </div>
                <div className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
                  <ScoreProgressionChart
                    events={timeline}
                    ownName={ownAbbrev}
                    oppName={oppAbbrev}
                    ownColor={ownColor}
                    oppColor={oppColor}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
                <EventBreakdownChart
                  events={timeline}
                  ownName={ownAbbrev}
                  oppName={oppAbbrev}
                  ownColor={ownColor}
                  oppColor={oppColor}
                />
              </div>
            </div>

            {/* Right Column: Match Events Feed */}
            <div
              className={cn(
                "space-y-4 xl:sticky xl:top-4 xl:col-span-5 xl:block",
                tab === "match" && "hidden",
              )}
            >
              <section className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
                <div className="mb-4 flex items-center justify-between border-b border-[#1c2b36] pb-3">
                  <div>
                    <h2 className="font-oswald text-sm font-semibold uppercase tracking-wider text-white">
                      Match Events
                    </h2>
                    <p className="text-[11px] text-[#8e9ba8]">
                      {timeline.length} {timeline.length === 1 ? "event" : "events"} logged
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#00d99a]/40 bg-[#00d99a]/10 px-3 py-1.5 font-oswald text-xs tracking-wider text-[#00d99a] transition-colors hover:bg-[#00d99a]/20"
                    onClick={() => {
                      setAddError(null);
                      setAdding(true);
                    }}
                  >
                    <Plus className="size-3.5" />
                    Add Event
                  </button>
                </div>

                {timeline.length === 0 ? (
                  <div className="py-8 text-center">
                    <Timer className="mx-auto mb-2 size-8 text-[#8e9ba8]/40" />
                    <p className="text-sm text-[#8e9ba8]">No events logged yet.</p>
                  </div>
                ) : (
                  <div className="max-h-[32rem] overflow-y-auto pr-1 xl:max-h-[38rem]">
                    <ul className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute bottom-3 left-[9px] top-3 w-px bg-[#1c2b36]"
                      />
                      {timeline
                        .filter((event) => !isPairedAssistEvent(event, assistsByGoal))
                        .map((event) => (
                          <li
                            key={event.optimisticKey ?? event.id}
                            className={cn(
                              "relative flex gap-3 pb-3.5 last:pb-0",
                              event.pending && "opacity-55",
                            )}
                          >
                            <span
                              className="relative z-10 mt-3 size-[19px] shrink-0 rounded-full border-2 bg-[#070d12]"
                              style={{ borderColor: EVENT_COLOR[event.eventType] }}
                            >
                              <span
                                className="absolute inset-[3px] rounded-full"
                                style={{ background: EVENT_COLOR[event.eventType] }}
                              />
                            </span>
                            <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
                              <button
                                type="button"
                                className="min-w-0 flex-1 rounded-xl border border-[#1c2b36] bg-[#0c1218] px-3 py-2.5 text-left transition-colors hover:border-[#00d99a]/40 hover:bg-[#101920]"
                                onClick={() => {
                                  if (event.pending) {
                                    return;
                                  }
                                  setSaveError(null);
                                  setEditing(event);
                                }}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex min-w-0 items-start gap-2">
                                    <EventTypeGlyph
                                      eventType={event.eventType}
                                      secondYellow={isSecondYellow(event)}
                                    />
                                    <div className="min-w-0">
                                      <p className="font-oswald text-xs tracking-wide text-white sm:text-sm">
                                        {event.minute}&apos; {eventDisplayLabel(event)}
                                      </p>
                                      <p className="truncate text-[11px] text-[#8e9ba8]">
                                        {event.team === "own" ? ownName : oppName} ·{" "}
                                        {whoLabel(event, squad)}
                                        {event.eventType === "goal" &&
                                        assistsByGoal.get(event.id)
                                          ? `, Assist: ${whoLabel(assistsByGoal.get(event.id)!, squad)}`
                                          : ""}
                                        {substitutionIncoming(event, squad)}
                                      </p>
                                      {event.detail &&
                                        event.eventType !== "substitution" &&
                                        event.eventType !== "assist" &&
                                        event.eventType !== "goal" &&
                                        !isSecondYellow(event) && (
                                          <p className="mt-0.5 text-[11px] text-[#8e9ba8]">
                                            {event.detail}
                                          </p>
                                        )}
                                    </div>
                                  </div>
                                  {event.manuallyAdjusted && <AdjustedBadge />}
                                </div>
                              </button>
                              <button
                                type="button"
                                aria-label="Delete event"
                                className="shrink-0 self-center rounded-md p-1.5 text-[#8e9ba8] hover:bg-white/5 hover:text-[#ff5b5f] disabled:opacity-40"
                                disabled={event.pending || deleteEvent.isPending}
                                onClick={() => {
                                  if (event.pending) {
                                    return;
                                  }
                                  setDeleteError(null);
                                  setDeleting(event);
                                }}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === "squad" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
              <div className="space-y-4 xl:col-span-8">
                <LivePitch
                  className="match-report-pitch"
                  layout={visibility === "none" ? "own" : "full"}
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
                    selectedKey={null}
                    onSelectOwn={() => undefined}
                    onSelectOpp={() => undefined}
                  />
                </LivePitch>

                <div className="match-report-bench grid grid-cols-1 gap-1 rounded-xl border border-[#1c2b36] bg-[#0c1218] px-3 py-1.5 sm:grid-cols-2 sm:gap-3">
                  {ownHalf === "left" ? (
                    <>
                      <LiveBenchRow
                        label={`${ownAbbrev} bench`}
                        color={ownColor}
                        athletes={ownBench}
                        timeline={timeline}
                        selectedKey={null}
                        onSelectOwn={() => undefined}
                        align="left"
                      />
                      <LiveBenchRow
                        label={`${oppAbbrev} bench`}
                        color={oppColor}
                        opponents={oppBench}
                        visibility={visibility}
                        timeline={timeline}
                        selectedKey={null}
                        onSelectOpp={() => undefined}
                        align="right"
                      />
                    </>
                  ) : (
                    <>
                      <LiveBenchRow
                        label={`${oppAbbrev} bench`}
                        color={oppColor}
                        opponents={oppBench}
                        visibility={visibility}
                        timeline={timeline}
                        selectedKey={null}
                        onSelectOpp={() => undefined}
                        align="left"
                      />
                      <LiveBenchRow
                        label={`${ownAbbrev} bench`}
                        color={ownColor}
                        athletes={ownBench}
                        timeline={timeline}
                        selectedKey={null}
                        onSelectOwn={() => undefined}
                        align="right"
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4 xl:col-span-4">
                {topPerformers.length > 0 ? (
                  <section className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
                      Top performers
                    </h2>
                    <ul className="mt-3 space-y-2">
                      {topPerformers.map((row) => (
                        <li
                          key={row.athlete.id}
                          className="flex items-center justify-between rounded-xl border border-[#1c2b36]/60 bg-[#0c1218] px-3 py-2.5"
                        >
                          <p className="font-oswald tracking-wide text-white">
                            {shirtLabel(row.athlete)}
                          </p>
                          <p className="text-xs text-[#8e9ba8]">
                            <span className="font-oswald text-[#00d99a]">{row.goals}</span> G ·{" "}
                            <span className="font-oswald text-[#c084fc]">{row.assists}</span> A
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
                    Squad Overview
                  </h2>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl border border-[#1c2b36]/60 bg-[#0c1218] p-3">
                      <p className="font-oswald text-2xl text-white">
                        {squad.filter((p) => p.started).length}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-[#8e9ba8]">
                        Starting XI
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#1c2b36]/60 bg-[#0c1218] p-3">
                      <p className="font-oswald text-2xl text-white">
                        {squad.filter((p) => !p.started).length}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-[#8e9ba8]">
                        Substitutes
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <section className="overflow-hidden rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="font-oswald text-xs font-semibold uppercase tracking-wider text-white">
                  Squad Match Stats
                </h2>
                <span className="text-xs text-[#8e9ba8]">
                  {playerStats.length} athletes
                </span>
              </div>
              {playerStats.length === 0 ? (
                <p className="mt-3 text-center text-sm text-[#8e9ba8]">
                  No squad recorded for this match.
                </p>
              ) : (
                <>
                  <ul className="mt-3 divide-y divide-[#1c2b36] sm:hidden">
                    {playerStats.map((row) => (
                      <li key={row.athlete.id} className="py-3 first:pt-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium text-white">
                            <span className="mr-2 font-oswald text-[#8e9ba8]">
                              #{row.athlete.squadNumber ?? "—"}
                            </span>
                            {row.athlete.firstName} {row.athlete.lastName}
                          </p>
                          <span className="shrink-0 rounded bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#8e9ba8]">
                            {row.athlete.started ? "Starting XI" : "Bench"}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                          {[
                            ["G", row.goals, "text-[#00d99a]"],
                            ["A", row.assists, "text-[#c084fc]"],
                            ["Y", row.yellow, "text-[#ffbe2e]"],
                            ["R", row.red, "text-[#ff5b5f]"],
                          ].map(([label, value, color]) => (
                            <div key={String(label)} className="rounded-lg bg-[#0c1218] px-2 py-1.5">
                              <p className={cn("font-oswald text-base", color)}>{value}</p>
                              <p className="text-[8px] font-bold uppercase text-[#8e9ba8]">{label}</p>
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden overflow-x-auto sm:block">
                  <table className="mt-2 w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#1c2b36] font-oswald text-[10px] uppercase tracking-widest text-[#8e9ba8]">
                      <th className="px-2 py-2 font-medium">#</th>
                      <th className="px-2 py-2 font-medium">Player</th>
                      <th className="px-2 py-2 font-medium">Start</th>
                      <th className="px-2 py-2 text-right font-medium">G</th>
                      <th className="px-2 py-2 text-right font-medium">A</th>
                      <th className="px-2 py-2 text-right font-medium">Y</th>
                      <th className="px-2 py-2 text-right font-medium">R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((row) => (
                      <tr
                        key={row.athlete.id}
                        className="border-b border-[#1c2b36]/70 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-2 py-3 font-oswald tabular-nums">
                          {row.athlete.squadNumber ?? "—"}
                        </td>
                        <td className="px-2 py-3 font-medium text-white">
                          {row.athlete.firstName} {row.athlete.lastName}
                        </td>
                        <td className="px-2 py-3 text-[#8e9ba8]">
                          {row.athlete.started ? "XI" : "Bench"}
                        </td>
                        <td className="px-2 py-3 text-right font-oswald text-[#00d99a]">
                          {row.goals}
                        </td>
                        <td className="px-2 py-3 text-right font-oswald text-[#c084fc]">
                          {row.assists}
                        </td>
                        <td className="px-2 py-3 text-right font-oswald text-[#ffbe2e]">
                          {row.yellow}
                        </td>
                        <td className="px-2 py-3 text-right font-oswald text-[#ff5b5f]">
                          {row.red}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>

      {adding && (
        <AddEventOverlay
          squad={squad}
          opponentSquad={match.opponentSquad}
          visibility={visibility}
          ownName={ownName}
          oppName={oppName}
          pending={formPending}
          error={addError}
          onClose={() => {
            if (!formPending) {
              setAdding(false);
              setAddError(null);
            }
          }}
          onSave={async (draft) => {
            setAddError(null);
            try {
              await persistPlannedOps(planAddEvent(draft));
              setAdding(false);
            } catch (err) {
              setAddError(
                err instanceof ApiError
                  ? err.message
                  : "Could not add this event.",
              );
            }
          }}
        />
      )}

      {deleting && (
        <DeleteEventOverlay
          event={deleting}
          linkedAssistCount={linkedAssistsForGoal(timeline, deleting).length}
          pending={deleteEvent.isPending}
          error={deleteError}
          onClose={() => {
            if (!deleteEvent.isPending) {
              setDeleting(null);
              setDeleteError(null);
            }
          }}
          onConfirm={() => void confirmDeleteEvent()}
        />
      )}

      {editing && (
        <EditEventOverlay
          event={editing}
          squad={squad}
          opponentSquad={match.opponentSquad}
          visibility={visibility}
          linkedAssist={linkedAssistsForGoal(timeline, editing)[0] ?? null}
          linkedSub={linkedSubstitutionForInjury(timeline, editing) ?? null}
          ownName={ownName}
          oppName={oppName}
          pending={formPending}
          error={saveError}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            setSaveError(null);
            try {
              await persistPlannedOps(
                planEditEvent({
                  event: editing,
                  draft,
                  linkedAssist:
                    linkedAssistsForGoal(timeline, editing)[0] ?? null,
                  linkedSub:
                    linkedSubstitutionForInjury(timeline, editing) ?? null,
                }),
              );
              setEditing(null);
            } catch (err) {
              setSaveError(
                err instanceof ApiError
                  ? err.message
                  : "Could not save this change.",
              );
            }
          }}
        />
      )}
    </div>
  );
}

function FactCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: ReactNode;
}) {
  return (
    <div
      className="rounded-xl bg-[#101920] px-3 py-3"
      style={{ boxShadow: `inset 0 0 0 1px ${color}55` }}
    >
      <span className="inline-flex text-[color:var(--fact-color)]" style={{ ["--fact-color" as string]: color }}>
        {icon}
      </span>
      <p className="mt-2 font-oswald text-2xl leading-none tabular-nums text-white">
        {value}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#8e9ba8]">
        {label}
      </p>
    </div>
  );
}

function DeleteEventOverlay({
  event,
  linkedAssistCount,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  event: MatchLogEvent;
  linkedAssistCount: number;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <p className="font-oswald text-2xl tracking-widest">DELETE EVENT?</p>
      <p className="mt-2 text-sm text-[#8e9ba8]">
        {event.minute}&apos; {eventDisplayLabel(event)} will be removed from
        this match.
        {linkedAssistCount > 0
          ? " The linked assist will be removed too."
          : ""}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[#ff5b5f]">
          {error}
        </p>
      )}
      <button
        type="button"
        className="mt-6 w-full rounded-xl bg-[#e23d3d] py-3 font-oswald tracking-widest text-white disabled:opacity-40"
        disabled={pending}
        onClick={onConfirm}
      >
        {pending ? "DELETING…" : "DELETE"}
      </button>
      <button
        type="button"
        className="mt-2 w-full rounded-xl border border-[#233747] py-3 font-oswald tracking-widest"
        disabled={pending}
        onClick={onClose}
      >
        NO, GO BACK
      </button>
    </Overlay>
  );
}

function EditEventOverlay({
  event,
  squad,
  opponentSquad,
  visibility,
  linkedAssist,
  linkedSub,
  ownName,
  oppName,
  pending,
  error,
  onClose,
  onSave,
}: {
  event: MatchLogEvent;
  squad: MatchSquadAthlete[];
  opponentSquad: OpponentMatchPlayer[];
  visibility: OpponentSquadVisibility;
  linkedAssist: MatchLogEvent | null;
  linkedSub: MatchLogEvent | null;
  ownName: string;
  oppName: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: EventFormDraft) => Promise<void>;
}) {
  const roster = usesOpponentRoster(visibility, opponentSquad);
  const incomingRaw =
    event.eventType === "substitution"
      ? event.detail
      : linkedSub?.detail;
  return (
    <EventComposerOverlay
      title="EDIT EVENT"
      subtitle={event.team === "own" ? ownName : oppName}
      submitLabel="SAVE CHANGES"
      pendingLabel="SAVING…"
      squad={squad}
      opponentSquad={opponentSquad}
      visibility={visibility}
      ownName={ownName}
      oppName={oppName}
      teamLocked
      initial={emptyEventDraft({
        team: event.team,
        minute: event.minute,
        eventType: event.eventType === "assist" ? "goal" : event.eventType,
        athleteId: event.athleteId ?? "",
        opponentPlayerId: event.opponentPlayerId ?? "",
        opponentLabel: event.opponentLabel ?? "",
        note:
          event.eventType === "substitution" || looksLikeId(event.detail)
            ? ""
            : (event.detail ?? ""),
        assistAthleteId: linkedAssist?.athleteId ?? "",
        assistOpponentPlayerId: linkedAssist?.opponentPlayerId ?? "",
        assistOpponentLabel: linkedAssist?.opponentLabel ?? "",
        incomingAthleteId:
          event.team === "own" && looksLikeId(incomingRaw)
            ? incomingRaw ?? ""
            : "",
        incomingOpponentPlayerId:
          event.team === "opponent" && roster && looksLikeId(incomingRaw)
            ? incomingRaw ?? ""
            : "",
        incomingOpponentLabel:
          event.team === "opponent" && !roster ? (incomingRaw ?? "") : "",
        injuryLedToSub: Boolean(linkedSub),
      })}
      pending={pending}
      error={error}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function AddEventOverlay({
  squad,
  opponentSquad,
  visibility,
  ownName,
  oppName,
  pending,
  error,
  onClose,
  onSave,
}: {
  squad: MatchSquadAthlete[];
  opponentSquad: OpponentMatchPlayer[];
  visibility: OpponentSquadVisibility;
  ownName: string;
  oppName: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: EventFormDraft) => Promise<void>;
}) {
  return (
    <EventComposerOverlay
      title="ADD EVENT"
      subtitle="Log a missed event from this match"
      submitLabel="ADD EVENT"
      pendingLabel="ADDING…"
      squad={squad}
      opponentSquad={opponentSquad}
      visibility={visibility}
      ownName={ownName}
      oppName={oppName}
      teamLocked={false}
      initial={emptyEventDraft()}
      pending={pending}
      error={error}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

const fieldClassName =
  "mt-1 w-full rounded-lg border border-[#1c2b36] bg-[#101920] px-3 py-2 text-sm text-white";

function subjectLabel(eventType: MatchEventType) {
  if (eventType === "goal") {
    return "Scorer";
  }
  if (eventType === "substitution") {
    return "Player coming off";
  }
  if (eventType === "injury") {
    return "Injured player";
  }
  return "Player";
}

function EventComposerOverlay({
  title,
  subtitle,
  submitLabel,
  pendingLabel,
  squad,
  opponentSquad,
  visibility,
  ownName,
  oppName,
  teamLocked,
  initial,
  pending,
  error,
  onClose,
  onSave,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  pendingLabel: string;
  squad: MatchSquadAthlete[];
  opponentSquad: OpponentMatchPlayer[];
  visibility: OpponentSquadVisibility;
  ownName: string;
  oppName: string;
  teamLocked: boolean;
  initial: EventFormDraft;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: EventFormDraft) => Promise<void>;
}) {
  const [team, setTeam] = useState<MatchEventTeam>(initial.team);
  const [minute, setMinute] = useState(
    teamLocked ? String(initial.minute) : "",
  );
  const [eventType, setEventType] = useState<MatchEventType>(initial.eventType);
  const [athleteId, setAthleteId] = useState(initial.athleteId);
  const [opponentPlayerId, setOpponentPlayerId] = useState(
    initial.opponentPlayerId,
  );
  const [opponentLabel, setOpponentLabel] = useState(initial.opponentLabel);
  const [note, setNote] = useState(initial.note);
  const [assistAthleteId, setAssistAthleteId] = useState(
    initial.assistAthleteId,
  );
  const [assistOpponentPlayerId, setAssistOpponentPlayerId] = useState(
    initial.assistOpponentPlayerId,
  );
  const [assistOpponentLabel, setAssistOpponentLabel] = useState(
    initial.assistOpponentLabel,
  );
  const [incomingAthleteId, setIncomingAthleteId] = useState(
    initial.incomingAthleteId,
  );
  const [incomingOpponentPlayerId, setIncomingOpponentPlayerId] = useState(
    initial.incomingOpponentPlayerId,
  );
  const [incomingOpponentLabel, setIncomingOpponentLabel] = useState(
    initial.incomingOpponentLabel,
  );
  const [injuryLedToSub, setInjuryLedToSub] = useState(initial.injuryLedToSub);
  const [formError, setFormError] = useState<string | null>(null);

  const roster = usesOpponentRoster(visibility, opponentSquad);
  const isSub = eventType === "substitution";
  const isGoal = eventType === "goal";
  const isInjury = eventType === "injury";
  const showNote = !isSub;
  const showIncoming = isSub || (isInjury && injuryLedToSub);
  const selectedOpponent = opponentSquad.find(
    (player) => player.id === opponentPlayerId,
  );
  const selectedAssistOpponent = opponentSquad.find(
    (player) => player.id === assistOpponentPlayerId,
  );

  const buildDraft = (parsedMinute: number): EventFormDraft =>
    emptyEventDraft({
      team,
      minute: parsedMinute,
      eventType,
      athleteId,
      opponentPlayerId: team === "opponent" && roster ? opponentPlayerId : "",
      opponentLabel:
        team === "opponent"
          ? roster && selectedOpponent
            ? opponentPlayerLabel(selectedOpponent, visibility)
            : opponentLabel
          : "",
      note,
      assistAthleteId: team === "own" ? assistAthleteId : "",
      assistOpponentPlayerId:
        team === "opponent" && roster ? assistOpponentPlayerId : "",
      assistOpponentLabel:
        team === "opponent"
          ? roster && selectedAssistOpponent
            ? opponentPlayerLabel(selectedAssistOpponent, visibility)
            : assistOpponentLabel
          : "",
      incomingAthleteId: team === "own" ? incomingAthleteId : "",
      incomingOpponentPlayerId:
        team === "opponent" && roster ? incomingOpponentPlayerId : "",
      incomingOpponentLabel:
        team === "opponent" && !roster ? incomingOpponentLabel : "",
      injuryLedToSub,
    });

  const handleSubmit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    const parsedMinute = Number(minute);
    if (!Number.isInteger(parsedMinute) || parsedMinute < 0) {
      return;
    }
    const draft = buildDraft(parsedMinute);
    if (isSub || (isInjury && injuryLedToSub)) {
      const offOk =
        team === "own"
          ? Boolean(draft.athleteId)
          : Boolean(draft.opponentPlayerId || draft.opponentLabel.trim());
      const onOk = Boolean(
        draft.incomingAthleteId ||
          draft.incomingOpponentPlayerId ||
          draft.incomingOpponentLabel.trim(),
      );
      if (!offOk || !onOk) {
        setFormError("Pick the player coming off and the player coming on.");
        return;
      }
    }
    setFormError(null);
    void onSave(draft);
  };

  return (
    <Overlay onClose={onClose} sheet>
      <form
        onSubmit={handleSubmit}
        className="max-h-[82dvh] space-y-3 overflow-y-auto p-4 sm:max-h-[85vh] sm:space-y-4 sm:p-5"
      >
        <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-4 border-b border-[#1c2b36] bg-[#070d12] px-4 pb-3 pt-4 sm:-mx-5 sm:-mt-5 sm:px-5 sm:pt-5">
          <div>
            <p className="font-oswald text-xl tracking-widest sm:text-2xl">{title}</p>
            <p className="mt-0.5 text-xs text-[#8e9ba8] sm:text-sm">{subtitle}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[#8e9ba8] transition-colors hover:bg-white/5 hover:text-white"
            onClick={onClose}
            aria-label="Close event form"
          >
            <X className="size-5" />
          </button>
        </div>

        {!teamLocked && (
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
              Team
            </legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(
                [
                  { id: "own" as const, label: ownName },
                  { id: "opponent" as const, label: oppName },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "rounded-lg border px-3 py-2 font-oswald text-xs tracking-widest",
                    team === option.id
                      ? "border-[#00d99a]/70 bg-[#00d99a]/10 text-[#00d99a]"
                      : "border-[#1c2b36] text-[#c5ced6]",
                  )}
                  onClick={() => {
                    setTeam(option.id);
                    setFormError(null);
                    if (option.id === "own") {
                      setOpponentPlayerId("");
                      setOpponentLabel("");
                      setAssistOpponentPlayerId("");
                      setAssistOpponentLabel("");
                      setIncomingOpponentPlayerId("");
                      setIncomingOpponentLabel("");
                    } else {
                      setAthleteId("");
                      setAssistAthleteId("");
                      setIncomingAthleteId("");
                    }
                  }}
                >
                  {option.label.toUpperCase()}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
          <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
            Minute
            <input
              type="number"
              min={0}
              max={150}
              step={1}
              value={minute}
              onChange={(change) => setMinute(change.target.value)}
              className={cn(fieldClassName, "font-oswald text-lg")}
              required
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
            Event type
            <select
              value={eventType}
              onChange={(change) => {
                const next = change.target.value as MatchEventType;
                setEventType(next);
                setFormError(null);
                if (next !== "goal") {
                  setAssistAthleteId("");
                  setAssistOpponentPlayerId("");
                  setAssistOpponentLabel("");
                }
                if (next !== "substitution" && next !== "injury") {
                  setIncomingAthleteId("");
                  setIncomingOpponentPlayerId("");
                  setIncomingOpponentLabel("");
                  setInjuryLedToSub(false);
                }
              }}
              className={fieldClassName}
            >
              {EVENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
              {eventType === "key_pass" ? (
                <option value="key_pass">{EVENT_LABEL.key_pass}</option>
              ) : null}
            </select>
          </label>
        </div>

        {team === "own" ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
              {subjectLabel(eventType)}
            </p>
            <AthletePicker
              squad={squad}
              value={athleteId}
              onChange={setAthleteId}
              compact
              aria-label={subjectLabel(eventType)}
            />
          </div>
        ) : roster ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
              {subjectLabel(eventType)}
            </p>
            <OpponentPlayerPicker
              players={opponentSquad}
              value={opponentPlayerId}
              onChange={setOpponentPlayerId}
              visibility={visibility}
              compact
              aria-label={subjectLabel(eventType)}
            />
          </div>
        ) : (
          <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
            {subjectLabel(eventType)}
            <input
              type="text"
              value={opponentLabel}
              onChange={(change) => setOpponentLabel(change.target.value)}
              placeholder="e.g. Opponent #9"
              maxLength={50}
              className={fieldClassName}
            />
          </label>
        )}

        {isGoal ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
              Who assisted?
            </p>
            {team === "own" ? (
              <AthletePicker
                squad={squad}
                value={assistAthleteId}
                onChange={setAssistAthleteId}
                emptyLabel="No assist"
                excludeIds={athleteId ? [athleteId] : []}
                compact
                aria-label="Who assisted?"
              />
            ) : roster ? (
              <OpponentPlayerPicker
                players={opponentSquad}
                value={assistOpponentPlayerId}
                onChange={setAssistOpponentPlayerId}
                visibility={visibility}
                emptyLabel="No assist"
                excludeIds={opponentPlayerId ? [opponentPlayerId] : []}
                compact
                aria-label="Who assisted?"
              />
            ) : (
              <input
                type="text"
                value={assistOpponentLabel}
                onChange={(change) => setAssistOpponentLabel(change.target.value)}
                placeholder="Leave blank for no assist"
                maxLength={50}
                className={fieldClassName}
              />
            )}
          </div>
        ) : null}

        {isInjury ? (
          <label className="flex items-center gap-2 text-sm text-[#e8ecef]">
            <input
              type="checkbox"
              checked={injuryLedToSub}
              onChange={(change) => {
                setInjuryLedToSub(change.target.checked);
                if (!change.target.checked) {
                  setIncomingAthleteId("");
                  setIncomingOpponentPlayerId("");
                  setIncomingOpponentLabel("");
                }
              }}
              className="size-4 accent-[#00d99a]"
            />
            This injury led to a substitution
          </label>
        ) : null}

        {showIncoming ? (
          team === "own" ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
                Player coming on
              </p>
              <AthletePicker
                squad={squad}
                value={incomingAthleteId}
                onChange={setIncomingAthleteId}
                allowEmpty={false}
                excludeIds={athleteId ? [athleteId] : []}
                compact
                aria-label="Player coming on"
              />
            </div>
          ) : roster ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
                Player coming on
              </p>
              <OpponentPlayerPicker
                players={opponentSquad}
                value={incomingOpponentPlayerId}
                onChange={setIncomingOpponentPlayerId}
                visibility={visibility}
                allowEmpty={false}
                excludeIds={opponentPlayerId ? [opponentPlayerId] : []}
                compact
                aria-label="Player coming on"
              />
            </div>
          ) : (
            <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
              Player coming on
              <input
                type="text"
                value={incomingOpponentLabel}
                onChange={(change) =>
                  setIncomingOpponentLabel(change.target.value)
                }
                placeholder="Incoming player"
                maxLength={50}
                className={fieldClassName}
              />
            </label>
          )
        ) : null}

        {showNote ? (
          <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
            Note
            <input
              type="text"
              value={note}
              onChange={(change) => setNote(change.target.value)}
              placeholder="Optional"
              maxLength={500}
              className={fieldClassName}
            />
          </label>
        ) : null}

        {(error || formError) && (
          <p role="alert" className="text-sm text-[#ff5b5f]">
            {error ?? formError}
          </p>
        )}

        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 grid grid-cols-2 gap-2 border-t border-[#1c2b36] bg-[#070d12] px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
          <button
            type="button"
            className="w-full rounded-xl border border-[#233747] py-2.5 font-oswald text-sm tracking-widest"
            onClick={onClose}
          >
            CANCEL
          </button>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#00d99a] py-2.5 font-oswald text-sm tracking-widest text-[#07110f] disabled:opacity-40"
            disabled={pending}
          >
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
  sheet = false,
}: {
  children: ReactNode;
  onClose: () => void;
  sheet?: boolean;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center",
        sheet ? "p-0 sm:p-4" : "p-4",
      )}
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-md border border-[#1c2b36] bg-[#070d12]",
          sheet
            ? "max-h-[82dvh] overflow-hidden rounded-t-2xl sm:max-h-[85vh] sm:rounded-2xl"
            : "max-h-[90vh] overflow-y-auto rounded-2xl p-5",
        )}
      >
        {children}
      </div>
    </div>
  );
}

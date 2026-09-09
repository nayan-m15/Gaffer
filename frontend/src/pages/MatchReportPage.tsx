import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeftRight,
  ChevronLeft,
  Loader2,
  Share2,
  ShieldAlert,
  Square,
  Timer,
  Zap,
} from "lucide-react";
import { SportLogo } from "@/components/brand/SportLogo";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useGamePlan } from "@/features/team-tactics/api";
import {
  useMatch,
  useMatchEvents,
  useMatchSquad,
  useUpdateMatchEvent,
} from "@/features/matches/hooks";
import type {
  MatchEventType,
  MatchLogEvent,
  MatchSquadAthlete,
} from "@/features/matches/types";
import {
  EVENT_COLOR,
  EVENT_LABEL,
  eventDisplayLabel,
  isPairedAssistEvent,
  isSecondYellow,
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

type Tab = "summary" | "timeline" | "players";

const EVENT_TYPES: { value: MatchEventType; label: string }[] = [
  { value: "goal", label: EVENT_LABEL.goal },
  { value: "assist", label: EVENT_LABEL.assist },
  { value: "key_pass", label: EVENT_LABEL.key_pass },
  { value: "yellow_card", label: EVENT_LABEL.yellow_card },
  { value: "red_card", label: EVENT_LABEL.red_card },
  { value: "substitution", label: EVENT_LABEL.substitution },
  { value: "penalty", label: EVENT_LABEL.penalty },
  { value: "injury", label: EVENT_LABEL.injury },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "timeline", label: "Timeline" },
  { id: "players", label: "Player Stats" },
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
 * Post-match report: result header, summary/timeline/player tabs, and
 * direct overwrite editing of logged events.
 */
export default function MatchReportPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { team } = useAuth();

  const matchQuery = useMatch(matchId);
  const squadQuery = useMatchSquad(matchId);
  const eventsQuery = useMatchEvents(matchId);
  const gamePlanQuery = useGamePlan(matchQuery.data?.gamePlanId ?? undefined);
  const updateEvent = useUpdateMatchEvent(matchId ?? "");

  const [tab, setTab] = useState<Tab>("summary");
  const [editing, setEditing] = useState<MatchLogEvent | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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
        gamePlanQuery.data,
        ownHalf,
        timeline,
        visibility === "none" ? "own" : "full",
      ),
    [ownState.onPitch, gamePlanQuery.data, ownHalf, timeline, visibility],
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

  if (matchQuery.isLoading || squadQuery.isLoading || eventsQuery.isLoading) {
    return (
      <div className="match-report flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#00d99a]" />
      </div>
    );
  }

  if (matchQuery.isError || squadQuery.isError || eventsQuery.isError) {
    const error = matchQuery.error ?? squadQuery.error ?? eventsQuery.error;
    return (
      <div className="match-report flex min-h-screen items-center justify-center px-4">
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
      <div className="match-report flex min-h-screen items-center justify-center">
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
    <div className="match-report min-h-screen overflow-x-hidden">
      <header className="relative flex items-center justify-between border-b border-[#1c2b36] px-4 py-3">
        <button
          type="button"
          className="relative z-10 flex items-center gap-1 text-sm text-[#e8ecef]"
          onClick={() => navigate("/live-logger")}
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
        <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center">
          <span className="flex items-center gap-2">
            <SportLogo size={22} className="rounded-md" />
            <span className="font-display text-base font-bold tracking-wide text-[#e8ecef]">
              GAFFER
            </span>
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#00d99a]">
            Match Report
          </p>
        </div>
        <span
          className="size-8 shrink-0 rounded-full"
          style={{ backgroundColor: ownColor }}
          aria-hidden="true"
        />
      </header>

      <div className="px-4 pb-16 pt-5">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#101920] p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "rounded-lg py-2 font-oswald text-[10px] tracking-widest sm:text-xs",
                tab === item.id
                  ? "bg-[#0f3d32] text-white"
                  : "bg-transparent text-[#c5ced6]",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "summary" && (
          <div className="mt-5 space-y-5">
            <section className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e9ba8]">
                  {metaLine}
                </p>
                <button
                  type="button"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#00d99a] text-[#07110f]"
                  onClick={() => void shareReport()}
                  aria-label="Share match report"
                >
                  <Share2 className="size-4" />
                </button>
              </div>
              {shareNote ? (
                <p className="mt-2 text-right text-[11px] text-[#00d99a]">{shareNote}</p>
              ) : null}
              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <div className="min-w-0 text-left">
                  <p className="truncate font-oswald text-lg tracking-wide text-white sm:text-xl">
                    {homeName}
                  </p>
                  <span
                    className="mt-1 block h-1 w-12 rounded-full"
                    style={{ backgroundColor: homeColor }}
                  />
                </div>
                <div className="rounded-xl bg-[#0c1218] px-4 py-2">
                  <p className="font-oswald text-4xl leading-none tabular-nums sm:text-5xl">
                    <span style={{ color: homeColor }}>{homeScore}</span>
                    <span className="mx-2 text-2xl text-white">-</span>
                    <span style={{ color: awayColor }}>{awayScore}</span>
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="truncate font-oswald text-lg tracking-wide text-white sm:text-xl">
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
              <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
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
            <div className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
              <EventBreakdownChart events={timeline} />
            </div>
          </div>
        )}

        {tab === "timeline" && (
          <section className="mt-6 overflow-x-hidden">
            {timeline.length === 0 ? (
              <p className="text-center text-sm text-[#8e9ba8]">
                No events logged.
              </p>
            ) : (
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
                        "relative flex gap-3 pb-4 last:pb-0",
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
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded-xl border border-[#1c2b36] bg-[#101920] px-3 py-3 text-left"
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
                              <p className="font-oswald text-sm tracking-wide">
                                {event.minute}&apos; {eventDisplayLabel(event)}
                              </p>
                              <p className="truncate text-xs text-[#8e9ba8]">
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
                                  <p className="mt-1 text-xs text-[#8e9ba8]">
                                    {event.detail}
                                  </p>
                                )}
                            </div>
                          </div>
                          {event.manuallyAdjusted && <AdjustedBadge />}
                        </div>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        {tab === "players" && (
          <section className="mt-6 space-y-4">
            <LivePitch
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

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#1c2b36] bg-[#0c1218] px-3 py-1.5">
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

            {topPerformers.length > 0 ? (
              <section className="rounded-2xl border border-[#1c2b36] bg-[#101920] p-4">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
                  Top performers
                </h2>
                <ul className="mt-3 space-y-2">
                  {topPerformers.map((row) => (
                    <li
                      key={row.athlete.id}
                      className="flex items-center justify-between rounded-xl bg-[#0c1218] px-3 py-2.5"
                    >
                      <p className="font-oswald tracking-wide">
                        {shirtLabel(row.athlete)}
                      </p>
                      <p className="text-xs text-[#8e9ba8]">
                        {row.goals} G · {row.assists} A
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="overflow-x-auto rounded-2xl border border-[#1c2b36] bg-[#101920] p-3">
              <h2 className="px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
                Squad stats
              </h2>
              {playerStats.length === 0 ? (
                <p className="mt-3 text-center text-sm text-[#8e9ba8]">
                  No squad recorded for this match.
                </p>
              ) : (
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
                        className="border-b border-[#1c2b36]/70"
                      >
                        <td className="px-2 py-3 font-oswald tabular-nums">
                          {row.athlete.squadNumber ?? "—"}
                        </td>
                        <td className="px-2 py-3">
                          {row.athlete.firstName} {row.athlete.lastName}
                        </td>
                        <td className="px-2 py-3 text-[#8e9ba8]">
                          {row.athlete.started ? "XI" : "Bench"}
                        </td>
                        <td className="px-2 py-3 text-right font-oswald">
                          {row.goals}
                        </td>
                        <td className="px-2 py-3 text-right font-oswald">
                          {row.assists}
                        </td>
                        <td className="px-2 py-3 text-right font-oswald">
                          {row.yellow}
                        </td>
                        <td className="px-2 py-3 text-right font-oswald">
                          {row.red}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </section>
        )}
      </div>

      {editing && (
        <EditEventOverlay
          event={editing}
          squad={squad}
          ownName={ownName}
          oppName={oppName}
          pending={updateEvent.isPending}
          error={saveError}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            setSaveError(null);
            try {
              await updateEvent.mutateAsync({
                eventId: editing.id,
                input,
              });
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

function EditEventOverlay({
  event,
  squad,
  ownName,
  oppName,
  pending,
  error,
  onClose,
  onSave,
}: {
  event: MatchLogEvent;
  squad: MatchSquadAthlete[];
  ownName: string;
  oppName: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: {
    minute: number;
    eventType: MatchEventType;
    athleteId: string | null;
    opponentLabel: string | null;
    detail: string | null;
  }) => Promise<void>;
}) {
  const [minute, setMinute] = useState(String(event.minute));
  const [eventType, setEventType] = useState<MatchEventType>(event.eventType);
  const [athleteId, setAthleteId] = useState(event.athleteId ?? "");
  const [opponentLabel, setOpponentLabel] = useState(event.opponentLabel ?? "");
  const [detail, setDetail] = useState(event.detail ?? "");

  const handleSubmit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    const parsedMinute = Number(minute);
    if (!Number.isInteger(parsedMinute) || parsedMinute < 0) {
      return;
    }
    const trimmedOpponent = opponentLabel.trim();
    void onSave({
      minute: parsedMinute,
      eventType,
      athleteId: athleteId || null,
      opponentLabel: trimmedOpponent || null,
      detail: detail.trim() || null,
    });
  };

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="font-oswald text-2xl tracking-widest">EDIT EVENT</p>
        <p className="text-sm text-[#8e9ba8]">
          {event.team === "own" ? ownName : oppName}
        </p>

        <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
          Minute
          <input
            type="number"
            min={0}
            max={150}
            step={1}
            value={minute}
            onChange={(change) => setMinute(change.target.value)}
            className="mt-1 w-full rounded-lg border border-[#1c2b36] bg-[#101920] px-3 py-2 font-oswald text-lg text-white"
            required
          />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
          Event type
          <select
            value={eventType}
            onChange={(change) =>
              setEventType(change.target.value as MatchEventType)
            }
            className="mt-1 w-full rounded-lg border border-[#1c2b36] bg-[#101920] px-3 py-2 text-sm text-white"
          >
            {EVENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
          Athlete
          <select
            value={athleteId}
            onChange={(change) => setAthleteId(change.target.value)}
            className="mt-1 w-full rounded-lg border border-[#1c2b36] bg-[#101920] px-3 py-2 text-sm text-white"
          >
            <option value="">Unassigned</option>
            {squad.map((athlete) => (
              <option key={athlete.id} value={athlete.id}>
                {shirtLabel(athlete)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
          Opponent label
          <input
            type="text"
            value={opponentLabel}
            onChange={(change) => setOpponentLabel(change.target.value)}
            placeholder="e.g. Opponent #9"
            maxLength={50}
            className="mt-1 w-full rounded-lg border border-[#1c2b36] bg-[#101920] px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-widest text-[#8e9ba8]">
          Detail
          <input
            type="text"
            value={detail}
            onChange={(change) => setDetail(change.target.value)}
            placeholder="Incoming player or note"
            maxLength={500}
            className="mt-1 w-full rounded-lg border border-[#1c2b36] bg-[#101920] px-3 py-2 text-sm text-white"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-[#ff5b5f]">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-xl bg-[#00d99a] py-3 font-oswald tracking-widest text-[#07110f] disabled:opacity-40"
          disabled={pending}
        >
          {pending ? "SAVING…" : "SAVE CHANGES"}
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-[#233747] py-3 font-oswald tracking-widest"
          onClick={onClose}
        >
          NO, GO BACK
        </button>
      </form>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#1c2b36] bg-[#070d12] p-5">
        {children}
      </div>
    </div>
  );
}

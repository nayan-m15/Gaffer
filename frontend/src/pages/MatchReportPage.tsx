import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Loader2, ShieldAlert } from "lucide-react";
import { SportLogo } from "@/components/brand/SportLogo";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  isSecondYellow,
} from "@/features/matches/event-visuals";
import { EventTypeGlyph } from "@/features/matches/EventTypeGlyph";
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
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
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
  const updateEvent = useUpdateMatchEvent(matchId ?? "");

  const [tab, setTab] = useState<Tab>("summary");
  const [editing, setEditing] = useState<MatchLogEvent | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const squad = useMemo(() => squadQuery.data ?? [], [squadQuery.data]);
  const timeline = useMemo(() => {
    const rows = eventsQuery.data ?? [];
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
  const teamScore = match?.teamScore ?? 0;
  const oppScore = match?.opponentScore ?? 0;
  const homeName = isHome ? ownName : oppName;
  const awayName = isHome ? oppName : ownName;
  const homeScore = isHome ? teamScore : oppScore;
  const awayScore = isHome ? oppScore : teamScore;
  const result =
    teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "D";

  const playerStats = useMemo(() => {
    return squad.map((athlete) => {
      const ownEvents = timeline.filter(
        (event) => event.athleteId === athlete.id,
      );
      return {
        athlete,
        goals: ownEvents.filter((event) => event.eventType === "goal").length,
        yellow: ownEvents.filter((event) => event.eventType === "yellow_card")
          .length,
        red: ownEvents.filter((event) => event.eventType === "red_card")
          .length,
      };
    });
  }, [squad, timeline]);

  const goals = timeline.filter((event) => event.eventType === "goal");
  const cards = timeline.filter(
    (event) =>
      event.eventType === "yellow_card" || event.eventType === "red_card",
  );
  const subs = timeline.filter((event) => event.eventType === "substitution");

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
  ].join(" · ");

  return (
    <div className="match-report min-h-screen overflow-x-hidden">
      <header className="flex items-center justify-between border-b border-[#1c2b36] px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-[#8e9ba8]"
          onClick={() => navigate("/live-logger")}
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <SportLogo size={36} className="shrink-0 rounded-lg" />
          <div className="min-w-0">
            <h1 className="font-display text-base font-bold tracking-wide text-[#e8ecef]">
              GAFFER
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#8e9ba8]">
              Match Report
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 font-oswald text-sm tracking-widest",
            result === "W" && "bg-[#00d99a]/15 text-[#00d99a]",
            result === "D" && "bg-[#1a2530] text-[#8e9ba8]",
            result === "L" && "bg-[#ff5b5f]/15 text-[#ff5b5f]",
          )}
        >
          {result}
        </span>
      </header>

      <div className="px-4 pb-16 pt-6">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e9ba8]">
            {match.eventTitle}
          </p>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
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
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e9ba8]">
            {metaLine}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-1 rounded-xl border border-[#1c2b36] bg-[#101920] p-1">
          {(
            [
              ["summary", "Summary"],
              ["timeline", "Timeline"],
              ["players", "Player Stats"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "rounded-lg py-2 font-oswald text-[10px] tracking-widest sm:text-xs",
                tab === id
                  ? "bg-[#00d99a]/15 text-[#00d99a]"
                  : "text-[#8e9ba8]",
              )}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "summary" && (
          <div className="mt-6 space-y-6">
            <Breakdown
              title="Goals"
              empty="No goals logged."
              rows={goals}
              squad={squad}
              ownName={ownName}
              oppName={oppName}
            />
            <Breakdown
              title="Cards"
              empty="No cards logged."
              rows={cards}
              squad={squad}
              ownName={ownName}
              oppName={oppName}
            />
            <Breakdown
              title="Substitutions"
              empty="No substitutions logged."
              rows={subs}
              squad={squad}
              ownName={ownName}
              oppName={oppName}
            />
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
                {timeline.map((event) => (
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
                              {substitutionIncoming(event, squad)}
                            </p>
                            {event.detail &&
                              event.eventType !== "substitution" &&
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
          <section className="mt-6 overflow-x-auto">
            {playerStats.length === 0 ? (
              <p className="text-center text-sm text-[#8e9ba8]">
                No squad recorded for this match.
              </p>
            ) : (
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#1c2b36] font-oswald text-[10px] uppercase tracking-widest text-[#8e9ba8]">
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Player</th>
                    <th className="px-2 py-2 font-medium">Start</th>
                    <th className="px-2 py-2 text-right font-medium">G</th>
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

function Breakdown({
  title,
  empty,
  rows,
  squad,
  ownName,
  oppName,
}: {
  title: string;
  empty: string;
  rows: MatchLogEvent[];
  squad: MatchSquadAthlete[];
  ownName: string;
  oppName: string;
}) {
  return (
    <section>
      <h2 className="font-oswald text-sm tracking-[0.22em] text-[#8e9ba8]">
        {title.toUpperCase()}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[#8e9ba8]">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((event) => (
            <li
              key={event.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-[#1c2b36] bg-[#101920] px-3 py-3"
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
                  <p className="truncate text-xs text-[#8e9ba8]">
                    {event.team === "own" ? ownName : oppName} ·{" "}
                    {whoLabel(event, squad)}
                    {substitutionIncoming(event, squad)}
                  </p>
                </div>
              </div>
              {event.manuallyAdjusted && <AdjustedBadge />}
            </li>
          ))}
        </ul>
      )}
    </section>
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

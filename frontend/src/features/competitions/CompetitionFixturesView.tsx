import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GitBranch,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trophy,
  FileText,
} from "lucide-react";
import { CompetitionMatchCentre } from "./CompetitionMatchCentre";
import { competitionMatchCentreQueryOptions } from "./match-centre-query";
import { AppCard } from "@/components/app/AppCard";
import { AnimatedModalContent } from "@/components/ui/animated-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  acceptCompetitionFixtureSchedule,
  proposeCompetitionFixtureSchedule,
} from "./api";
import { useCompetitionMutation } from "./hooks";
import type {
  CompetitionFixture,
  CompetitionFixtureScheduleResponse,
  CompetitionFormat,
  Participant,
} from "./types";

function roundLabel(round: number, maxRound: number) {
  const teamsAtRound = 2 ** (maxRound - round + 1);
  if (teamsAtRound === 2) return "Final";
  if (teamsAtRound === 4) return "Semi-final";
  if (teamsAtRound === 8) return "Quarter-final";
  return `Round of ${teamsAtRound}`;
}

function fixtureDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", " ·")
    .toUpperCase();
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function timeValueFromLocalDateTime(value: string) {
  return value.slice(11, 16);
}

function nextLocalMinuteValue(now = new Date()) {
  const nextMinute = new Date(now);
  nextMinute.setSeconds(0, 0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);

  if (localDateValue(nextMinute) !== localDateValue(now)) return "";

  return `${String(nextMinute.getHours()).padStart(2, "0")}:${String(
    nextMinute.getMinutes(),
  ).padStart(2, "0")}`;
}


const TIME_HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);

const TIME_MINUTES = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);

function teamInitial(name: string) {
  if (name === "TBD") return "?";
  return name.trim().match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() ?? "?";
}

function responseIsConfirmed(response: CompetitionFixtureScheduleResponse) {
  return response === "accepted" || response === "external_confirmed";
}

function responseLabel(
  response: CompetitionFixtureScheduleResponse,
  linked: boolean,
) {
  if (response === "accepted") return "Accepted";
  if (response === "external_confirmed") return "Confirmed externally";
  return linked ? "Awaiting coach" : "External · awaiting confirmation";
}

function fixtureStatus(
  fixture: CompetitionFixture,
  ready: boolean,
  scheduleConfirmed: boolean,
  completed: boolean,
) {
  if (completed) return { label: "Final", className: "border-primary/25 bg-primary/10 text-primary" };
  if (fixture.status === "in_progress") return { label: "In progress", className: "border-amber-500/25 bg-amber-500/10 text-amber-500" };
  if (fixture.status === "cancelled") return { label: "Cancelled", className: "border-destructive/25 bg-destructive/10 text-destructive" };
  if (!ready) return { label: "Awaiting teams", className: "border-dashed border-border bg-transparent text-muted-foreground" };
  if (scheduleConfirmed) return { label: "Confirmed", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-500" };
  if (fixture.scheduleProposedByCompetitionTeamId) return { label: "Reschedule proposed", className: "border-amber-500/25 bg-amber-500/10 text-amber-500" };
  return { label: "Awaiting confirmation", className: "border-amber-500/25 bg-amber-500/10 text-amber-500" };
}

function fixtureResponseForViewer(
  participant: Participant | null | undefined,
  fixture: CompetitionFixture,
) {
  if (participant?.id === fixture.homeCompetitionTeamId) return fixture.homeScheduleResponse;
  if (participant?.id === fixture.awayCompetitionTeamId) return fixture.awayScheduleResponse;
  return null;
}

function FixtureSchedulePanel({
  fixture,
  homeParticipant,
  awayParticipant,
}: {
  fixture: CompetitionFixture;
  homeParticipant: Participant | null;
  awayParticipant: Participant | null;
}) {
  const confirmed = Boolean(fixture.scheduleConfirmedAt);
  return (
    <div className={`mt-3 rounded-xl border p-3 ${confirmed ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-amber-500/20 bg-amber-500/[0.04]"}`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {confirmed ? <ShieldCheck className="size-3.5 text-emerald-500" /> : <Clock3 className="size-3.5 text-amber-500" />}
        Date agreement · revision {fixture.scheduleRevision}
      </div>
      <div className="mt-2 grid gap-1.5 text-xs">
        <FixtureParticipantResponse participant={homeParticipant} response={fixture.homeScheduleResponse} />
        <FixtureParticipantResponse participant={awayParticipant} response={fixture.awayScheduleResponse} />
      </div>
      {fixture.scheduleProposalNote && (
        <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          “{fixture.scheduleProposalNote}”
        </p>
      )}
    </div>
  );
}

function FixtureParticipantResponse({
  participant,
  response,
}: {
  participant: Participant | null;
  response: CompetitionFixtureScheduleResponse;
}) {
  if (!participant) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-foreground">{participant.displayName}</span>
      <span className={responseIsConfirmed(response) ? "text-emerald-500" : "text-muted-foreground"}>
        {responseLabel(response, Boolean(participant.teamId))}
      </span>
    </div>
  );
}

function FixtureResponseActions({
  fixture,
  participant,
  response,
  actionBusy,
  onAccept,
  onPropose,
}: {
  fixture: CompetitionFixture;
  participant: Participant;
  response: CompetitionFixtureScheduleResponse | null;
  actionBusy: boolean;
  onAccept: (fixture: CompetitionFixture, participantId?: string) => void;
  onPropose: (target: ProposalTarget) => void;
}) {
  const confirmed = responseIsConfirmed(response ?? "pending");
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {!confirmed && (
        <Button size="sm" disabled={actionBusy} onClick={() => onAccept(fixture)}>
          <CheckCircle2 className="size-3.5" />Accept date
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className={confirmed ? "sm:col-span-2" : ""}
        disabled={actionBusy}
        onClick={() => onPropose({ fixture, participantName: participant.displayName, external: false })}
      >
        <RefreshCcw className="size-3.5" />Request reschedule
      </Button>
    </div>
  );
}

function ExternalScheduleActions({
  fixture,
  participants,
  actionBusy,
  onAccept,
  onPropose,
}: {
  fixture: CompetitionFixture;
  participants: { participant: Participant; response: CompetitionFixtureScheduleResponse }[];
  actionBusy: boolean;
  onAccept: (fixture: CompetitionFixture, participantId?: string) => void;
  onPropose: (target: ProposalTarget) => void;
}) {
  return (
    <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
      {participants.map(({ participant, response }) => (
        <div key={participant.id} className="rounded-lg border border-dashed border-border p-2.5">
          <p className="truncate text-xs font-medium">{participant.displayName} · external team</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!responseIsConfirmed(response) && (
              <Button size="sm" variant="outline" disabled={actionBusy} onClick={() => onAccept(fixture, participant.id)}>
                Mark confirmed externally
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={actionBusy}
              onClick={() => onPropose({ fixture, participantId: participant.id, participantName: participant.displayName, external: true })}
            >
              Record external reschedule
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamRow({
  name,
  score,
  winner,
}: {
  name: string;
  score: number | null;
  winner: boolean;
}) {
  const pending = name === "TBD";
  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 px-3 py-2.5 transition-colors ${
        winner ? "bg-primary/[0.08]" : ""
      }`}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
          winner
            ? "border-primary/40 bg-primary/15 text-primary"
            : pending
              ? "border-dashed border-border bg-muted/30 text-muted-foreground"
              : "border-border bg-muted/20 text-muted-foreground"
        }`}
      >
        {teamInitial(name)}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          winner
            ? "font-semibold text-foreground"
            : pending
              ? "italic text-muted-foreground"
              : "font-medium text-foreground"
        }`}
        title={name}
      >
        {name}
      </span>
      {winner && <CheckCircle2 className="size-3.5 shrink-0 text-primary" />}
      <span
        className={`flex min-w-8 shrink-0 items-center justify-center rounded-lg px-2 py-1 text-sm font-bold tabular-nums ${
          winner
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 text-foreground"
        }`}
      >
        {score ?? "–"}
      </span>
    </div>
  );
}

type ProposalTarget = {
  fixture: CompetitionFixture;
  participantId?: string;
  participantName: string;
  external: boolean;
};

function TimePickerPopover({
  value,
  proposedDate,
  now,
  onChange,
}: {
  value: string;
  proposedDate: string;
  now: Date;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hour = "00", minute = "00"] = value.split(":");
  const today = localDateValue(now);
  const selectingToday = proposedDate === today;

  const isTimePast = (nextHour: string, nextMinute: string) => {
    if (!selectingToday) return false;
    const candidate = new Date(`${proposedDate}T${nextHour}:${nextMinute}`);
    return Number.isNaN(candidate.getTime()) || candidate.getTime() <= now.getTime();
  };

  const hourDisabled = (nextHour: string) =>
    selectingToday && TIME_MINUTES.every((nextMinute) => isTimePast(nextHour, nextMinute));

  const minuteDisabled = (nextMinute: string) =>
    selectingToday && isTimePast(hour, nextMinute);

  const selectHour = (nextHour: string) => {
    if (hourDisabled(nextHour)) return;

    const nextMinute = !isTimePast(nextHour, minute)
      ? minute
      : (TIME_MINUTES.find((candidateMinute) => !isTimePast(nextHour, candidateMinute)) ?? minute);
    onChange(`${nextHour}:${nextMinute}`);
  };

  const selectMinute = (nextMinute: string) => {
    if (minuteDisabled(nextMinute)) return;
    onChange(`${hour}:${nextMinute}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger
        type="button"
        className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <Clock3 className="size-4 text-muted-foreground" />
          <span className="tabular-nums">{value}</span>
        </span>
        <span className="text-xs text-muted-foreground">Choose time</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <div className="mb-2 flex items-center justify-between gap-6 px-1">
          <p className="text-xs font-medium">Kickoff time</p>
          <p className="text-xs tabular-nums text-muted-foreground">{value}</p>
        </div>
        <div className="flex gap-2">
          <TimePickerColumn
            label="Hours"
            options={TIME_HOURS}
            selected={hour}
            isDisabled={hourDisabled}
            onSelect={selectHour}
          />
          <TimePickerColumn
            label="Minutes"
            options={TIME_MINUTES}
            selected={minute}
            isDisabled={minuteDisabled}
            onSelect={selectMinute}
          />
        </div>
        {selectingToday && (
          <p className="mt-2 max-w-36 text-[11px] leading-4 text-muted-foreground">
            Past times are unavailable.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TimePickerColumn({
  label,
  options,
  selected,
  isDisabled,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string;
  isDisabled: (value: string) => boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="h-52 w-16 overflow-y-auto rounded-md border border-border bg-background p-1">
        {options.map((option) => {
          const disabled = isDisabled(option);
          const selectedOption = option === selected;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option)}
              className={`flex h-8 w-full items-center justify-center rounded text-sm tabular-nums transition-colors ${
                disabled
                  ? "cursor-not-allowed text-muted-foreground opacity-30"
                  : selectedOption
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RescheduleDialog({
  target,
  busy,
  onClose,
  onSubmit,
}: {
  target: ProposalTarget;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { scheduledAt: string; note?: string }) => Promise<void>;
}) {
  const originalLocalDateTime = toLocalDateTime(target.fixture.scheduledAt);
  const today = localDateValue();
  const initialDate = originalLocalDateTime.slice(0, 10) < today
    ? today
    : originalLocalDateTime.slice(0, 10);
  const originalTime = timeValueFromLocalDateTime(originalLocalDateTime);
  const initialMinimumTime = initialDate === today ? nextLocalMinuteValue() : "";
  const [proposedDate, setProposedDate] = useState(initialDate);
  const [proposedTime, setProposedTime] = useState(
    initialMinimumTime && originalTime < initialMinimumTime
      ? initialMinimumTime
      : originalTime,
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const minimumTime = proposedDate === localDateValue(clockNow)
    ? nextLocalMinuteValue(clockNow)
    : "";

  useEffect(() => {
    if (minimumTime && proposedTime < minimumTime) {
      setProposedTime(minimumTime);
    }
  }, [minimumTime, proposedTime]);

  const scheduledAt = proposedDate && proposedTime
    ? `${proposedDate}T${proposedTime}`
    : "";
  const next = scheduledAt ? new Date(scheduledAt) : null;
  const validDateTime = Boolean(
    next && !Number.isNaN(next.getTime()) && next.getTime() > clockNow.getTime(),
  );
  const unchanged = Boolean(
    next && next.getTime() === new Date(target.fixture.scheduledAt).getTime(),
  );
  const canSubmit = validDateTime && !unchanged && !busy;

  const handleDateChange = (value: string) => {
    setError(null);
    setProposedDate(value);

    const nextMinimum = value === localDateValue(clockNow)
      ? nextLocalMinuteValue(clockNow)
      : "";
    if (nextMinimum && proposedTime < nextMinimum) {
      setProposedTime(nextMinimum);
    }
  };

  const handleTimeChange = (value: string) => {
    setError(null);
    setProposedTime(value);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!canSubmit || !next) return;

    const submissionNow = new Date();
    if (next.getTime() <= submissionNow.getTime()) {
      setClockNow(submissionNow);
      return;
    }

    try {
      await onSubmit({
        scheduledAt: next.toISOString(),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onClose();
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.message.toLowerCase().includes("future")
      ) {
        setClockNow(new Date());
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not send the reschedule proposal.",
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AnimatedModalContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {target.external ? "Record external reschedule" : "Request reschedule"}
          </DialogTitle>
          <DialogDescription>
            {target.external
              ? `Record the new date requested by ${target.participantName}. That team will count as agreeing to its own proposal; the other team must still accept.`
              : "Propose a new date and time. Your team will count as accepting the proposal, while the other team will be asked to confirm or counter-propose."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Proposed date
              <input
                type="date"
                required
                min={today}
                value={proposedDate}
                onChange={(event) => handleDateChange(event.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="grid gap-2 text-sm font-medium">
              <span>Kickoff time</span>
              <TimePickerPopover
                value={proposedTime}
                proposedDate={proposedDate}
                now={clockNow}
                onChange={handleTimeChange}
              />
            </div>
          </div>
          {unchanged && (
            <p className="text-xs text-muted-foreground">
              Choose a different date or kickoff time from the current fixture.
            </p>
          )}
          <label className="grid gap-2 text-sm font-medium">
            Note <span className="font-normal text-muted-foreground">(optional)</span>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="e.g. Players unavailable Friday evening"
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? "Sending…" : "Propose new date"}
            </Button>
          </DialogFooter>
        </form>
      </AnimatedModalContent>
    </Dialog>
  );
}

function FixtureCard({
  fixture,
  participants,
  isAdmin,
  viewerTeamId,
  canRespond,
  onRecordResult,
  onAccept,
  onPropose,
  actionBusy,
  featured = false,
}: {
  fixture: CompetitionFixture;
  participants: Map<string, Participant>;
  isAdmin: boolean;
  viewerTeamId: string | null;
  canRespond: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
  onAccept: (fixture: CompetitionFixture, participantId?: string) => void;
  onPropose: (target: ProposalTarget) => void;
  actionBusy: boolean;
  featured?: boolean;
}) {
  const homeParticipant = fixture.homeCompetitionTeamId
    ? participants.get(fixture.homeCompetitionTeamId) ?? null
    : null;
  const awayParticipant = fixture.awayCompetitionTeamId
    ? participants.get(fixture.awayCompetitionTeamId) ?? null
    : null;
  const home = homeParticipant?.displayName ?? "TBD";
  const away = awayParticipant?.displayName ?? "TBD";
  const completed = fixture.status === "completed";
  const [showReport, setShowReport] = useState(false);
  const queryClient = useQueryClient();
  const prefetchReport = () => {
    void queryClient.prefetchQuery(competitionMatchCentreQueryOptions(fixture.competitionId, fixture.id));
  };
  const ready = Boolean(homeParticipant && awayParticipant);
  const scheduleConfirmed = Boolean(fixture.scheduleConfirmedAt);
  const canRecord =
    isAdmin && fixture.status === "scheduled" && ready && scheduleConfirmed;
  const currentParticipant = [homeParticipant, awayParticipant].find(
    (participant) => participant?.teamId === viewerTeamId,
  );
  const currentResponse = fixtureResponseForViewer(currentParticipant, fixture);
  const matchStatus = fixtureStatus(fixture, ready, scheduleConfirmed, completed);

  const homeWinner =
    completed &&
    fixture.homeCompetitionTeamId != null &&
    fixture.winnerCompetitionTeamId === fixture.homeCompetitionTeamId;
  const awayWinner =
    completed &&
    fixture.awayCompetitionTeamId != null &&
    fixture.winnerCompetitionTeamId === fixture.awayCompetitionTeamId;

  const scheduleVisible = fixture.status === "scheduled" && ready;
  const externalParticipants = [
    homeParticipant && { participant: homeParticipant, response: fixture.homeScheduleResponse },
    awayParticipant && { participant: awayParticipant, response: fixture.awayScheduleResponse },
  ].filter(
    (row): row is { participant: Participant; response: CompetitionFixtureScheduleResponse } =>
      Boolean(row && row.participant.teamId === null),
  );

  return (
    <div
      id={`fixture-${fixture.id}`}
      className={`group relative min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border bg-background/75 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg ${
        featured
          ? "border-primary/35 bg-primary/[0.035] shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_10%,transparent)]"
          : "border-border/90"
      }`}
    >
      {featured && <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {fixtureDateLabel(fixture.scheduledAt)}
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${matchStatus.className}`}>
          {matchStatus.label}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-border/80 bg-card/50">
        <TeamRow name={home} score={fixture.homeScore} winner={homeWinner} />
        <div className="h-px bg-border/70" />
        <TeamRow name={away} score={fixture.awayScore} winner={awayWinner} />
      </div>

      {scheduleVisible && <FixtureSchedulePanel fixture={fixture} homeParticipant={homeParticipant} awayParticipant={awayParticipant} />}

      {scheduleVisible && canRespond && currentParticipant && (
        <FixtureResponseActions fixture={fixture} participant={currentParticipant} response={currentResponse} actionBusy={actionBusy} onAccept={onAccept} onPropose={onPropose} />
      )}

      {scheduleVisible && isAdmin && externalParticipants.length > 0 && (
        <ExternalScheduleActions fixture={fixture} participants={externalParticipants} actionBusy={actionBusy} onAccept={onAccept} onPropose={onPropose} />
      )}

      {completed && (fixture.linkedMatchId || ("sharedSessionId" in fixture && fixture.sharedSessionId)) && (
        <Button className="mt-3 w-full" size="sm" variant="outline" onMouseEnter={prefetchReport} onFocus={prefetchReport} onClick={() => setShowReport(true)}>
          <FileText className="size-3.5" />View Match Report
        </Button>
      )}
      {showReport && <CompetitionMatchCentre competitionId={fixture.competitionId} fixtureId={fixture.id} home={home} away={away} homeTeamId={homeParticipant?.teamId ?? null} awayTeamId={awayParticipant?.teamId ?? null} onClose={() => setShowReport(false)} />}
      {canRecord && (
        <Button className="mt-3 w-full" size="sm" variant={featured ? "default" : "outline"} onClick={() => onRecordResult(fixture)}>
          <Plus className="size-3.5" />Record result
        </Button>
      )}
    </div>
  );
}

function FixturesCollection({
  fixtures,
  participants,
  isAdmin,
  viewerTeamId,
  canRespond,
  onRecordResult,
  knockout,
}: {
  fixtures: CompetitionFixture[];
  participants: Participant[];
  isAdmin: boolean;
  viewerTeamId: string | null;
  canRespond: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
  knockout: boolean;
}) {
  const participantMap = new Map(participants.map((participant) => [participant.id, participant]));
  const accept = useCompetitionMutation(
    (input: { fixture: CompetitionFixture; participantId?: string }) =>
      acceptCompetitionFixtureSchedule(
        input.fixture.competitionId,
        input.fixture.id,
        input.fixture.scheduleRevision,
        input.participantId,
      ),
  );
  const propose = useCompetitionMutation(
    (input: { target: ProposalTarget; scheduledAt: string; note?: string }) =>
      proposeCompetitionFixtureSchedule(
        input.target.fixture.competitionId,
        input.target.fixture.id,
        {
          scheduledAt: input.scheduledAt,
          expectedRevision: input.target.fixture.scheduleRevision,
          ...(input.note ? { note: input.note } : {}),
          ...(input.target.participantId
            ? { competitionTeamId: input.target.participantId }
            : {}),
        },
      ),
  );
  const [proposalTarget, setProposalTarget] = useState<ProposalTarget | null>(null);
  const actionBusy = accept.isPending || propose.isPending;

  const commonCardProps = {
    participants: participantMap,
    isAdmin,
    viewerTeamId,
    canRespond,
    onRecordResult,
    onAccept: (fixture: CompetitionFixture, participantId?: string) =>
      accept.mutate({ fixture, participantId }),
    onPropose: setProposalTarget,
    actionBusy,
  };

  const body = knockout ? (
    <KnockoutRounds fixtures={fixtures} commonCardProps={commonCardProps} participants={participants} />
  ) : (
    <LeagueRounds fixtures={fixtures} commonCardProps={commonCardProps} />
  );

  return (
    <>
      {accept.error && (
        <p role="alert" className="text-sm text-destructive">
          {accept.error instanceof Error
            ? accept.error.message
            : "Could not update the fixture confirmation."}
        </p>
      )}
      {body}
      {proposalTarget && (
        <RescheduleDialog
          key={`${proposalTarget.fixture.id}:${proposalTarget.participantId ?? "self"}`}
          target={proposalTarget}
          busy={propose.isPending}
          onClose={() => setProposalTarget(null)}
          onSubmit={(input) =>
            propose.mutateAsync({ target: proposalTarget, ...input }).then(() => undefined)
          }
        />
      )}
    </>
  );
}

type CommonCardProps = Omit<Parameters<typeof FixtureCard>[0], "fixture" | "featured">;

function KnockoutRounds({
  fixtures,
  commonCardProps,
  participants,
}: {
  fixtures: CompetitionFixture[];
  commonCardProps: CommonCardProps;
  participants: Participant[];
}) {
  const maxRound = Math.max(0, ...fixtures.map((fixture) => fixture.round));
  if (!maxRound) return null;
  const rounds = Array.from({ length: maxRound }, (_, index) => {
    const round = index + 1;
    return {
      round,
      label: roundLabel(round, maxRound),
      rows: fixtures.filter((fixture) => fixture.round === round).sort((a, b) => a.position - b.position),
    };
  });
  const completedCount = fixtures.filter((fixture) => fixture.status === "completed").length;
  const openingGames = rounds[0]?.rows.length ?? 0;
  const bracketSize = openingGames > 0 ? openingGames * 2 : participants.length;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-14 -top-14 size-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_20px_color-mix(in_oklab,var(--primary)_14%,transparent)]">
              <Trophy className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Road to the trophy</p>
              <p className="mt-1 text-sm text-muted-foreground">Generated dates stay provisional until the participating teams agree.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
            <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-muted-foreground">{bracketSize}-team bracket</span>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">{completedCount}/{fixtures.length} complete</span>
          </div>
        </div>
      </div>

      <div className="hidden items-stretch gap-4 xl:grid" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))` }}>
        {rounds.map((round, index) => {
          const isFinal = round.round === maxRound;
          return (
            <section key={round.round} className={`relative flex min-w-0 flex-col rounded-2xl border p-3 ${isFinal ? "border-primary/25 bg-primary/[0.035]" : "border-border/80 bg-muted/[0.08]"}`}>
              {index < rounds.length - 1 && <span className="pointer-events-none absolute -right-3 top-1/2 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm"><ChevronRight className="size-3.5" /></span>}
              <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-3">
                <div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Round {round.round}</p><h3 className={`mt-0.5 text-sm font-semibold ${isFinal ? "text-primary" : "text-foreground"}`}>{round.label}</h3></div>
                {isFinal ? <Trophy className="size-4 text-primary" /> : <span className="rounded-full bg-muted/50 px-2 py-1 text-[9px] font-semibold text-muted-foreground">{round.rows.length}</span>}
              </div>
              <div className="flex flex-1 flex-col justify-around gap-3 pt-3">
                {round.rows.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} featured={isFinal} {...commonCardProps} />)}
              </div>
            </section>
          );
        })}
      </div>

      <div className="space-y-3 xl:hidden">
        {rounds.map((round, index) => {
          const isFinal = round.round === maxRound;
          return (
            <div key={round.round}>
              <section className={`rounded-2xl border p-4 ${isFinal ? "border-primary/25 bg-primary/[0.035]" : "border-border/80 bg-muted/[0.08]"}`}>
                <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Round {round.round}</p><h3 className={`mt-0.5 font-semibold ${isFinal ? "text-primary" : "text-foreground"}`}>{round.label}</h3></div>{isFinal ? <Trophy className="size-5 text-primary" /> : <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{round.rows.length} {round.rows.length === 1 ? "match" : "matches"}</span>}</div>
                <div className={`mt-3 grid gap-3 ${round.rows.length > 1 ? "sm:grid-cols-2" : ""}`}>
                  {round.rows.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} featured={isFinal} {...commonCardProps} />)}
                </div>
              </section>
              {index < rounds.length - 1 && <div className="flex h-8 items-center justify-center text-muted-foreground"><ChevronRight className="size-4 rotate-90" /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeagueRounds({ fixtures, commonCardProps }: { fixtures: CompetitionFixture[]; commonCardProps: CommonCardProps }) {
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);
  return <div className="space-y-5">{rounds.map((round) => <div key={round}><div className="mb-2 flex items-center gap-2"><CalendarClock className="size-4 text-primary" /><h3 className="font-medium">Matchday {round}</h3></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{fixtures.filter((fixture) => fixture.round === round).map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} {...commonCardProps} />)}</div></div>)}</div>;
}

export function CompetitionFixturesView({
  format,
  fixtures,
  participants,
  isAdmin,
  viewerTeamId,
  canRespond,
  onRecordResult,
}: {
  format: CompetitionFormat;
  fixtures: CompetitionFixture[];
  participants: Participant[];
  isAdmin: boolean;
  viewerTeamId: string | null;
  canRespond: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
}) {
  const leagueFixtures = fixtures.filter((fixture) => fixture.stage === "league");
  const knockoutFixtures = fixtures.filter((fixture) => fixture.stage === "knockout");
  if (!fixtures.length) return null;

  if (format === "knockout") {
    return (
      <AppCard className="space-y-4">
        <div><h2 className="flex items-center gap-2 text-lg font-semibold"><GitBranch className="size-5 text-primary" />Knockout bracket</h2><p className="mt-1 text-sm text-muted-foreground">Winners advance automatically; each generated match date must be agreed before kick-off.</p></div>
        <FixturesCollection fixtures={knockoutFixtures} participants={participants} isAdmin={isAdmin} viewerTeamId={viewerTeamId} canRespond={canRespond} onRecordResult={onRecordResult} knockout />
      </AppCard>
    );
  }

  return (
    <>
      {leagueFixtures.length > 0 && <AppCard className="space-y-4"><div><h2 className="text-lg font-semibold">League fixtures</h2><p className="mt-1 text-sm text-muted-foreground">Generated dates are proposals until both participating teams agree.</p></div><FixturesCollection fixtures={leagueFixtures} participants={participants} isAdmin={isAdmin} viewerTeamId={viewerTeamId} canRespond={canRespond} onRecordResult={onRecordResult} knockout={false} /></AppCard>}
      {format === "league_knockout" && <AppCard className="space-y-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><GitBranch className="size-5 text-primary" />Knockout stage</h2><p className="mt-1 text-sm text-muted-foreground">{knockoutFixtures.length ? "Qualifiers are seeded automatically. Date confirmation opens once both teams in a knockout fixture are known." : "The bracket will be created automatically when every league-phase fixture has a result."}</p></div>{knockoutFixtures.length > 0 && <FixturesCollection fixtures={knockoutFixtures} participants={participants} isAdmin={isAdmin} viewerTeamId={viewerTeamId} canRespond={canRespond} onRecordResult={onRecordResult} knockout />}</AppCard>}
    </>
  );
}

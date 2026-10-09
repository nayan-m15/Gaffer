import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCompetitionSuspensions } from "@/features/events/api";
import { Outlet, useNavigate, useOutlet, useParams } from "react-router-dom";
import {
  Loader2,
  LockKeyhole,
  Pencil,
  Radio,
  ShieldAlert,
  Users,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAthletes } from "@/features/team-management/api";
import {
  DEFAULT_FORMATION_ID,
  FORMATIONS,
  getDefaultFormationIdForPlayerCount,
  getFormationPlayerCount,
  getPositionRole,
  previewAssignmentsForStarters,
  resolveFormation,
} from "@/features/team-management/formations";
import { SquadFormationPreview } from "@/features/team-management/SquadFormationPreview";
import { suggestStartingXi } from "@/features/team-management/suggestions";
import type { PitchAssignments, PositionRole } from "@/features/team-management/types";
import { useGamePlan, useGamePlans } from "@/features/team-tactics/api";
import { formatEventDateTime, formatLocalDate } from "@/features/events/event-utils";
import {
  useConfirmEventLineup,
  useEvent,
  useEventLineup,
  useEventRsvps,
  useFriendlyOpponentLineup,
  useStartMatch,
} from "@/features/events/hooks";
import type { OpponentSquadVisibility } from "@/features/events/types";
import {
  contrastText,
  resolveOppColor,
  resolveOwnColor,
  teamAbbrev,
} from "@/features/matches/live-match-model";
import {
  assignmentsFromPlayers,
  type DraftOpponentPlayer,
  type OpponentSquadSetupContext,
} from "@/features/matches/opponent-squad-draft";
import { useCompetition } from "@/features/competitions/hooks";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BackendAthlete } from "@/services/athletes";
import type { BackendGamePlan } from "@/services/gamePlans";


const VISIBILITY_OPTIONS: {
  value: OpponentSquadVisibility;
  label: string;
}[] = [
  { value: "none", label: "No squad info" },
  { value: "numbers", label: "Numbers only" },
  { value: "full", label: "Numbers + names" },
];

const SETUP_STEPS = [
  { n: 1, label: "Match details" },
  { n: 2, label: "Opponent squad" },
  { n: 3, label: "Your squad" },
] as const;

const ROLE_STYLE: Record<
  PositionRole,
  { avatar: string; badge: string }
> = {
  GK: {
    avatar: "border-sky-400/70 bg-sky-500/15 text-sky-300",
    badge: "bg-sky-500/20 text-sky-300",
  },
  DEF: {
    avatar: "border-blue-400/70 bg-blue-600/15 text-blue-300",
    badge: "bg-blue-600/20 text-blue-300",
  },
  MID: {
    avatar: "border-violet-400/70 bg-violet-500/15 text-violet-300",
    badge: "bg-violet-500/20 text-violet-300",
  },
  FWD: {
    avatar: "border-orange-400/70 bg-orange-500/15 text-orange-300",
    badge: "bg-orange-500/20 text-orange-300",
  },
};

const inputClassName =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30";

const cardClassName =
  "rounded-2xl border border-border bg-card p-5 sm:p-6";

const sectionLabelClassName =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";

const GENERIC_OPPONENT_PLACEHOLDER = "e.g. Stellenbosch FC";

/** Event titles that are not useful as an opponent-name example. */
const UNHELPFUL_EVENT_TITLES = new Set([
  "untitled",
  "new event",
  "event",
  "training",
  "training session",
  "saturday training",
  "match",
  "meeting",
  "game",
  "fixture",
  "friendly",
  "practice",
]);

function opponentNamePlaceholder(eventTitle: string) {
  const title = eventTitle.trim();
  if (!title || UNHELPFUL_EVENT_TITLES.has(title.toLowerCase())) {
    return GENERIC_OPPONENT_PLACEHOLDER;
  }
  return `e.g. ${title}`;
}

function getOpponentSquadError(
  visibility: OpponentSquadVisibility,
  players: DraftOpponentPlayer[],
) {
  if (visibility !== "none" && players.length === 0) {
    return visibility === "full"
      ? "Add at least one opponent player with a shirt number and name."
      : "Add at least one opponent shirt number.";
  }
  if (visibility === "full" && players.some((player) => !player.name?.trim())) {
    return "Enter a name for every opponent player.";
  }
  return null;
}

function isBeforeMatchDay(scheduledAt: string, now = new Date()) {
  const scheduled = new Date(scheduledAt);
  if (Number.isNaN(scheduled.getTime())) {
    return false;
  }
  return formatLocalDate(now) < formatLocalDate(scheduled);
}

function startingIdsFromGamePlan(
  plan: BackendGamePlan,
  selectableRosterIds: Set<string>,
) {
  const ids: string[] = [];
  const starterLimit = getFormationPlayerCount(plan.formationId);
  for (const athleteId of Object.values(plan.assignments)) {
    if (
      athleteId &&
      selectableRosterIds.has(athleteId) &&
      !ids.includes(athleteId) &&
      ids.length < starterLimit
    ) {
      ids.push(athleteId);
    }
  }
  return new Set(ids);
}

/** JSONB object keys may be returned in a different order from the object
 * sent to the API. Compare tactical snapshots structurally, not by insertion
 * order, or an unchanged saved lineup will incorrectly look "unshared". */
function canonicalSnapshot(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSnapshot).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${JSON.stringify(key)}:${canonicalSnapshot(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const MAX_BENCH_SIZE = 20;

function benchIdsFromRoster(
  athletes: BackendAthlete[],
  startingIds: Set<string>,
  plan: BackendGamePlan | undefined,
  suspendedIds: ReadonlySet<string>,
) {
  const nonStarters = athletes
    .filter((athlete) => athlete.status !== "injured" && !suspendedIds.has(athlete.id))
    .map((athlete) => athlete.id)
    .filter((id) => !startingIds.has(id));
  if (nonStarters.length <= MAX_BENCH_SIZE) {
    return nonStarters;
  }
  const preferred = new Set(plan?.substituteIds ?? []);
  const fromPlanBench = nonStarters.filter((id) => preferred.has(id));
  const remainder = nonStarters.filter((id) => !preferred.has(id));
  return [...fromPlanBench, ...remainder].slice(0, MAX_BENCH_SIZE);
}

function formatHeroWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .toUpperCase()
    .replace(",", " ·");
}

function crestInitial(name: string) {
  const letter = name.trim().match(/[A-Za-z]/)?.[0];
  return (letter ?? "?").toUpperCase();
}

function athleteDisplayName(athlete: BackendAthlete) {
  return `${athlete.firstName} ${athlete.lastName}`.trim();
}

function planCounts(plan: BackendGamePlan) {
  const starters = Object.values(plan.assignments).filter(
    (id): id is string => typeof id === "string",
  ).length;
  return { starters, subs: plan.substituteIds.length };
}

function roleStyle(position: string | null) {
  const role = getPositionRole(position) ?? "MID";
  return ROLE_STYLE[role];
}

function MiniPitch({
  formationId,
  customPositions,
}: {
  formationId: string;
  customPositions?: BackendGamePlan["customPositions"];
}) {
  const formation = resolveFormation(formationId, customPositions);

  return (
    <div
      className="relative h-[72px] w-[52px] shrink-0 overflow-hidden rounded-sm border border-emerald-900/80 bg-[#143322]"
      aria-hidden
    >
      <div className="absolute inset-x-1 top-1/2 h-px bg-white/25" />
      <div className="absolute inset-y-1 left-1/2 w-px bg-white/10" />
      {formation.positions.map((slot) => (
        <span
          key={slot.id}
          className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90"
          style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
        />
      ))}
    </div>
  );
}

function OpponentSquadPitchThumb({
  formationId,
  customPositions,
  assignedSlotIds,
  color,
}: {
  formationId: string;
  customPositions?: BackendGamePlan["customPositions"];
  assignedSlotIds: Set<string>;
  color: string;
}) {
  const formation = resolveFormation(formationId, customPositions);

  return (
    <div
      className="relative size-[90px] shrink-0 overflow-hidden rounded-md border border-emerald-900/80 bg-[#143322]"
      aria-hidden
    >
      <div className="absolute inset-x-1.5 top-1/2 h-px bg-white/25" />
      <div className="absolute inset-y-1.5 left-1/2 w-px bg-white/10" />
      {formation.positions.map((slot) => {
        const filled = assignedSlotIds.has(slot.id);
        return (
          <span
            key={slot.id}
            className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              backgroundColor: filled ? color : "#6b7280",
            }}
          />
        );
      })}
    </div>
  );
}

function PlacedProgressRing({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const size = 22;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max <= 0 ? 0 : Math.min(1, value / max);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#6b728055"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${circumference * ratio} ${circumference}`}
      />
    </svg>
  );
}

function Crest({
  name,
  color,
  empty,
}: {
  name: string;
  color: string;
  empty?: boolean;
}) {
  const initial = empty ? "?" : crestInitial(name);
  return (
    <span
      className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 text-lg font-bold"
      style={{
        borderColor: color,
        backgroundColor: `${color}22`,
        color: empty ? "#9ca3af" : contrastText(color) === "#ffffff" ? "#ffffff" : color,
      }}
    >
      {initial}
    </span>
  );
}

function HeroClub({
  name,
  abbrev,
  color,
  venue,
  align,
  empty,
}: {
  name: string;
  abbrev: string;
  color: string;
  venue: "Home" | "Away";
  align: "left" | "right";
  empty?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        align === "right" && "flex-row-reverse text-right",
      )}
    >
      <Crest name={name} color={color} empty={empty} />
      <div className="min-w-0">
        <p className="truncate text-lg font-bold uppercase tracking-wide text-foreground">
          {abbrev}
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {venue}
        </p>
      </div>
    </div>
  );
}

function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-4">
      <span
        className="size-16 rounded-xl border border-white/10"
        style={{
          backgroundColor: value,
          boxShadow: `0 0 22px ${value}66`,
        }}
      />
      <span>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
      </span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        className="sr-only"
        aria-label={label}
      />
    </label>
  );
}

type OpponentFieldEvent = {
  competitionFixtureId?: string | null;
  friendlyFixtureId?: string | null;
  friendlyOpponentTeamName?: string | null;
  friendlyFixtureStatus?: string | null;
  competitionId?: string | null;
  title: string;
};

function OpponentField({
  event,
  fixtureHasOpponent,
  fixtureOpponentName,
  participants,
  competitionLoading,
  competitionError,
  competitionName,
  selectedParticipantId,
  onSelectParticipant,
  opponentName,
  onOpponentNameChange,
}: {
  event: OpponentFieldEvent;
  fixtureHasOpponent: boolean;
  fixtureOpponentName: string;
  participants: { id: string; displayName: string }[];
  competitionLoading: boolean;
  competitionError: boolean;
  competitionName?: string;
  selectedParticipantId: string | null;
  onSelectParticipant: (id: string) => void;
  opponentName: string;
  onOpponentNameChange: (name: string) => void;
}) {
  const locked = Boolean(event.competitionFixtureId || event.friendlyFixtureId);
  const fixtureMessage = fixtureHasOpponent
    ? "This opponent is fixed by the generated competition fixture."
    : "The opponent will be filled automatically when the fixture pairing is known.";
  const friendlyMessage = {
    accepted: "Friendly fixture confirmed — confirm your lineup to share it before kick-off.",
    pending: "Waiting for this Gaffer opponent to accept the fixture request.",
    declined: "The opponent declined this fixture. Update the event to pick another opponent.",
  }[event.friendlyFixtureStatus ?? ""] ?? "This friendly fixture is no longer active.";
  const placeholder = competitionLoading
    ? "Loading participating teams…"
    : "Choose an opponent";

  return (
    <div className="space-y-2">
      <Label htmlFor={locked ? undefined : "opponent-name"}>Opponent</Label>
      {event.competitionFixtureId ? (
        <>
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-muted/25 px-3 py-2.5">
            <span className={cn("min-w-0 truncate text-sm font-medium", !fixtureHasOpponent && "text-muted-foreground")}>
              {fixtureHasOpponent ? fixtureOpponentName : "Opponent not determined yet"}
            </span>
            <LockKeyhole className="size-4 shrink-0 text-primary" aria-hidden />
          </div>
          <p className="text-xs text-muted-foreground">{fixtureMessage}</p>
        </>
      ) : event.friendlyFixtureId ? (
        <>
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-muted/25 px-3 py-2.5">
            <span className={cn("min-w-0 truncate text-sm font-medium", !event.friendlyOpponentTeamName?.trim() && "text-muted-foreground")}>
              {event.friendlyOpponentTeamName?.trim() || "Opponent pending"}
            </span>
            <LockKeyhole className="size-4 shrink-0 text-primary" aria-hidden />
          </div>
          <p className="text-xs text-muted-foreground">{friendlyMessage}</p>
        </>
      ) : event.competitionId ? (
        <>
          <select
            id="opponent-name"
            className={inputClassName}
            value={selectedParticipantId ?? ""}
            disabled={competitionLoading || competitionError}
            onChange={(changeEvent) => onSelectParticipant(changeEvent.target.value)}
          >
            <option value="" disabled>{placeholder}</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>{participant.displayName}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Opponents are limited to teams participating in {competitionName ?? "this competition"}.
          </p>
          {competitionError && <p className="text-xs text-destructive">Could not load the competition teams. Please retry.</p>}
        </>
      ) : (
        <input
          id="opponent-name"
          className={inputClassName}
          value={opponentName}
          onChange={(changeEvent) => onOpponentNameChange(changeEvent.target.value)}
          placeholder={opponentNamePlaceholder(event.title)}
          autoComplete="off"
          maxLength={100}
        />
      )}
    </div>
  );
}

function MatchDetailsSection({
  event,
  fixtureHasOpponent,
  fixtureOpponentName,
  participants,
  competitionLoading,
  competitionError,
  competitionName,
  selectedParticipantId,
  onSelectParticipant,
  opponentName,
  onOpponentNameChange,
  isHome,
  venueLocked,
  venuePulse,
  ownColor,
  opponentColor,
  onVenueChange,
}: {
  event: OpponentFieldEvent;
  fixtureHasOpponent: boolean;
  fixtureOpponentName: string;
  participants: { id: string; displayName: string }[];
  competitionLoading: boolean;
  competitionError: boolean;
  competitionName?: string;
  selectedParticipantId: string | null;
  onSelectParticipant: (id: string) => void;
  opponentName: string;
  onOpponentNameChange: (name: string) => void;
  isHome: boolean;
  venueLocked: boolean;
  venuePulse: number;
  ownColor: string;
  opponentColor: string;
  onVenueChange: (home: boolean) => void;
}) {
  return (
    <section className={cardClassName}>
      <h2 className={sectionLabelClassName}>Match details</h2>
      <div className="mt-4 space-y-4">
        <OpponentField
          event={event}
          fixtureHasOpponent={fixtureHasOpponent}
          fixtureOpponentName={fixtureOpponentName}
          participants={participants}
          competitionLoading={competitionLoading}
          competitionError={competitionError}
          competitionName={competitionName}
          selectedParticipantId={selectedParticipantId}
          onSelectParticipant={onSelectParticipant}
          opponentName={opponentName}
          onOpponentNameChange={onOpponentNameChange}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium">Venue</p>
          <div className="flex gap-2">
            <button
              type="button"
              key={isHome ? `home-${venuePulse}` : "home"}
              disabled={venueLocked}
              aria-pressed={isHome}
              onClick={() => onVenueChange(true)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                "transition-all duration-200 ease-out",
                isHome ? "scale-105" : "scale-100 border hover:opacity-90",
                isHome && venuePulse > 0 && "animate-venue-pop",
              )}
              style={
                isHome
                  ? {
                      backgroundColor: ownColor,
                      color: contrastText(ownColor),
                      boxShadow: `0 0 18px ${ownColor}8c`,
                    }
                  : { borderColor: `${ownColor}66`, color: ownColor }
              }
            >
              Home
            </button>
            <button
              type="button"
              key={!isHome ? `away-${venuePulse}` : "away"}
              disabled={venueLocked}
              aria-pressed={!isHome}
              onClick={() => onVenueChange(false)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                "transition-all duration-200 ease-out",
                !isHome ? "scale-105" : "scale-100 border hover:opacity-90",
                !isHome && venuePulse > 0 && "animate-venue-pop",
              )}
              style={
                !isHome
                  ? {
                      backgroundColor: opponentColor,
                      color: contrastText(opponentColor),
                      boxShadow: `0 0 18px ${opponentColor}8c`,
                    }
                  : { borderColor: `${opponentColor}66`, color: opponentColor }
              }
            >
              Away
            </button>
          </div>
          {venueLocked && <p className="text-xs text-muted-foreground">Home and away are set by this fixture.</p>}
        </div>
      </div>
    </section>
  );
}

function friendlyOpponentLineupMessage(
  event: OpponentFieldEvent,
  lineup: { available: boolean; teamId?: string | null; teamName?: string | null } | undefined,
) {
  if (lineup?.available) {
    return `Auto-filled from ${lineup.teamName ?? "the opponent"}'s confirmed lineup — adjust it if needed.`;
  }
  if (event.competitionFixtureId && lineup?.teamId) {
    return `Opponent lineup not available yet — ${lineup.teamName} has not confirmed their lineup. You can still enter it manually.`;
  }
  if (event.competitionFixtureId) {
    return "This fixture's opponent has not linked a Gaffer team yet; enter their squad manually.";
  }
  if (event.friendlyFixtureStatus === "accepted") {
    return `Opponent lineup not available yet — ${event.friendlyOpponentTeamName ?? "the opponent"} has not confirmed their lineup. You can still enter it manually.`;
  }
  if (event.friendlyFixtureStatus === "pending") {
    return "Their lineup is shared automatically once they accept the fixture and confirm it.";
  }
  return "The fixture request was not accepted, so no lineup can be shared.";
}

function OpponentSquadSummary({
  event,
  lineup,
  visibility,
  formationId,
  summary,
  opponentColor,
  error,
  onEdit,
  showSharedLineupMessage = true,
}: {
  event: OpponentFieldEvent;
  lineup: { available: boolean; teamId?: string | null; teamName?: string | null } | undefined;
  visibility: OpponentSquadVisibility;
  formationId: string;
  summary: {
    modeLabel: string;
    playerCount: number;
    placedCount: number;
    assignedSlotIds: Set<string>;
    formationCaption: string;
  };
  opponentColor: string;
  error: string | null;
  onEdit: () => void;
  showSharedLineupMessage?: boolean;
}) {
  return (
    <section className={cardClassName}>
      <div className="flex items-start justify-between gap-3">
        <h2 className={sectionLabelClassName}>Opponent squad</h2>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{ borderColor: opponentColor, color: opponentColor }}
        >
          <Pencil className="size-3" />
          Edit opponent squad
        </button>
      </div>
      {showSharedLineupMessage && (event.friendlyFixtureId || event.competitionFixtureId) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {friendlyOpponentLineupMessage(event, lineup)}
        </p>
      )}
      {visibility === "none" ? (
        <div className="mt-4">
          <span
            className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: opponentColor, backgroundColor: `${opponentColor}22` }}
          >
            {summary.modeLabel}
          </span>
          <p className="mt-2 text-sm text-muted-foreground">No opponent info will be logged</p>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-4">
          <OpponentSquadPitchThumb
            formationId={formationId}
            assignedSlotIds={summary.assignedSlotIds}
            color={opponentColor}
          />
          <div className="min-w-0">
            <span
              className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: opponentColor, backgroundColor: `${opponentColor}22` }}
            >
              {summary.modeLabel}
            </span>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm font-bold text-foreground">
                {summary.playerCount} player{summary.playerCount === 1 ? "" : "s"}
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                <PlacedProgressRing
                  value={summary.placedCount}
                  max={summary.playerCount > 0 ? summary.playerCount : 1}
                  color={opponentColor}
                />
                {summary.placedCount} placed
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{summary.formationCaption}</p>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}

function SavedGamePlanSection({
  gamePlans,
  selectedGamePlanId,
  loading,
  error,
  onSelect,
}: {
  gamePlans: BackendGamePlan[];
  selectedGamePlanId: string | null;
  loading: boolean;
  error?: string;
  onSelect: (planId: string | null) => void;
}) {
  return (
    <section className={cardClassName}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className={sectionLabelClassName}>Saved game plan</h2>
        <p className="text-sm text-muted-foreground">Pick a plan to pre-fill your XI, then adjust below</p>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              "flex h-full w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
              "hover:border-primary/40 hover:bg-card/80",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selectedGamePlanId === null ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <div className="flex h-[72px] w-[52px] shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">—</div>
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Pick from roster</span>
                {selectedGamePlanId === null && <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">Selected</span>}
              </span>
              <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">No plan</span>
              <span className="mt-1 block text-xs text-muted-foreground">Start fresh</span>
            </span>
          </button>
        </li>
        {gamePlans.map((plan) => {
          const selected = selectedGamePlanId === plan.id;
          const counts = planCounts(plan);
          return (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => onSelect(plan.id)}
                className={cn(
                  "flex h-full w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
                  "hover:border-primary/40 hover:bg-card/80",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <MiniPitch formationId={plan.formationId} />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{plan.name}</span>
                    {selected && <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">Selected</span>}
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{plan.formationId}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{counts.starters} starters · {counts.subs} subs</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selectedGamePlanId && loading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading game plan…
        </p>
      )}
      {selectedGamePlanId && error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}

type HeroClubInfo = {
  name: string;
  abbrev: string;
  color: string;
  empty: boolean;
};

function MatchSetupHero({
  scheduledAt,
  location,
  isHome,
  homeClub,
  awayClub,
}: {
  scheduledAt: string;
  location: string | null;
  isHome: boolean;
  homeClub: HeroClubInfo;
  awayClub: HeroClubInfo;
}) {
  return (
    <section className={cardClassName}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Match setup</p>
        <p className="text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {formatHeroWhen(scheduledAt)}
        </p>
      </div>
      <div
        key={isHome ? "home" : "away"}
        className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4 animate-fade-in [animation-duration:280ms]"
      >
        <HeroClub {...homeClub} venue="Home" align="left" />
        <div className="text-center">
          <p className="font-display text-2xl font-bold text-muted-foreground">VS</p>
          <p className="mt-1 max-w-[10rem] truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {location || "Venue not set"}
          </p>
        </div>
        <HeroClub {...awayClub} venue="Away" align="right" />
      </div>
    </section>
  );
}

function MatchSetupProgress({ states }: { states: readonly [string, string, string] }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {SETUP_STEPS.map((step, index) => {
        const state = states[index];
        return (
          <li key={step.n} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                state === "todo" && "border-border text-muted-foreground",
                state === "current" && "border-primary text-primary",
                state === "done" && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {step.n}
            </span>
            <span
              className={cn(
                "hidden truncate text-[10px] font-semibold uppercase tracking-[0.16em] sm:inline",
                state === "todo" ? "text-muted-foreground" : "text-primary",
              )}
            >
              {step.label}
            </span>
            {index < SETUP_STEPS.length - 1 && (
              <span className={cn("h-px min-w-4 flex-1", state === "done" ? "bg-primary/70" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StartingSquadSection({
  startingCount,
  startingTarget,
  benchCount,
  xiComplete,
  selectableCount,
  suggestionReasons,
  fixtureDateConfirmed,
  beforeMatchDay,
  sortedAthletes,
  startingIds,
  suspendedIds,
  onSuggest,
  onToggle,
  formationId,
  assignments,
  athletes,
}: {
  startingCount: number;
  startingTarget: number;
  benchCount: number;
  xiComplete: boolean;
  selectableCount: number;
  suggestionReasons: Record<string, string> | null;
  fixtureDateConfirmed: boolean;
  beforeMatchDay: boolean;
  sortedAthletes: BackendAthlete[];
  startingIds: Set<string>;
  suspendedIds: Set<string>;
  onSuggest: () => void;
  onToggle: (athleteId: string) => void;
  formationId: string;
  assignments: PitchAssignments;
  athletes: BackendAthlete[];
}) {
  return (
    <section className={cardClassName}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={sectionLabelClassName}>Your squad</h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            <span className={cn(xiComplete ? "text-primary" : "text-muted-foreground")}>
              Starting lineup: {startingCount} / {startingTarget}
            </span>
            <span className="mx-2 text-border">·</span>
            Bench: {benchCount}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSuggest}
            disabled={selectableCount === 0}
            className="shrink-0 gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
          >
            <Wand2 className="size-3.5" aria-hidden /> Suggest XI
          </Button>
        </div>
      </div>
      {suggestionReasons && <p className="mt-3 text-xs text-muted-foreground">Suggested XI applied — tap any player to replace or remove them.</p>}
      {!fixtureDateConfirmed && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
          This generated fixture is still provisional. Both teams must agree the date in Leagues &amp; Competitions before the match can start.
        </p>
      )}
      {beforeMatchDay && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
          Matches cannot be started before match day — you can still confirm your lineup now so the opponent can prepare.
        </p>
      )}
      {selectableCount < startingTarget && <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">Need at least {startingTarget} available players for this match.</p>}
      <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">
        <ul className="flex flex-col gap-2">
          {sortedAthletes.map((athlete) => {
            const selected = startingIds.has(athlete.id);
            const injured = athlete.status === "injured";
            const suspended = suspendedIds.has(athlete.id);
            const unavailable = injured || suspended;
            const style = roleStyle(athlete.position);
            const positionLabel = (athlete.position ?? "—").toUpperCase();
            return (
              <li key={athlete.id}>
                <button
                  type="button"
                  onClick={() => onToggle(athlete.id)}
                  disabled={unavailable}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors sm:p-4",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    unavailable ? "cursor-not-allowed border-red-500/30 bg-red-500/5 opacity-70" : selected ? "border-primary/70 bg-primary/5" : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <span className={cn("flex h-10 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold", style.avatar)}>
                    {athlete.squadNumber ?? "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{athleteDisplayName(athlete)}</span>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", style.badge)}>{positionLabel}</span>
                    </span>
                    {selected && suggestionReasons?.[athlete.id] && <span className="mt-1 block truncate text-[11px] font-medium text-primary/80">{suggestionReasons[athlete.id]}</span>}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", unavailable ? "bg-red-500/10 text-red-600 dark:text-red-400" : selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    {injured ? "Injured" : suspended ? "Suspended" : selected ? "Starting" : "Bench"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <SquadFormationPreview
          className="lg:sticky lg:top-4"
          formationId={formationId}
          assignments={assignments}
          athletes={athletes}
        />
      </div>
    </section>
  );
}

function LineupConfirmationSection({
  lineupReady,
  lineupDirty,
  canConfirmLineup,
  canSubmit,
  confirming,
  starting,
  beforeMatchDay,
  message,
  onConfirm,
  onStart,
}: {
  lineupReady: boolean;
  lineupDirty: boolean;
  canConfirmLineup: boolean;
  canSubmit: boolean;
  confirming: boolean;
  starting: boolean;
  beforeMatchDay: boolean;
  message: string;
  onConfirm: () => void;
  onStart: () => void;
}) {
  return (
    <section className={cardClassName}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionLabelClassName}>Lineup confirmation</h2>
        <span className={cn(
          "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
          lineupReady && !lineupDirty ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500",
        )}>
          {lineupStatusLabel(lineupReady, lineupDirty)}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={!canConfirmLineup || (lineupReady && !lineupDirty)}
          onClick={onConfirm}
          className={cn(
            "h-14 w-full rounded-xl border text-xs font-bold uppercase tracking-[0.18em] transition-colors sm:text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            lineupReady && !lineupDirty ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-primary/60 text-primary hover:bg-primary/10",
          )}
        >
          {lineupConfirmLabel(confirming, lineupReady, lineupDirty)}
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onStart}
          className={cn(
            "h-14 w-full rounded-xl bg-primary text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground transition-opacity sm:text-sm",
            "shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_45%,transparent)]",
            "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
          )}
        >
          {matchStartLabel(starting, beforeMatchDay, lineupReady, lineupDirty)}
        </button>
      </div>
    </section>
  );
}

function lineupStatusLabel(lineupReady: boolean, lineupDirty: boolean) {
  if (!lineupReady) return "Not confirmed";
  return lineupDirty ? "Changes not shared" : "Shared";
}

function lineupConfirmLabel(
  confirming: boolean,
  lineupReady: boolean,
  lineupDirty: boolean,
) {
  if (confirming) return "Saving lineup…";
  if (!lineupReady) return "Confirm lineup";
  return lineupDirty ? "Update confirmed lineup" : "Lineup confirmed";
}

function matchStartLabel(
  starting: boolean,
  beforeMatchDay: boolean,
  lineupReady: boolean,
  lineupDirty: boolean,
) {
  if (starting) return "Starting…";
  if (beforeMatchDay) return "Available on match day";
  if (!lineupReady) return "Confirm lineup first";
  return lineupDirty ? "Update lineup to start" : "Start match & open Live Logger";
}

function getLineupStatusMessage({
  fixtureDateConfirmed,
  lineupReady,
  lineupDirty,
  sharingWithOpponent,
  friendlyOpponentLabel,
  confirmedAt,
  beforeMatchDay,
}: {
  fixtureDateConfirmed: boolean;
  lineupReady: boolean;
  lineupDirty: boolean;
  sharingWithOpponent: boolean;
  friendlyOpponentLabel: string;
  confirmedAt?: string;
  beforeMatchDay: boolean;
}) {
  if (!fixtureDateConfirmed) {
    return "The fixture must be confirmed before the lineup can be saved.";
  }
  if (!lineupReady) {
    return sharingWithOpponent
      ? `Confirm your lineup to share it with ${friendlyOpponentLabel} — they will see it on their match setup page before kick-off.`
      : "Confirm your lineup to lock in the starting XI before the match starts.";
  }
  if (lineupDirty) {
    return sharingWithOpponent
      ? `Your XI changed since it was shared — update the confirmed lineup so ${friendlyOpponentLabel} sees the latest squad.`
      : "Your XI changed since it was confirmed — update the confirmed lineup to keep the saved squad accurate.";
  }
  const confirmedWhen = confirmedAt ? formatEventDateTime(confirmedAt) : "";
  if (!sharingWithOpponent) {
    return `Lineup confirmed ${confirmedWhen}. You can start the match when ready.`;
  }
  const matchDayNote = beforeMatchDay ? " Kick-off unlocks on match day." : "";
  return `Lineup confirmed ${confirmedWhen} — ${friendlyOpponentLabel} can see it on their match setup page.${matchDayNote}`;
}

function isOpponentReadyForSetup({
  hasGeneratedFixture,
  generatedOpponentReady,
  hasCompetition,
  selectedCompetitionOpponent,
  opponentName,
}: {
  hasGeneratedFixture: boolean;
  generatedOpponentReady: boolean;
  hasCompetition: boolean;
  selectedCompetitionOpponent: boolean;
  opponentName: string;
}) {
  if (hasGeneratedFixture) return generatedOpponentReady;
  if (hasCompetition) return selectedCompetitionOpponent;
  return opponentName.trim().length > 0;
}

function canStartMatch({
  canConfirmLineup,
  lineupReady,
  lineupDirty,
  opponentReady,
  beforeMatchDay,
  startPending,
  hasCompetition,
  hasGeneratedFixture,
  competitionLoading,
  competitionError,
  selectedGamePlan,
  gamePlanLoading,
  gamePlanError,
}: {
  canConfirmLineup: boolean;
  lineupReady: boolean;
  lineupDirty: boolean;
  opponentReady: boolean;
  beforeMatchDay: boolean;
  startPending: boolean;
  hasCompetition: boolean;
  hasGeneratedFixture: boolean;
  competitionLoading: boolean;
  competitionError: boolean;
  selectedGamePlan: boolean;
  gamePlanLoading: boolean;
  gamePlanError: boolean;
}) {
  return (
    canConfirmLineup &&
    lineupReady &&
    !lineupDirty &&
    opponentReady &&
    !beforeMatchDay &&
    !startPending &&
    !(hasCompetition && !hasGeneratedFixture && (competitionLoading || competitionError)) &&
    !(selectedGamePlan && (gamePlanLoading || gamePlanError))
  );
}

function setupStepStates(
  detailsComplete: boolean,
  squadInfoComplete: boolean,
  xiComplete: boolean,
) {
  return [
    detailsComplete ? "done" : "current",
    detailsComplete ? (squadInfoComplete ? "done" : "current") : "todo",
    xiComplete ? "done" : detailsComplete && squadInfoComplete ? "current" : "todo",
  ] as const;
}

export default function ConfirmSquadPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const opponentOutlet = useOutlet();
  const { team } = useAuth();
  const eventQuery = useEvent(eventId);
  const lineupQuery = useEventLineup(eventId);
  const friendlyLineupQuery = useFriendlyOpponentLineup(
    eventId,
    Boolean(eventQuery.data?.friendlyFixtureId || eventQuery.data?.competitionFixtureId),
  );
  const competitionQuery = useCompetition(eventQuery.data?.competitionId);
  const athletesQuery = useAthletes();
  const suspensionQuery = useQuery({
    queryKey: ["competition-suspensions", eventId],
    queryFn: () => fetchCompetitionSuspensions(eventId!),
    enabled: Boolean(eventId && eventQuery.data?.competitionId),
    staleTime: 0,
  });
  const suspendedIds = useMemo(
    () => new Set((suspensionQuery.data ?? []).map((item) => item.athleteId)),
    [suspensionQuery.data],
  );
  const gamePlansQuery = useGamePlans();
  const startMatch = useStartMatch(eventId ?? "");
  const confirmLineup = useConfirmEventLineup(eventId ?? "");
  // Assistants cannot read the coach-only RSVP endpoint; their suggestions
  // simply run without the RSVP signal.
  const rsvpQuery = useEventRsvps(eventId, team?.role === "coach");
  const [selectedGamePlanId, setSelectedGamePlanId] = useState<string | null>(
    null,
  );
  const [startingIds, setStartingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [opponentName, setOpponentName] = useState("");
  const [opponentCompetitionTeamId, setOpponentCompetitionTeamId] = useState<string | null>(null);
  const [manualIsHome, setIsHome] = useState(true);
  const venueLocked = Boolean(eventQuery.data?.friendlyFixtureId || eventQuery.data?.competitionFixtureId);
  const fixtureIsHome = eventQuery.data?.fixtureIsHome ?? (
    eventQuery.data?.friendlyRequesterTeamId
      ? eventQuery.data.friendlyRequesterTeamId === eventQuery.data.teamId
      : null
  );
  const isHome = venueLocked ? (fixtureIsHome ?? true) : manualIsHome;
  const [venuePulse, setVenuePulse] = useState(0);
  const [opponentSquadVisibility, setOpponentSquadVisibility] =
    useState<OpponentSquadVisibility>("none");
  const [opponentPlayers, setOpponentPlayers] = useState<
    DraftOpponentPlayer[]
  >([]);
  const [opponentCustomPositions, setOpponentCustomPositions] = useState<BackendGamePlan["customPositions"]>(null);
  const [opponentFormationId, setOpponentFormationId] = useState(
    DEFAULT_FORMATION_ID,
  );
  const [opponentSquadError, setOpponentSquadError] = useState<string | null>(
    null,
  );
  const [teamColor, setTeamColor] = useState<string | null>(null);
  const [opponentColor, setOpponentColor] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [suggestionReasons, setSuggestionReasons] = useState<
    Record<string, string> | null
  >(null);

  const gamePlanQuery = useGamePlan(selectedGamePlanId ?? undefined);
  const appliedGamePlanIdRef = useRef<string | null>(null);

  const athletes = useMemo(
    () => athletesQuery.data ?? [],
    [athletesQuery.data],
  );
  const gamePlans = useMemo(
    () => gamePlansQuery.data ?? [],
    [gamePlansQuery.data],
  );
  const competitionPlayerCount = eventQuery.data?.competitionId
    ? (competitionQuery.data?.playersPerSide ?? null)
    : null;
  const selectedPlanSummary = useMemo(
    () =>
      selectedGamePlanId
        ? gamePlans.find((plan) => plan.id === selectedGamePlanId) ?? null
        : null,
    [gamePlans, selectedGamePlanId],
  );
  const startingTarget =
    competitionPlayerCount ??
    getFormationPlayerCount(
      gamePlanQuery.data?.formationId ??
        selectedPlanSummary?.formationId ??
        DEFAULT_FORMATION_ID,
    );
  const selectableAthletes = useMemo(
    () => athletes.filter((athlete) => athlete.status !== "injured" && !suspendedIds.has(athlete.id)),
    [athletes, suspendedIds],
  );
  const selectableRosterIds = useMemo(
    () => new Set(selectableAthletes.map((athlete) => athlete.id)),
    [selectableAthletes],
  );

  const ownColor = resolveOwnColor(teamColor, team?.primaryColor);
  const oppColor = resolveOppColor(opponentColor);

  useEffect(() => {
    if (!competitionPlayerCount || !selectedGamePlanId) {
      return;
    }
    const selectedPlan = gamePlans.find((plan) => plan.id === selectedGamePlanId);
    if (
      selectedPlan &&
      getFormationPlayerCount(selectedPlan.formationId) !== competitionPlayerCount
    ) {
      appliedGamePlanIdRef.current = null;
      setSelectedGamePlanId(null);
      setStartingIds(new Set());
    }
  }, [competitionPlayerCount, gamePlans, selectedGamePlanId]);

  useEffect(() => {
    if (!selectedGamePlanId) {
      appliedGamePlanIdRef.current = null;
      return;
    }
    if (!gamePlanQuery.data || gamePlanQuery.data.id !== selectedGamePlanId) {
      return;
    }
    if (appliedGamePlanIdRef.current === selectedGamePlanId) {
      return;
    }
    appliedGamePlanIdRef.current = selectedGamePlanId;
    setStartingIds(
      startingIdsFromGamePlan(gamePlanQuery.data, selectableRosterIds),
    );
  }, [selectedGamePlanId, gamePlanQuery.data, selectableRosterIds]);

  // Suggestion chips only describe the suggestion they came from; switching
  // the game plan replaces the XI, so the stale reasons are dropped too.
  useEffect(() => {
    setSuggestionReasons(null);
  }, [selectedGamePlanId, gamePlanQuery.data?.id]);

  useEffect(() => {
    const currentFormation = FORMATIONS[opponentFormationId];
    if (currentFormation?.playerCount === startingTarget) {
      return;
    }
    setOpponentFormationId(
      getDefaultFormationIdForPlayerCount(startingTarget),
    );
  }, [opponentFormationId, startingTarget]);

  useEffect(() => {
    setStartingIds((current) => {
      const next = new Set(
        [...current].filter((id) => selectableRosterIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [selectableRosterIds]);

  // The confirmed pre-match lineup is the source of truth on load: prefill
  // the XI once, as soon as both the lineup and the roster have arrived.
  const appliedLineupRef = useRef<string | null>(null);
  useEffect(() => {
    const lineup = lineupQuery.data;
    if (!lineup || !eventId || appliedLineupRef.current === eventId) {
      return;
    }
    if (!athletesQuery.data) {
      // Wait for the roster so the pruning effect above cannot clear the XI.
      return;
    }
    appliedLineupRef.current = eventId;
    setStartingIds(new Set(lineup.startingAthleteIds));
  }, [athletesQuery.data, eventId, lineupQuery.data]);

  const competitionParticipants = useMemo(
    () =>
      (competitionQuery.data?.participants ?? []).filter(
        (participant) => participant.teamId !== eventQuery.data?.teamId,
      ),
    [competitionQuery.data?.participants, eventQuery.data?.teamId],
  );
  const selectedCompetitionOpponent = useMemo(
    () =>
      competitionParticipants.find(
        (participant) => participant.id === opponentCompetitionTeamId,
      ) ?? null,
    [competitionParticipants, opponentCompetitionTeamId],
  );
  const generatedFixtureOpponentId =
    eventQuery.data?.fixtureOpponentCompetitionTeamId ?? null;
  const generatedFixtureOpponentName =
    eventQuery.data?.fixtureOpponentName?.trim() ?? "";
  const generatedFixtureHasOpponent = Boolean(
    eventQuery.data?.competitionFixtureId &&
      generatedFixtureOpponentId &&
      generatedFixtureOpponentName,
  );

  useEffect(() => {
    if (eventQuery.data?.friendlyFixtureId) {
      // The opponent is the linked Gaffer team — resolved server-side when
      // the match is started, so it is read-only here.
      setOpponentCompetitionTeamId(null);
      setOpponentName(eventQuery.data.friendlyOpponentTeamName ?? "");
      return;
    }
    if (eventQuery.data?.competitionFixtureId) {
      setOpponentCompetitionTeamId(generatedFixtureOpponentId);
      setOpponentName(generatedFixtureOpponentName);
      return;
    }
    if (!eventQuery.data?.competitionId) {
      setOpponentCompetitionTeamId(null);
      return;
    }
    if (
      opponentCompetitionTeamId &&
      !competitionParticipants.some(
        (participant) => participant.id === opponentCompetitionTeamId,
      )
    ) {
      setOpponentCompetitionTeamId(null);
      setOpponentName("");
    }
  }, [
    competitionParticipants,
    eventQuery.data?.competitionFixtureId,
    eventQuery.data?.competitionId,
    eventQuery.data?.friendlyFixtureId,
    eventQuery.data?.friendlyOpponentTeamName,
    generatedFixtureOpponentId,
    generatedFixtureOpponentName,
    opponentCompetitionTeamId,
  ]);

  const startingCount = startingIds.size;
  const benchCount = Math.max(selectableAthletes.length - startingCount, 0);
  const opponentReady = isOpponentReadyForSetup({
    hasGeneratedFixture: Boolean(eventQuery.data?.competitionFixtureId),
    generatedOpponentReady: generatedFixtureHasOpponent,
    hasCompetition: Boolean(eventQuery.data?.competitionId),
    selectedCompetitionOpponent: selectedCompetitionOpponent !== null,
    opponentName,
  });
  const beforeMatchDay = eventQuery.data
    ? isBeforeMatchDay(eventQuery.data.scheduledAt)
    : false;
  // Friendly fixtures are only confirmed once the Gaffer opponent accepted;
  // generated competition fixtures keep their own schedule gate.
  const friendlyFixtureLinked = Boolean(eventQuery.data?.friendlyFixtureStatus);
  const friendlyFixtureAccepted =
    !friendlyFixtureLinked ||
    eventQuery.data?.friendlyFixtureStatus === "accepted";
  const fixtureDateConfirmed =
    (!eventQuery.data?.competitionFixtureId ||
      Boolean(eventQuery.data.fixtureScheduleConfirmedAt)) &&
    friendlyFixtureAccepted;
  const confirmedLineup = lineupQuery.data ?? null;
  // When revisiting an already-confirmed fixture, the saved tactical snapshot
  // is the baseline. Without this fallback the page silently re-generates a
  // default formation/slot layout and marks the *unchanged* lineup as dirty.
  // An explicitly selected game plan still takes precedence.
  const selectedPlan =
    selectedGamePlanId && gamePlanQuery.data?.id === selectedGamePlanId
      ? gamePlanQuery.data
      : null;
  const previewFormationId =
    selectedPlan?.formationId ??
    selectedPlanSummary?.formationId ??
    (!selectedGamePlanId ? confirmedLineup?.formationId : null) ??
    getDefaultFormationIdForPlayerCount(startingTarget);
  const previewCustomPositions =
    selectedPlan?.customPositions ??
    (!selectedGamePlanId ? confirmedLineup?.customPositions : null) ??
    null;
  const previewAssignments = useMemo(() => {
    const athleteById = new Map(
      athletes.map((athlete) => [athlete.id, athlete]),
    );
    return previewAssignmentsForStarters(
      previewFormationId,
      [...startingIds],
      (id) => athleteById.get(id)?.position ?? null,
      selectedPlan?.assignments ??
        (!selectedGamePlanId ? confirmedLineup?.pitchAssignments ?? undefined : undefined),
      previewCustomPositions,
    );
  }, [
    athletes,
    selectedPlan?.assignments,
    selectedGamePlanId,
    confirmedLineup?.pitchAssignments,
    previewCustomPositions,
    previewFormationId,
    startingIds,
  ]);

  const lineupReady = Boolean(confirmedLineup);
  const lineupDirty = useMemo(() => {
    if (!confirmedLineup) return false;
    const confirmedIds = new Set(confirmedLineup.startingAthleteIds);
    if (confirmedIds.size !== startingIds.size) return true;
    for (const id of startingIds) {
      if (!confirmedIds.has(id)) return true;
    }
    // Confirmation is a full tactical snapshot, not just a list of IDs.
    const currentBench = benchIdsFromRoster(athletes, startingIds, gamePlanQuery.data, suspendedIds);
    if (currentBench.length !== confirmedLineup.benchAthleteIds.length ||
        currentBench.some((id) => !confirmedLineup.benchAthleteIds.includes(id))) return true;
    if (confirmedLineup.formationId && confirmedLineup.formationId !== previewFormationId) return true;
    if (confirmedLineup.pitchAssignments &&
        canonicalSnapshot(confirmedLineup.pitchAssignments) !== canonicalSnapshot(previewAssignments)) return true;
    if (canonicalSnapshot(confirmedLineup.customPositions ?? null) !==
        canonicalSnapshot(previewCustomPositions)) return true;
    return false;
  }, [confirmedLineup, startingIds, previewFormationId, previewAssignments, previewCustomPositions, gamePlanQuery.data, athletes, suspendedIds]);
  // Lineups can be confirmed before match day for advance sharing.
  const canConfirmLineup =
    startingCount === startingTarget &&
    selectableAthletes.length >= startingTarget &&
    fixtureDateConfirmed &&
    !confirmLineup.isPending;
  const canUpdateLineup = canConfirmLineup && (!lineupReady || lineupDirty);
  const canSubmit = canStartMatch({
    canConfirmLineup,
    lineupReady,
    lineupDirty,
    opponentReady: opponentReady && (!venueLocked || fixtureIsHome !== null),
    beforeMatchDay,
    startPending: startMatch.isPending,
    hasCompetition: Boolean(eventQuery.data?.competitionId),
    hasGeneratedFixture: Boolean(eventQuery.data?.competitionFixtureId),
    competitionLoading: competitionQuery.isFetching,
    competitionError: competitionQuery.isError,
    selectedGamePlan: Boolean(selectedGamePlanId),
    gamePlanLoading: gamePlanQuery.isFetching,
    gamePlanError: gamePlanQuery.isError,
  });

  const friendlyOpponentLabel = eventQuery.data?.competitionFixtureId
    ? eventQuery.data.fixtureOpponentName?.trim() || "the opponent"
    : eventQuery.data?.friendlyOpponentTeamName?.trim() || "the opponent";
  const linkedOpponent =
    Boolean(eventQuery.data?.friendlyOpponentTeamId) ||
    Boolean(
      eventQuery.data?.competitionFixtureId &&
      competitionParticipants.find(
        (participant) => participant.id === generatedFixtureOpponentId,
      )?.teamId,
    ) ||
    Boolean(
      friendlyLineupQuery.data &&
      ("players" in friendlyLineupQuery.data
        ? friendlyLineupQuery.data.teamId
        : friendlyLineupQuery.data.available),
    );
  const sharingWithOpponent =
    linkedOpponent && (!friendlyFixtureLinked || friendlyFixtureAccepted);
  const lineupStatusMessage = getLineupStatusMessage({
    fixtureDateConfirmed,
    lineupReady,
    lineupDirty,
    sharingWithOpponent,
    friendlyOpponentLabel,
    confirmedAt: confirmedLineup?.confirmedAt,
    beforeMatchDay,
  });

  const detailsComplete = opponentReady;
  const squadInfoComplete =
    opponentSquadVisibility === "none" || opponentPlayers.length > 0;
  const xiComplete = startingCount === startingTarget;
  const stepState = setupStepStates(
    detailsComplete,
    squadInfoComplete,
    xiComplete,
  );

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

  const opponentSummary = useMemo(() => {
    const modeLabel =
      VISIBILITY_OPTIONS.find(
        (option) => option.value === opponentSquadVisibility,
      )?.label ?? "No squad info";
    const playerCount = opponentPlayers.length;
    const placedCount = opponentPlayers.filter((player) =>
      Boolean(player.position?.trim()),
    ).length;
    const formation =
      FORMATIONS[opponentFormationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
    const assignments = assignmentsFromPlayers(
      opponentFormationId,
      opponentPlayers,
    );
    const assignedSlotIds = new Set(
      Object.entries(assignments)
        .filter(([, shirt]) => Boolean(shirt))
        .map(([slotId]) => slotId),
    );
    const unassignedSlots = Math.max(
      0,
      formation.positions.length - assignedSlotIds.size,
    );
    const formationCaption =
      unassignedSlots === 0
        ? `${formation.name} formation entered — all slots assigned`
        : `${formation.name} formation entered — ${unassignedSlots} slot${
            unassignedSlots === 1 ? "" : "s"
          } still unassigned`;

    return {
      modeLabel,
      playerCount,
      placedCount,
      assignedSlotIds,
      formationCaption,
    };
  }, [opponentFormationId, opponentPlayers, opponentSquadVisibility]);

  const setVenue = (home: boolean) => {
    if (venueLocked) return;
    setIsHome(home);
    setVenuePulse((tick) => tick + 1);
  };

  const toggleStarter = (athleteId: string) => {
    if (!selectableRosterIds.has(athleteId)) {
      return;
    }

    setStartingIds((current) => {
      const next = new Set(current);
      if (next.has(athleteId)) {
        next.delete(athleteId);
      } else if (next.size < startingTarget) {
        next.add(athleteId);
      }
      return next;
    });
  };

  const handleConfirmLineup = async () => {
    if (!eventId || !canUpdateLineup) {
      return;
    }
    setSubmitError(null);
    try {
      await confirmLineup.mutateAsync({
        startingAthleteIds: [...startingIds],
        benchAthleteIds: benchIdsFromRoster(
          athletes,
          startingIds,
          gamePlanQuery.data,
          suspendedIds,
        ),
        formationId: previewFormationId,
        pitchAssignments: previewAssignments,
        customPositions: previewCustomPositions,
      });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "Could not confirm the lineup. Please try again.",
      );
    }
  };

  const handleSuggestXI = () => {
    const suggestion = suggestStartingXi({
      formationId: previewFormationId,
      athletes,
      rsvpByAthleteId: rsvpQuery.data
        ? Object.fromEntries(
            rsvpQuery.data.map((row) => [row.id, row.rsvpStatus]),
          )
        : undefined,
      gamePlanAssignments: gamePlanQuery.data?.assignments,
      gamePlanSubstituteIds: gamePlanQuery.data?.substituteIds,
    });
    setStartingIds(new Set(suggestion.startingIds));
    setSuggestionReasons(suggestion.reasons);
  };

  const handleSubmit = async () => {
    if (!eventId || !canSubmit || (venueLocked && fixtureIsHome === null)) {
      return;
    }
    const squadError = linkedOpponent
      ? null
      : getOpponentSquadError(opponentSquadVisibility, opponentPlayers);
    if (squadError) {
      setOpponentSquadError(squadError);
      return;
    }
    setSubmitError(null);
    setOpponentSquadError(null);
    try {
      const resolvedCompetitionOpponentId = eventQuery.data?.competitionFixtureId
        ? generatedFixtureOpponentId
        : selectedCompetitionOpponent?.id ?? null;
      const resolvedCompetitionOpponentName = eventQuery.data?.competitionFixtureId
        ? generatedFixtureOpponentName
        : selectedCompetitionOpponent?.displayName ?? opponentName.trim();
      const match = await startMatch.mutateAsync({
        opponentName: resolvedCompetitionOpponentName,
        ...(eventQuery.data?.competitionId && resolvedCompetitionOpponentId
          ? { opponentCompetitionTeamId: resolvedCompetitionOpponentId }
          : {}),
        isHome,
        startingAthleteIds: [...startingIds],
        benchAthleteIds: benchIdsFromRoster(
          athletes,
          startingIds,
          gamePlanQuery.data,
          suspendedIds,
        ),
        opponentSquadVisibility: linkedOpponent ? "none" : opponentSquadVisibility,
        teamColor: ownColor,
        opponentColor: oppColor,
        ...(linkedOpponent || opponentSquadVisibility === "none"
          ? {}
          : {
              opponentSquad: opponentPlayers.map((player) => ({
                shirtNumber: player.shirtNumber,
                ...(opponentSquadVisibility === "full"
                  ? { name: player.name }
                  : {}),
                ...(player.position ? { position: player.position } : {}),
              })),
            }),
        ...(selectedGamePlanId
          ? { gamePlanId: selectedGamePlanId }
          : {}),
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

  const handlePlanSelection = (planId: string | null) => {
    if (planId === null) {
      setSelectedGamePlanId(null);
      return;
    }
    const reselectingPlan = selectedGamePlanId === planId;
    if (reselectingPlan) appliedGamePlanIdRef.current = null;
    setSelectedGamePlanId(planId);
    if (reselectingPlan && gamePlanQuery.data?.id === planId) {
      setStartingIds(startingIdsFromGamePlan(gamePlanQuery.data, selectableRosterIds));
      appliedGamePlanIdRef.current = planId;
    }
  };

  if (
    eventQuery.isLoading ||
    athletesQuery.isLoading ||
    gamePlansQuery.isLoading ||
    (Boolean(eventQuery.data?.competitionId) && suspensionQuery.isLoading) ||
    Boolean(eventQuery.data?.competitionFixtureId && competitionQuery.isLoading)
  ) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading matchday squad…</p>
        </div>
      </div>
    );
  }

  if (
    eventQuery.isError ||
    athletesQuery.isError ||
    gamePlansQuery.isError ||
    (Boolean(eventQuery.data?.competitionId) && suspensionQuery.isError) ||
    (eventQuery.data?.competitionFixtureId && competitionQuery.isError)
  ) {
    const error =
      eventQuery.error ?? athletesQuery.error ?? gamePlansQuery.error ??
      competitionQuery.error ?? suspensionQuery.error;
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
              void gamePlansQuery.refetch();
              if (eventQuery.data?.competitionFixtureId) void competitionQuery.refetch();
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

  if (opponentOutlet && (linkedOpponent || !event.matchId)) {
    const setupContext: OpponentSquadSetupContext = {
      visibility: opponentSquadVisibility,
      players: opponentPlayers,
      formationId: opponentFormationId,
      customPositions: opponentCustomPositions,
      playerCount: startingTarget,
      opponentColor: oppColor,
      linkedOpponent,
      lineup: friendlyLineupQuery.data,
      lineupLoading: friendlyLineupQuery.isLoading,
      lineupError: friendlyLineupQuery.isError,
      onRetryLineup: () => {
        void friendlyLineupQuery.refetch();
      },
      opponentName: friendlyOpponentLabel,
      onSave: (next) => {
        setOpponentSquadVisibility(next.visibility);
        setOpponentPlayers(next.players);
        setOpponentFormationId(next.formationId);
        if (next.formationId !== opponentFormationId) setOpponentCustomPositions(null);
        setOpponentSquadError(null);
      },
    };
    return <Outlet context={setupContext} />;
  }

  if (event.matchId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Radio className="size-8 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Match already started
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            The squad is managed live now — lineup changes and match events
            happen in the Live Logger.
          </p>
          <Button onClick={() => navigate(`/matches/${event.matchId}/live`)}>
            Open Live Logger
          </Button>
        </div>
      </div>
    );
  }

  if (athletes.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Users className="size-10 text-muted-foreground/50" />
          <h2 className="text-lg font-semibold text-foreground">
            No players available
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add players to your squad from the Roster page before confirming
            a starting lineup.
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
    );
  }

  const ownName = team?.name ?? "Your team";
  const resolvedOpponentName = eventQuery.data?.competitionFixtureId
    ? generatedFixtureOpponentName
    : selectedCompetitionOpponent?.displayName ?? opponentName.trim();
  const oppName = resolvedOpponentName || "Opponent";
  const oppEmpty = !resolvedOpponentName;
  const homeClub = isHome
    ? {
        name: ownName,
        abbrev: teamAbbrev(ownName),
        color: ownColor,
        empty: false,
      }
    : {
        name: oppName,
        abbrev: oppEmpty ? "OPP" : teamAbbrev(oppName),
        color: oppColor,
        empty: oppEmpty,
      };
  const awayClub = isHome
    ? {
        name: oppName,
        abbrev: oppEmpty ? "OPP" : teamAbbrev(oppName),
        color: oppColor,
        empty: oppEmpty,
      }
    : {
        name: ownName,
        abbrev: teamAbbrev(ownName),
        color: ownColor,
        empty: false,
      };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-8 lg:px-10">
      <MatchSetupHero
        scheduledAt={event.scheduledAt}
        location={event.location}
        isHome={isHome}
        homeClub={homeClub}
        awayClub={awayClub}
      />      <MatchSetupProgress states={stepState} />

      <div className="grid gap-5 lg:grid-cols-2">
        <MatchDetailsSection
          event={event}
          fixtureHasOpponent={generatedFixtureHasOpponent}
          fixtureOpponentName={generatedFixtureOpponentName}
          participants={competitionParticipants}
          competitionLoading={competitionQuery.isFetching}
          competitionError={competitionQuery.isError}
          competitionName={competitionQuery.data?.name}
          selectedParticipantId={opponentCompetitionTeamId}
          onSelectParticipant={(id) => {
            const participant = competitionParticipants.find((item) => item.id === id);
            setOpponentCompetitionTeamId(participant?.id ?? null);
            setOpponentName(participant?.displayName ?? "");
          }}
          opponentName={opponentName}
          onOpponentNameChange={setOpponentName}
          isHome={isHome}
          venueLocked={venueLocked}
          venuePulse={venuePulse}
          ownColor={ownColor}
          opponentColor={oppColor}
          onVenueChange={setVenue}
        />

        {linkedOpponent ? (
          <section className={cardClassName}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className={sectionLabelClassName}>Opponent lineup</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/events/${eventId}/confirm-squad/opponent`)}
              >
                View opponent lineup
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {friendlyLineupQuery.isError ? "Could not load the opponent lineup. Open the view to retry."
                : friendlyLineupQuery.isLoading ? "Loading opponent lineup..."
                : friendlyLineupQuery.data?.available ? "View the shared lineup, formation and bench. Read only."
                : "Waiting for the opponent to accept the fixture and confirm their lineup."}
            </p>
          </section>
        ) : (
          <OpponentSquadSummary
            event={event}
            lineup={friendlyLineupQuery.data && "players" in friendlyLineupQuery.data ? friendlyLineupQuery.data : undefined}
            visibility={opponentSquadVisibility}
            formationId={opponentFormationId}
            summary={opponentSummary}
            opponentColor={oppColor}
            error={opponentSquadError}
            onEdit={() => navigate(`/events/${eventId}/confirm-squad/opponent`)}
          />
        )}

      </div>

      <SavedGamePlanSection
        gamePlans={gamePlans}
        selectedGamePlanId={selectedGamePlanId}
        loading={gamePlanQuery.isFetching}
        error={gamePlanQuery.isError
          ? gamePlanQuery.error instanceof Error
            ? gamePlanQuery.error.message
            : "Could not load this game plan."
          : undefined}
        onSelect={handlePlanSelection}
      />

      <StartingSquadSection
        startingCount={startingCount}
        startingTarget={startingTarget}
        benchCount={benchCount}
        xiComplete={xiComplete}
        selectableCount={selectableAthletes.length}
        suggestionReasons={suggestionReasons}
        fixtureDateConfirmed={fixtureDateConfirmed}
        beforeMatchDay={beforeMatchDay}
        sortedAthletes={sortedAthletes}
        suspendedIds={suspendedIds}
        startingIds={startingIds}
        onSuggest={handleSuggestXI}
        onToggle={toggleStarter}
        formationId={previewFormationId}
        assignments={previewAssignments}
        athletes={athletes}
      />

      <section className={cardClassName}>
        <h2 className={sectionLabelClassName}>Team colours</h2>
        <div className="mt-4 flex flex-wrap gap-8">
          <ColorSwatch
            label="Our team"
            value={ownColor}
            onChange={setTeamColor}
          />
          <ColorSwatch
            label="Opponent"
            value={oppColor}
            onChange={setOpponentColor}
          />
        </div>
      </section>

      {submitError && (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      )}

      <LineupConfirmationSection
        lineupReady={lineupReady}
        lineupDirty={lineupDirty}
        canConfirmLineup={canConfirmLineup}
        canSubmit={canSubmit}
        confirming={confirmLineup.isPending}
        starting={startMatch.isPending}
        beforeMatchDay={beforeMatchDay}
        message={lineupStatusMessage}
        onConfirm={() => void handleConfirmLineup()}
        onStart={() => void handleSubmit()}
      />

    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useOutlet, useParams } from "react-router-dom";
import { Loader2, Pencil, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAthletes } from "@/features/team-management/api";
import {
  DEFAULT_FORMATION_ID,
  FORMATIONS,
  getPositionRole,
  previewAssignmentsForStarters,
} from "@/features/team-management/formations";
import { SquadFormationPreview } from "@/features/team-management/SquadFormationPreview";
import type { PositionRole } from "@/features/team-management/types";
import { useGamePlan, useGamePlans } from "@/features/team-tactics/api";
import { formatLocalDate } from "@/features/events/event-utils";
import { useEvent, useStartMatch } from "@/features/events/hooks";
import type { OpponentSquadVisibility } from "@/features/events/types";
import { useCompetitions } from "@/features/statistics/hooks";
import type { CompetitionWithStandings } from "@/features/statistics/types";
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
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BackendAthlete } from "@/services/athletes";
import type { BackendGamePlan } from "@/services/gamePlans";

const STARTING_XI_SIZE = 11;

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

const OPPONENT_NAME_SUGGESTIONS_ID = "opponent-name-suggestions";
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

function opponentSuggestionsFromStandings(
  competitions: CompetitionWithStandings[] | undefined,
  competitionId: string | null,
) {
  if (!competitionId) {
    return [];
  }
  const competition = competitions?.find((entry) => entry.id === competitionId);
  if (!competition) {
    return [];
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const standing of competition.standings) {
    if (standing.isOwnTeam) {
      continue;
    }
    const name = standing.teamName.trim();
    if (!name || seen.has(name.toLowerCase())) {
      continue;
    }
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
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
  for (const athleteId of Object.values(plan.assignments)) {
    if (
      athleteId &&
      selectableRosterIds.has(athleteId) &&
      !ids.includes(athleteId) &&
      ids.length < STARTING_XI_SIZE
    ) {
      ids.push(athleteId);
    }
  }
  return new Set(ids);
}

const MAX_BENCH_SIZE = 20;

function benchIdsFromRoster(
  athletes: BackendAthlete[],
  startingIds: Set<string>,
  plan: BackendGamePlan | undefined,
) {
  const nonStarters = athletes
    .filter((athlete) => athlete.status !== "injured")
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

function MiniPitch({ formationId }: { formationId: string }) {
  const formation =
    FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];

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
  assignedSlotIds,
  color,
}: {
  formationId: string;
  assignedSlotIds: Set<string>;
  color: string;
}) {
  const formation =
    FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];

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

export default function ConfirmSquadPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const opponentOutlet = useOutlet();
  const { team } = useAuth();
  const eventQuery = useEvent(eventId);
  const athletesQuery = useAthletes();
  const gamePlansQuery = useGamePlans();
  const startMatch = useStartMatch(eventId ?? "");
  const competitionId = eventQuery.data?.competitionId ?? null;
  const competitionsQuery = useCompetitions({
    enabled: Boolean(competitionId),
  });
  const opponentSuggestions = useMemo(
    () =>
      opponentSuggestionsFromStandings(competitionsQuery.data, competitionId),
    [competitionsQuery.data, competitionId],
  );

  const [selectedGamePlanId, setSelectedGamePlanId] = useState<string | null>(
    null,
  );
  const [startingIds, setStartingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [opponentName, setOpponentName] = useState("");
  const [isHome, setIsHome] = useState(true);
  const [venuePulse, setVenuePulse] = useState(0);
  const [opponentSquadVisibility, setOpponentSquadVisibility] =
    useState<OpponentSquadVisibility>("none");
  const [opponentPlayers, setOpponentPlayers] = useState<
    DraftOpponentPlayer[]
  >([]);
  const [opponentFormationId, setOpponentFormationId] = useState(
    DEFAULT_FORMATION_ID,
  );
  const [opponentSquadError, setOpponentSquadError] = useState<string | null>(
    null,
  );
  const [teamColor, setTeamColor] = useState<string | null>(null);
  const [opponentColor, setOpponentColor] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
  const selectableAthletes = useMemo(
    () => athletes.filter((athlete) => athlete.status !== "injured"),
    [athletes],
  );
  const selectableRosterIds = useMemo(
    () => new Set(selectableAthletes.map((athlete) => athlete.id)),
    [selectableAthletes],
  );

  const ownColor = resolveOwnColor(teamColor, team?.primaryColor);
  const oppColor = resolveOppColor(opponentColor);

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

  useEffect(() => {
    setStartingIds((current) => {
      const next = new Set(
        [...current].filter((id) => selectableRosterIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [selectableRosterIds]);

  const startingCount = startingIds.size;
  const benchCount = Math.max(selectableAthletes.length - startingCount, 0);
  const opponentReady = opponentName.trim().length > 0;
  const beforeMatchDay = eventQuery.data
    ? isBeforeMatchDay(eventQuery.data.scheduledAt)
    : false;
  const canSubmit =
    startingCount === STARTING_XI_SIZE &&
    opponentReady &&
    !beforeMatchDay &&
    !startMatch.isPending &&
    !(selectedGamePlanId && (gamePlanQuery.isFetching || gamePlanQuery.isError));

  const detailsComplete = opponentReady;
  const squadInfoComplete =
    opponentSquadVisibility === "none" || opponentPlayers.length > 0;
  const xiComplete = startingCount === STARTING_XI_SIZE;
  const stepState = [
    detailsComplete ? "done" : "current",
    detailsComplete
      ? squadInfoComplete
        ? "done"
        : "current"
      : "todo",
    xiComplete ? "done" : detailsComplete && squadInfoComplete ? "current" : "todo",
  ] as const;

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

  const previewFormationId =
    gamePlanQuery.data?.formationId ?? DEFAULT_FORMATION_ID;
  const previewAssignments = useMemo(() => {
    const athleteById = new Map(
      athletes.map((athlete) => [athlete.id, athlete]),
    );
    return previewAssignmentsForStarters(
      previewFormationId,
      [...startingIds],
      (id) => athleteById.get(id)?.position ?? null,
      gamePlanQuery.data?.assignments,
    );
  }, [athletes, gamePlanQuery.data?.assignments, previewFormationId, startingIds]);

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
    if (
      opponentSquadVisibility !== "none" &&
      opponentPlayers.length === 0
    ) {
      setOpponentSquadError(
        opponentSquadVisibility === "full"
          ? "Add at least one opponent player with a shirt number and name."
          : "Add at least one opponent shirt number.",
      );
      return;
    }
    if (
      opponentSquadVisibility === "full" &&
      opponentPlayers.some((player) => !player.name?.trim())
    ) {
      setOpponentSquadError(
        "Enter a name for every opponent player.",
      );
      return;
    }
    setSubmitError(null);
    setOpponentSquadError(null);
    try {
      const match = await startMatch.mutateAsync({
        opponentName: opponentName.trim(),
        isHome,
        startingAthleteIds: [...startingIds],
        benchAthleteIds: benchIdsFromRoster(
          athletes,
          startingIds,
          gamePlanQuery.data,
        ),
        opponentSquadVisibility,
        teamColor: ownColor,
        opponentColor: oppColor,
        ...(opponentSquadVisibility === "none"
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

  if (opponentOutlet) {
    const setupContext: OpponentSquadSetupContext = {
      visibility: opponentSquadVisibility,
      players: opponentPlayers,
      formationId: opponentFormationId,
      opponentColor: oppColor,
      onSave: (next) => {
        setOpponentSquadVisibility(next.visibility);
        setOpponentPlayers(next.players);
        setOpponentFormationId(next.formationId);
        setOpponentSquadError(null);
      },
    };
    return <Outlet context={setupContext} />;
  }

  if (
    eventQuery.isLoading ||
    athletesQuery.isLoading ||
    gamePlansQuery.isLoading
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

  if (eventQuery.isError || athletesQuery.isError || gamePlansQuery.isError) {
    const error =
      eventQuery.error ?? athletesQuery.error ?? gamePlansQuery.error;
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
    );
  }

  const ownName = team?.name ?? "Your team";
  const oppName = opponentName.trim() || "Opponent";
  const oppEmpty = !opponentName.trim();
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
      <section className={cardClassName}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Match setup
          </p>
          <p className="text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {formatHeroWhen(event.scheduledAt)}
          </p>
        </div>
        <div
          key={isHome ? "home" : "away"}
          className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4 animate-fade-in [animation-duration:280ms]"
        >
          <HeroClub
            name={homeClub.name}
            abbrev={homeClub.abbrev}
            color={homeClub.color}
            venue="Home"
            align="left"
            empty={homeClub.empty}
          />
          <div className="text-center">
            <p className="font-display text-2xl font-bold text-muted-foreground">
              VS
            </p>
            <p className="mt-1 max-w-[10rem] truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {event.location}
            </p>
          </div>
          <HeroClub
            name={awayClub.name}
            abbrev={awayClub.abbrev}
            color={awayClub.color}
            venue="Away"
            align="right"
            empty={awayClub.empty}
          />
        </div>
      </section>

      <ol className="flex items-center gap-2 sm:gap-3">
        {SETUP_STEPS.map((step, index) => {
          const state = stepState[index];
          return (
            <li key={step.n} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                  state === "todo" &&
                    "border-border text-muted-foreground",
                  state === "current" &&
                    "border-primary text-primary",
                  state === "done" &&
                    "border-primary bg-primary text-primary-foreground",
                )}
              >
                {step.n}
              </span>
              <span
                className={cn(
                  "hidden truncate text-[10px] font-semibold uppercase tracking-[0.16em] sm:inline",
                  state === "todo"
                    ? "text-muted-foreground"
                    : "text-primary",
                )}
              >
                {step.label}
              </span>
              {index < SETUP_STEPS.length - 1 && (
                <span
                  className={cn(
                    "h-px min-w-4 flex-1",
                    state === "done" ? "bg-primary/70" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={cardClassName}>
          <h2 className={sectionLabelClassName}>Match details</h2>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opponent-name">Opponent name</Label>
              <input
                id="opponent-name"
                list={
                  opponentSuggestions.length > 0
                    ? OPPONENT_NAME_SUGGESTIONS_ID
                    : undefined
                }
                className={inputClassName}
                value={opponentName}
                onChange={(changeEvent) =>
                  setOpponentName(changeEvent.target.value)
                }
                placeholder={opponentNamePlaceholder(event.title)}
                autoComplete="off"
                maxLength={100}
              />
              {opponentSuggestions.length > 0 ? (
                <datalist id={OPPONENT_NAME_SUGGESTIONS_ID}>
                  {opponentSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              ) : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Venue</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  key={isHome ? `home-${venuePulse}` : "home"}
                  onClick={() => setVenue(true)}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                    "transition-all duration-200 ease-out",
                    isHome
                      ? "scale-105"
                      : "scale-100 border hover:opacity-90",
                    isHome && venuePulse > 0 && "animate-venue-pop",
                  )}
                  style={
                    isHome
                      ? {
                          backgroundColor: ownColor,
                          color: contrastText(ownColor),
                          boxShadow: `0 0 18px ${ownColor}8c`,
                        }
                      : {
                          borderColor: `${ownColor}66`,
                          color: ownColor,
                        }
                  }
                >
                  Home
                </button>
                <button
                  type="button"
                  key={!isHome ? `away-${venuePulse}` : "away"}
                  onClick={() => setVenue(false)}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                    "transition-all duration-200 ease-out",
                    !isHome
                      ? "scale-105"
                      : "scale-100 border hover:opacity-90",
                    !isHome && venuePulse > 0 && "animate-venue-pop",
                  )}
                  style={
                    !isHome
                      ? {
                          backgroundColor: oppColor,
                          color: contrastText(oppColor),
                          boxShadow: `0 0 18px ${oppColor}8c`,
                        }
                      : {
                          borderColor: `${oppColor}66`,
                          color: oppColor,
                        }
                  }
                >
                  Away
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={cardClassName}>
          <div className="flex items-start justify-between gap-3">
            <h2 className={sectionLabelClassName}>Opponent squad</h2>
            <button
              type="button"
              onClick={() =>
                navigate(`/events/${eventId}/confirm-squad/opponent`)
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{
                borderColor: oppColor,
                color: oppColor,
              }}
            >
              <Pencil className="size-3" />
              Edit opponent squad
            </button>
          </div>
          {opponentSquadVisibility === "none" ? (
            <div className="mt-4">
              <span
                className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{
                  color: oppColor,
                  backgroundColor: `${oppColor}22`,
                }}
              >
                {opponentSummary.modeLabel}
              </span>
              <p className="mt-2 text-sm text-muted-foreground">
                No opponent info will be logged
              </p>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-4">
              <OpponentSquadPitchThumb
                formationId={opponentFormationId}
                assignedSlotIds={opponentSummary.assignedSlotIds}
                color={oppColor}
              />
              <div className="min-w-0">
                <span
                  className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{
                    color: oppColor,
                    backgroundColor: `${oppColor}22`,
                  }}
                >
                  {opponentSummary.modeLabel}
                </span>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-bold text-foreground">
                    {opponentSummary.playerCount} player
                    {opponentSummary.playerCount === 1 ? "" : "s"}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    <PlacedProgressRing
                      value={opponentSummary.placedCount}
                      max={
                        opponentSummary.playerCount > 0
                          ? opponentSummary.playerCount
                          : 1
                      }
                      color={oppColor}
                    />
                    {opponentSummary.placedCount} placed
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {opponentSummary.formationCaption}
                </p>
              </div>
            </div>
          )}
          {opponentSquadError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {opponentSquadError}
            </p>
          )}
        </section>
      </div>

      <section className={cardClassName}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className={sectionLabelClassName}>Saved game plan</h2>
          <p className="text-sm text-muted-foreground">
            Pick a plan to pre-fill your XI, then adjust below
          </p>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <li>
            <button
              type="button"
              onClick={() => setSelectedGamePlanId(null)}
              className={cn(
                "flex h-full w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
                "hover:border-primary/40 hover:bg-card/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                selectedGamePlanId === null
                  ? "border-primary bg-primary/5"
                  : "border-border",
              )}
            >
              <div className="flex h-[72px] w-[52px] shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                —
              </div>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    Pick from roster
                  </span>
                  {selectedGamePlanId === null && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                      Selected
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  No plan
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Start fresh
                </span>
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
                  onClick={() => {
                    if (selectedGamePlanId === plan.id) {
                      appliedGamePlanIdRef.current = null;
                    }
                    setSelectedGamePlanId(plan.id);
                    if (
                      selectedGamePlanId === plan.id &&
                      gamePlanQuery.data?.id === plan.id
                    ) {
                      setStartingIds(
                        startingIdsFromGamePlan(
                          gamePlanQuery.data,
                          selectableRosterIds,
                        ),
                      );
                      appliedGamePlanIdRef.current = plan.id;
                    }
                  }}
                  className={cn(
                    "flex h-full w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
                    "hover:border-primary/40 hover:bg-card/80",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border",
                  )}
                >
                  <MiniPitch formationId={plan.formationId} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {plan.name}
                      </span>
                      {selected && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                          Selected
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {plan.formationId}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {counts.starters} starters · {counts.subs} subs
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {selectedGamePlanId && gamePlanQuery.isFetching && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading game plan…
          </p>
        )}
        {selectedGamePlanId && gamePlanQuery.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {gamePlanQuery.error instanceof Error
              ? gamePlanQuery.error.message
              : "Could not load this game plan."}
          </p>
        )}
      </section>

      <section className={cardClassName}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className={sectionLabelClassName}>Your squad</h2>
          <p className="text-sm text-muted-foreground">
            <span
              className={cn(
                xiComplete ? "text-primary" : "text-muted-foreground",
              )}
            >
              Starting XI: {startingCount} / {STARTING_XI_SIZE}
            </span>
            <span className="mx-2 text-border">·</span>
            Bench: {benchCount}
          </p>
        </div>

        {beforeMatchDay && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            Matches cannot be started before match day.
          </p>
        )}

        {selectableAthletes.length < STARTING_XI_SIZE && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            Need at least 11 players for a full XI.
          </p>
        )}

        <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">
          <ul className="flex flex-col gap-2">
            {sortedAthletes.map((athlete) => {
              const selected = startingIds.has(athlete.id);
              const injured = athlete.status === "injured";
              const style = roleStyle(athlete.position);
              const positionLabel = (athlete.position ?? "—").toUpperCase();
              return (
                <li key={athlete.id}>
                  <button
                    type="button"
                    onClick={() => toggleStarter(athlete.id)}
                    disabled={injured}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors sm:p-4",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      injured
                        ? "cursor-not-allowed border-red-500/30 bg-red-500/5 opacity-70"
                        : selected
                          ? "border-primary/70 bg-primary/5"
                          : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                        style.avatar,
                      )}
                    >
                      {athlete.squadNumber ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {athleteDisplayName(athlete)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            style.badge,
                          )}
                        >
                          {positionLabel}
                        </span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                        injured
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {injured ? "Injured" : selected ? "Starting" : "Bench"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <SquadFormationPreview
            className="lg:sticky lg:top-4"
            formationId={previewFormationId}
            assignments={previewAssignments}
            athletes={athletes}
          />
        </div>
      </section>

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

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => void handleSubmit()}
        className={cn(
          "h-14 w-full rounded-xl bg-primary text-sm font-bold uppercase tracking-[0.18em] text-primary-foreground transition-opacity",
          "shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_45%,transparent)]",
          "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        )}
      >
        {startMatch.isPending ? "Saving…" : "Confirm starting XI"}
      </button>
    </div>
  );
}

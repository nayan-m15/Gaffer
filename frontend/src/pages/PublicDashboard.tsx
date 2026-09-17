import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Clock3,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";
import {
  StandingsDisplay,
  type ReadOnlyCompetition,
} from "@/components/standings/StandingsDisplay";
import { brand } from "@/data/brand";
import { PlayerCard } from "@/features/team-management/PlayerCard";
import {
  getPublicDashboardFilters,
  getPublicMatches,
  getPublicPlayers,
  getPublicTeamStatistics,
  type PublicCompetition,
  type PublicDashboardQuery,
  type PublicMatch,
  type PublicMatchStatus,
  type PublicPlayer,
  type PublicSeason,
  type PublicStanding,
  type PublicTeam,
} from "@/services/public-dashboard";

const selectClassName =
  "h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50";

export default function PublicDashboard() {
  const [teamId, setTeamId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [matchStatus, setMatchStatus] = useState<PublicMatchStatus | "">("");

  const filtersQuery = useQuery({
    queryKey: ["public-dashboard", "filters"],
    queryFn: getPublicDashboardFilters,
  });
  const filters: PublicDashboardQuery = {
    teamId: teamId || undefined,
    seasonId: seasonId || undefined,
    competitionId: competitionId || undefined,
  };
  const matchesQuery = useQuery({
    queryKey: ["public-dashboard", "matches", filters, matchStatus],
    queryFn: () =>
      getPublicMatches({ ...filters, status: matchStatus || undefined }),
  });
  const playersQuery = useQuery({
    queryKey: ["public-dashboard", "players", filters],
    queryFn: () => getPublicPlayers(filters),
  });
  const statisticsQuery = useQuery({
    queryKey: ["public-dashboard", "team-statistics", filters],
    queryFn: () => getPublicTeamStatistics(filters),
  });

  const availableSeasons = useMemo(
    () =>
      (filtersQuery.data?.seasons ?? []).filter(
        (season) => !teamId || season.teamId === teamId,
      ),
    [filtersQuery.data?.seasons, teamId],
  );
  const availableCompetitions = useMemo(
    () =>
      (filtersQuery.data?.competitions ?? []).filter(
        (competition) =>
          (!teamId || competition.teamId === teamId) &&
          (!seasonId || competition.seasonId === seasonId),
      ),
    [filtersQuery.data?.competitions, seasonId, teamId],
  );

  function changeTeam(value: string) {
    setTeamId(value);
    setSeasonId("");
    setCompetitionId("");
  }

  function changeSeason(value: string) {
    setSeasonId(value);
    setCompetitionId("");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1">
        <section className="border-b border-border bg-muted/20">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3.5 py-1 text-xs font-semibold tracking-wide text-brand">
              <BarChart3 className="size-3.5" aria-hidden="true" />
              Public information portal
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Public Dashboard
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Follow matches, players, and team performance from {brand.name}{" "}
              without signing in.
            </p>
            <DashboardFilters
              teams={filtersQuery.data?.teams ?? []}
              seasons={availableSeasons}
              competitions={availableCompetitions}
              teamId={teamId}
              seasonId={seasonId}
              competitionId={competitionId}
              status={matchStatus}
              loading={filtersQuery.isLoading}
              onTeamChange={changeTeam}
              onSeasonChange={changeSeason}
              onCompetitionChange={setCompetitionId}
              onStatusChange={setMatchStatus}
            />
          </div>
        </section>

        <div className="mx-auto flex max-w-7xl flex-col gap-14 px-4 py-12 sm:px-6 lg:px-8">
          <DashboardSection
            id="matches"
            title="Match Events"
            description="Recent and upcoming fixtures from every Gaffer team."
            icon={<CalendarDays className="size-5" />}
          >
            <SectionState
              loading={matchesQuery.isLoading}
              error={matchesQuery.isError}
              empty={matchesQuery.data?.length === 0}
              emptyMessage="No match events are available for these filters."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {matchesQuery.data?.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </SectionState>
          </DashboardSection>

          <DashboardSection
            id="players"
            title="Players"
            description="Active players grouped by team, with statistics from completed matches."
            icon={<Users className="size-5" />}
          >
            <SectionState
              loading={playersQuery.isLoading}
              error={playersQuery.isError}
              empty={playersQuery.data?.length === 0}
              emptyMessage="No players are available for these filters."
            >
              <PlayerGroups players={playersQuery.data ?? []} />
            </SectionState>
          </DashboardSection>

          <DashboardSection
            id="team-statistics"
            title="Team Statistics"
            description="Competition tables filtered by team and season."
            icon={<Trophy className="size-5" />}
          >
            {statisticsQuery.isError ? (
              <ErrorState />
            ) : (
              <StandingsDisplay
                competitions={toStandingsCompetitions(
                  statisticsQuery.data ?? [],
                )}
                isLoading={statisticsQuery.isLoading}
                emptyMessage="No team statistics are available for these filters."
              />
            )}
          </DashboardSection>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function DashboardFilters({
  teams,
  seasons,
  competitions,
  teamId,
  seasonId,
  competitionId,
  status,
  loading,
  onTeamChange,
  onSeasonChange,
  onCompetitionChange,
  onStatusChange,
}: {
  teams: PublicTeam[];
  seasons: PublicSeason[];
  competitions: PublicCompetition[];
  teamId: string;
  seasonId: string;
  competitionId: string;
  status: PublicMatchStatus | "";
  loading: boolean;
  onTeamChange: (value: string) => void;
  onSeasonChange: (value: string) => void;
  onCompetitionChange: (value: string) => void;
  onStatusChange: (value: PublicMatchStatus | "") => void;
}) {
  return (
    <div className="mt-8 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      <Filter label="Team">
        <select
          className={selectClassName}
          value={teamId}
          disabled={loading}
          onChange={(event) => onTeamChange(event.target.value)}
        >
          <option value="">All Teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </Filter>
      <Filter label="Season">
        <select
          className={selectClassName}
          value={seasonId}
          disabled={loading}
          onChange={(event) => onSeasonChange(event.target.value)}
        >
          <option value="">All Seasons</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
              {season.isCurrent ? " (current)" : ""}
            </option>
          ))}
        </select>
      </Filter>
      <Filter label="Competition">
        <select
          className={selectClassName}
          value={competitionId}
          disabled={loading}
          onChange={(event) => onCompetitionChange(event.target.value)}
        >
          <option value="">All Competitions</option>
          {competitions.map((competition) => (
            <option key={competition.id} value={competition.id}>
              {competition.name}
            </option>
          ))}
        </select>
      </Filter>
      <Filter label="Match status">
        <select
          className={selectClassName}
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as PublicMatchStatus | "")
          }
        >
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </Filter>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function DashboardSection({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          {icon}
        </span>
        <div>
          <h2
            id={`${id}-heading`}
            className="text-2xl font-bold tracking-tight"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SectionState({
  loading,
  error,
  empty,
  emptyMessage,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  emptyMessage: string;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-14 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading…
      </div>
    );
  if (error) return <ErrorState />;
  if (empty)
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  return children;
}

function ErrorState() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-sm text-destructive">
      <AlertCircle className="size-4" aria-hidden="true" />
      This section could not be loaded. Please try again.
    </div>
  );
}

function MatchCard({ match }: { match: PublicMatch }) {
  const home = match.isHome ? match.team.name : match.opponentName;
  const away = match.isHome ? match.opponentName : match.team.name;
  const homeScore = match.isHome ? match.teamScore : match.opponentScore;
  const awayScore = match.isHome ? match.opponentScore : match.teamScore;
  const date = new Date(match.scheduledAt);
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {match.competition?.name ?? "Match"}
        </span>
        <span className="text-xs font-semibold capitalize text-brand">
          {match.status}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <p className="text-sm font-bold">{home}</p>
        <p className="rounded-lg bg-muted px-3 py-2 text-xl font-black tabular-nums">
          {homeScore}–{awayScore}
        </p>
        <p className="text-sm font-bold">{away}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5" />
          {date.toLocaleDateString(undefined, { dateStyle: "medium" })} ·{" "}
          {date.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" />
          {match.location}
        </span>
      </div>
    </article>
  );
}

function PlayerGroups({ players }: { players: PublicPlayer[] }) {
  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      { team: PublicTeam; players: PublicPlayer[] }
    >();
    for (const player of players) {
      const group = grouped.get(player.team.id) ?? {
        team: player.team,
        players: [],
      };
      group.players.push(player);
      grouped.set(player.team.id, group);
    }
    return Array.from(grouped.values());
  }, [players]);
  return (
    <div className="flex flex-col gap-10">
      {groups.map(({ team, players: teamPlayers }) => (
        <section key={team.id} aria-labelledby={`team-${team.id}`}>
          <div className="mb-4 flex items-center gap-3">
            <h3 id={`team-${team.id}`} className="text-lg font-bold">
              {team.name}
            </h3>
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">
              {teamPlayers.length} players
            </span>
          </div>
          <div className="grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {teamPlayers.map((player) => (
              <PlayerCard
                key={player.id}
                initials={`${player.firstName[0] ?? ""}${player.lastName[0] ?? ""}`}
                name={`${player.firstName} ${player.lastName}`}
                position={player.position ?? "UN"}
                squadNumber={player.squadNumber}
                appearances={player.statistics.appearances}
                minutesPlayed={player.statistics.minutesPlayed}
                goals={player.statistics.goals}
                assists={player.statistics.assists}
                yellowCards={player.statistics.yellowCards}
                redCards={player.statistics.redCards}
                variant="sub"
                readOnly
                publicView
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function toStandingsCompetitions(
  rows: PublicStanding[],
): ReadOnlyCompetition[] {
  const grouped = new Map<string, ReadOnlyCompetition>();
  for (const row of rows) {
    let competition = grouped.get(row.competition.id);
    if (!competition) {
      competition = {
        id: row.competition.id,
        name: row.competition.name,
        type: row.competition.type,
        season: row.season?.name ?? null,
        standings: [],
      };
      grouped.set(row.competition.id, competition);
    }
    competition.standings.push({
      id: row.id,
      teamName: row.teamName,
      position: row.position,
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      points: row.points,
      isOwnTeam: row.isOwnTeam,
    });
  }
  return Array.from(grouped.values());
}

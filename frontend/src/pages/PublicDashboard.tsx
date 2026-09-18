import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Award,
  BarChart3,
  CalendarDays,
  Clock3,
  Filter as FilterIcon,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";
import { DepthCarousel } from "@/components/ui/DepthCarousel";
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
  "h-10 w-full min-w-0 rounded-xl border border-input bg-background/80 px-3 text-sm text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-50";

type PositionCategory = "ALL" | "FWD" | "MID" | "DEF" | "GK";

export default function PublicDashboard() {
  const [teamId, setTeamId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [matchStatus, setMatchStatus] = useState<PublicMatchStatus | "">("");
  const [positionFilter, setPositionFilter] = useState<PositionCategory>("ALL");

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

  const activeFilterCount =
    (teamId ? 1 : 0) +
    (seasonId ? 1 : 0) +
    (competitionId ? 1 : 0) +
    (matchStatus ? 1 : 0);

  function resetFilters() {
    setTeamId("");
    setSeasonId("");
    setCompetitionId("");
    setMatchStatus("");
    setPositionFilter("ALL");
  }

  function changeTeam(value: string) {
    setTeamId(value);
    setSeasonId("");
    setCompetitionId("");
  }

  function changeSeason(value: string) {
    setSeasonId(value);
    setCompetitionId("");
  }

  // Separate matches into upcoming and completed
  const { upcomingMatches, completedMatches } = useMemo(() => {
    const all = matchesQuery.data ?? [];
    const upcoming: PublicMatch[] = [];
    const completed: PublicMatch[] = [];
    for (const match of all) {
      if (match.status === "completed") {
        completed.push(match);
      } else {
        upcoming.push(match);
      }
    }
    return { upcomingMatches: upcoming, completedMatches: completed };
  }, [matchesQuery.data]);

  // Filter players by position pill
  const filteredPlayers = useMemo(() => {
    const players = playersQuery.data ?? [];
    if (positionFilter === "ALL") return players;
    return players.filter((player) => {
      const pos = (player.position ?? "").toUpperCase();
      if (positionFilter === "FWD")
        return pos.includes("FW") || pos.includes("ST") || pos.includes("ATT") || pos.includes("FORWARD");
      if (positionFilter === "MID")
        return pos.includes("MID") || pos.includes("CAM") || pos.includes("CDM") || pos.includes("CM");
      if (positionFilter === "DEF")
        return pos.includes("DEF") || pos.includes("CB") || pos.includes("LB") || pos.includes("RB");
      if (positionFilter === "GK")
        return pos.includes("GK") || pos.includes("KEEP") || pos.includes("GOAL");
      return true;
    });
  }, [playersQuery.data, positionFilter]);

  // Calculate team telemetry metrics from standings data
  const teamMetrics = useMemo(() => {
    const standings = statisticsQuery.data ?? [];
    if (standings.length === 0) {
      return { winRate: "0%", totalGoals: 0, cleanSheets: 0, ppm: "0.00" };
    }
    let totalPlayed = 0;
    let totalWon = 0;
    let totalGoals = 0;
    let totalPoints = 0;

    for (const s of standings) {
      totalPlayed += s.played;
      totalWon += s.won;
      totalGoals += s.goalsFor;
      totalPoints += s.points;
    }

    const winRateVal = totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0;
    const ppmVal = totalPlayed > 0 ? (totalPoints / totalPlayed).toFixed(2) : "0.00";

    // Estimate clean sheets from completed matches where opponent scored 0
    const cleanSheetsCount = (matchesQuery.data ?? []).filter(
      (m) => m.status === "completed" && m.opponentScore === 0,
    ).length;

    return {
      winRate: `${winRateVal}%`,
      totalGoals,
      cleanSheets: cleanSheetsCount,
      ppm: ppmVal,
    };
  }, [statisticsQuery.data, matchesQuery.data]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand/20 selection:text-brand">
      <Navbar />

      <main className="flex-1 pb-20">
        {/* ─── Modern Hero Header ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand/5 via-background to-background py-12 sm:py-16">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--brand)_0%,transparent_50%)] opacity-10"
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                  Gaffer Match Center
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Follow live match fixtures, player roster statistics, and league standings across all {brand.name} teams.
                </p>
              </div>

            </div>

            {/* ─── Floating Sticky Filter Bar ───────────────────────────────── */}
            <div className="mt-10 rounded-2xl border border-border/80 bg-card/95 p-4 shadow-lg backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <FilterIcon className="size-4 text-brand" />
                  <span>Filter Portal Data</span>
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold text-brand-foreground">
                      {activeFilterCount} Active
                    </span>
                  )}
                </div>

                {activeFilterCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark transition-colors cursor-pointer"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset Filters
                  </button>
                )}
              </div>

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
          </div>
        </section>

        {/* ─── Main Content Layout ────────────────────────────────────────── */}
        <div className="mx-auto flex max-w-7xl flex-col gap-16 px-4 pt-12 sm:px-6 lg:px-8">
          
          {/* SECTION 1: Player Showcase Carousel */}
          <DashboardSection
            id="players"
            title="Squad Showcase"
            description="Active players across teams, featuring career telemetry and match statistics."
            icon={<Users className="size-5" />}
          >
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
              {/* Position Filter Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-2 text-xs font-semibold text-muted-foreground">Position:</span>
                {(["ALL", "FWD", "MID", "DEF", "GK"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setPositionFilter(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      positionFilter === cat
                        ? "bg-brand text-brand-foreground shadow-sm"
                        : "bg-muted/70 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {cat === "ALL" ? "All Positions" : cat}
                  </button>
                ))}
              </div>

              <div className="text-xs font-medium text-muted-foreground">
                Showing <strong className="text-foreground">{filteredPlayers.length}</strong> players
              </div>
            </div>

            <SectionState
              loading={playersQuery.isLoading}
              error={playersQuery.isError}
              empty={filteredPlayers.length === 0}
              emptyMessage="No players found matching the selected filters."
            >
              <PlayerCarousel players={filteredPlayers} />
            </SectionState>
          </DashboardSection>

          {/* SECTION 2: Match Center (Split Status Grid) */}
          <DashboardSection
            id="matches"
            title="Match Center"
            description="Upcoming fixtures paired alongside recent match results."
            icon={<CalendarDays className="size-5" />}
          >
            <SectionState
              loading={matchesQuery.isLoading}
              error={matchesQuery.isError}
              empty={(matchesQuery.data?.length ?? 0) === 0}
              emptyMessage="No match events found for these filters."
            >
              <div className="grid gap-8 lg:grid-cols-2">
                {/* Left Column: Scheduled / Upcoming Fixtures */}
                <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/60 p-5 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <Clock3 className="size-4" />
                      </span>
                      Upcoming Fixtures
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                      {upcomingMatches.length} Scheduled
                    </span>
                  </div>

                  {upcomingMatches.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      No upcoming fixtures currently scheduled.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {upcomingMatches.map((match) => (
                        <MatchCard key={match.id} match={match} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Completed Match Results */}
                <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/60 p-5 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <Trophy className="size-4" />
                      </span>
                      Match Results
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                      {completedMatches.length} Completed
                    </span>
                  </div>

                  {completedMatches.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      No completed match results found.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {completedMatches.map((match) => (
                        <MatchCard key={match.id} match={match} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SectionState>
          </DashboardSection>

          {/* SECTION 3: League Standings & Performance Analytics */}
          <DashboardSection
            id="team-statistics"
            title="League Standings & Performance Telemetry"
            description="Official competition rankings alongside high-level season metrics."
            icon={<Trophy className="size-5" />}
          >
            {statisticsQuery.isError ? (
              <ErrorState />
            ) : (
              <div className="grid gap-8 lg:grid-cols-12 items-start">
                {/* Left (65%): Standings Table */}
                <div className="lg:col-span-8 rounded-2xl border border-border/80 bg-card/80 p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">Competition Table</h3>
                    <span className="text-xs text-muted-foreground">Live Season Rankings</span>
                  </div>
                  <StandingsDisplay
                    competitions={toStandingsCompetitions(
                      statisticsQuery.data ?? [],
                    )}
                    isLoading={statisticsQuery.isLoading}
                    emptyMessage="No team statistics are available for these filters."
                  />
                </div>

                {/* Right (35%): Performance Telemetry Cards */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                  <div className="rounded-2xl border border-border/80 bg-card/80 p-5 shadow-sm">
                    <h3 className="mb-4 text-base font-bold text-foreground flex items-center gap-2">
                      <BarChart3 className="size-4 text-brand" />
                      Season Overview
                    </h3>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-2">
                      <MetricCard
                        icon={<Award className="size-4 text-brand" />}
                        label="Win Rate"
                        value={teamMetrics.winRate}
                        subtext="Season Victory %"
                      />
                      <MetricCard
                        icon={<Target className="size-4 text-brand" />}
                        label="Goals Scored"
                        value={teamMetrics.totalGoals}
                        subtext="Total Fixture Goals"
                      />
                      <MetricCard
                        icon={<ShieldCheck className="size-4 text-brand" />}
                        label="Clean Sheets"
                        value={teamMetrics.cleanSheets}
                        subtext="Zero Conceded"
                      />
                      <MetricCard
                        icon={<Trophy className="size-4 text-brand" />}
                        label="Avg Points"
                        value={teamMetrics.ppm}
                        subtext="Points Per Match"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-xs text-muted-foreground">
                    <strong className="block font-bold text-brand">Portal Data Notice:</strong>
                    Statistics update automatically following completed match report validation by team head coaches.
                  </div>
                </div>
              </div>
            )}
          </DashboardSection>

        </div>
      </main>

      <Footer />
    </div>
  );
}

{/* ─── Component: Interactive Player Carousel ───────────────────────────── */}
function PlayerCarousel({ players }: { players: PublicPlayer[] }) {
  return (
    <div className="mt-4">
      <DepthCarousel
        items={players.map((player) => ({
          id: player.id,
          label: `${player.firstName} ${player.lastName}`,
          content: (
            <PlayerCard
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
          ),
        }))}
        depth={110}
        spread={115}
        tilt={22}
        perspective={1600}
        visibleCards={5}
        falloff={0.2}
        blur={1}
        autoplay
      />
    </div>
  );
}

{/* ─── Component: Telemetry Metric Card ─────────────────────────────────── */}
function MetricCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  subtext: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-all hover:border-brand/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground/80">{subtext}</div>
    </div>
  );
}

{/* ─── Component: Dashboard Filters ─────────────────────────────────────── */}
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <FilterField label="Select Team">
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
      </FilterField>
      <FilterField label="Select Season">
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
      </FilterField>
      <FilterField label="Select Competition">
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
      </FilterField>
      <FilterField label="Match Status">
        <select
          className={selectClassName}
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as PublicMatchStatus | "")
          }
        >
          <option value="">All Match Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </FilterField>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
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
      <div className="mb-6 flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand shadow-sm">
          {icon}
        </span>
        <div>
          <h2
            id={`${id}-heading`}
            className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
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
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-card/80 py-16 text-sm font-semibold text-muted-foreground shadow-sm">
        <span className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        Fetching telemetry data…
      </div>
    );
  if (error) return <ErrorState />;
  if (empty)
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-6 py-14 text-center text-sm font-medium text-muted-foreground">
        {emptyMessage}
      </div>
    );
  return children;
}

function ErrorState() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-sm font-semibold text-destructive">
      <AlertCircle className="size-5" aria-hidden="true" />
      This section could not be loaded. Please check your network connection.
    </div>
  );
}

function MatchCard({ match }: { match: PublicMatch }) {
  const home = match.isHome ? match.team.name : match.opponentName;
  const away = match.isHome ? match.opponentName : match.team.name;
  const homeScore = match.isHome ? match.teamScore : match.opponentScore;
  const awayScore = match.isHome ? match.opponentScore : match.teamScore;
  const date = new Date(match.scheduledAt);
  const isCompleted = match.status === "completed";

  return (
    <article className="group rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:border-brand/40 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-muted/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {match.competition?.name ?? "Fixture"}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${
            isCompleted
              ? "bg-brand/10 text-brand"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          {match.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <p className="text-sm font-bold text-foreground truncate">{home}</p>
        <div className="flex items-center justify-center">
          {isCompleted ? (
            <p className="rounded-xl bg-muted/80 px-3.5 py-1.5 text-xl font-black tabular-nums tracking-tight text-foreground group-hover:bg-brand/10 group-hover:text-brand transition-colors">
              {homeScore} – {awayScore}
            </p>
          ) : (
            <span className="rounded-xl border border-border bg-muted/40 px-3 py-1 text-xs font-bold text-muted-foreground">
              VS
            </span>
          )}
        </div>
        <p className="text-sm font-bold text-foreground truncate">{away}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5 text-brand" />
          {date.toLocaleDateString(undefined, { dateStyle: "medium" })} ·{" "}
          {date.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {match.location && (
          <span className="inline-flex items-center gap-1.5 truncate">
            <MapPin className="size-3.5 text-muted-foreground" />
            {match.location}
          </span>
        )}
      </div>
    </article>
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

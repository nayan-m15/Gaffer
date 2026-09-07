import { useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
  Trash2,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { CompetitionFormDialog } from "@/features/statistics/CompetitionFormDialog";
import { DeleteConfirmDialog } from "@/features/statistics/DeleteConfirmDialog";
import { StandingFormDialog } from "@/features/statistics/StandingFormDialog";
import {
  useAthleteStatistics,
  useCompetitions,
  useCreateCompetition,
  useCreateStanding,
  useDeleteCompetition,
  useDeleteStanding,
  useStatistics,
  useUpdateCompetition,
  useUpdateStanding,
} from "@/features/statistics/hooks";
import type {
  AthleteMatchBreakdown,
  CompetitionFormValues,
  CompetitionWithStandings,
  PlayerStatLine,
  StandingFormValues,
  TeamOverview,
  TrendEntry,
} from "@/features/statistics/types";
import { ApiError } from "@/lib/api";
import {
  toCompetitionFormValues,
  toStandingFormValues,
} from "@/services/statistics";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
 *  FORMATTING HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatAvg(value: number): string {
  return value.toFixed(1);
}

function formatDiff(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * StatisticsPage — team-wide season analytics, player breakdowns, and
 * manually-managed competition standings (S1-06).
 *
 * Read-only match statistics come from GET /statistics (optionally scoped
 * to a single competition). Standings are CRUD-managed by the coach since
 * the app doesn't track other teams' results.
 */
export default function StatisticsPage() {
  const [competitionId, setCompetitionId] = useState<string | undefined>();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(
    null,
  );

  // Dialog state
  const [compForm, setCompForm] = useState<{
    open: boolean;
    editing: CompetitionWithStandings | null;
  }>({ open: false, editing: null });

  const [standingForm, setStandingForm] = useState<{
    open: boolean;
    competition: CompetitionWithStandings | null;
    standingId: string | null;
  }>({ open: false, competition: null, standingId: null });

  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "competition" | "standing";
    id: string;
    name: string;
  } | null>(null);

  const overviewQuery = useStatistics(competitionId);
  const competitionsQuery = useCompetitions();
  const athleteQuery = useAthleteStatistics(selectedAthleteId);

  // Mutations
  const createCompMut = useCreateCompetition();
  const updateCompMut = useUpdateCompetition();
  const deleteCompMut = useDeleteCompetition();
  const createStandMut = useCreateStanding();
  const updateStandMut = useUpdateStanding();
  const deleteStandMut = useDeleteStanding();

  const overview = overviewQuery.data;
  const competitions = competitionsQuery.data ?? [];

  const subtitle = overview
    ? `${overview.matchesPlayed} matches — ${overview.wins}W / ${overview.draws}D / ${overview.losses}L — ${overview.goalsFor} GF / ${overview.goalsAgainst} GA`
    : "Team performance, player statistics, and standings.";

  /* ── Competition form handlers ────────────────────────────────────────── */
  const openAddCompetition = () =>
    setCompForm({ open: true, editing: null });
  const openEditCompetition = (c: CompetitionWithStandings) =>
    setCompForm({ open: true, editing: c });
  const closeCompForm = () => {
    setCompForm({ open: false, editing: null });
    createCompMut.reset();
    updateCompMut.reset();
  };
  const handleCompSubmit = (values: CompetitionFormValues) => {
    const input = {
      name: values.name,
      type: values.type,
      season: values.season || undefined,
    };
    if (compForm.editing) {
      updateCompMut.mutate({ id: compForm.editing.id, input });
    } else {
      createCompMut.mutate(input);
    }
    closeCompForm();
  };

  /* ── Standing form handlers ───────────────────────────────────────────── */
  const openAddStanding = (c: CompetitionWithStandings) =>
    setStandingForm({ open: true, competition: c, standingId: null });
  const openEditStanding = (
    c: CompetitionWithStandings,
    standingId: string,
  ) => setStandingForm({ open: true, competition: c, standingId });
  const closeStandingForm = () => {
    setStandingForm({ open: false, competition: null, standingId: null });
    createStandMut.reset();
    updateStandMut.reset();
  };
  const handleStandingSubmit = (values: StandingFormValues) => {
    if (!standingForm.competition) return;
    if (standingForm.standingId) {
      updateStandMut.mutate({
        id: standingForm.standingId,
        input: values,
      });
    } else {
      createStandMut.mutate({
        competitionId: standingForm.competition.id,
        input: values,
      });
    }
    closeStandingForm();
  };

  /* ── Delete handlers ──────────────────────────────────────────────────── */
  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "competition") {
      deleteCompMut.mutate(deleteTarget.id);
    } else {
      deleteStandMut.mutate(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <PageHeader
        title="Statistics"
        subtitle={subtitle}
        actions={
          <CompetitionFilter
            competitions={competitions}
            value={competitionId}
            onChange={setCompetitionId}
          />
        }
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* ── Statistics overview ──────────────────────────────────────────── */}
        {overviewQuery.isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading statistics…
          </div>
        )}

        {overviewQuery.isError && (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-destructive">
              {overviewQuery.error instanceof ApiError
                ? overviewQuery.error.message
                : "Could not load statistics."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void overviewQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        )}

        {overview && overview.matchesPlayed === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <BarChart3 className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">
              No matches recorded yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Match statistics will appear here once results are logged.
            </p>
            <Button
              className="mt-6 font-semibold tracking-wide"
              onClick={openAddCompetition}
            >
              <Plus className="size-4" />
              Add Competition
            </Button>
          </div>
        )}

        {overview && overview.matchesPlayed > 0 && (
          <>
            {/* Headline stat cards */}
            <StatCardsGrid overview={overview} />

            {/* Trends charts */}
            <TrendsSection trends={overview.trends} />

            {/* Player stats + detail panel */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
              <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6 lg:col-span-2">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-foreground">
                  Player Statistics
                </h2>
                <PlayerStatsTable
                  players={overview.players}
                  selectedId={selectedAthleteId}
                  onSelect={setSelectedAthleteId}
                />
              </section>

              <section
                className={cn(
                  "min-h-[400px] lg:col-span-1",
                  !selectedAthleteId && "hidden lg:flex",
                )}
              >
                <AthleteStatsPanel
                  athleteId={selectedAthleteId}
                  query={athleteQuery}
                />
              </section>
            </div>
          </>
        )}

        {/* ── Competitions & standings ─────────────────────────────────────── */}
        <StandingsSection
          competitions={competitions}
          isLoading={competitionsQuery.isLoading}
          onAddCompetition={openAddCompetition}
          onEditCompetition={openEditCompetition}
          onDeleteCompetition={(c) =>
            setDeleteTarget({
              kind: "competition",
              id: c.id,
              name: c.name,
            })
          }
          onAddStanding={openAddStanding}
          onEditStanding={openEditStanding}
          onDeleteStanding={(_, s) =>
            setDeleteTarget({
              kind: "standing",
              id: s.id,
              name: s.teamName,
            })
          }
        />
      </div>

      {/* Dialogs */}
      <CompetitionFormDialog
        isOpen={compForm.open}
        onClose={closeCompForm}
        initialValues={
          compForm.editing
            ? toCompetitionFormValues(compForm.editing)
            : null
        }
        onSubmit={handleCompSubmit}
      />

      <StandingFormDialog
        isOpen={standingForm.open}
        onClose={closeStandingForm}
        initialValues={
          standingForm.competition && standingForm.standingId
            ? toStandingFormValues(
                standingForm.competition,
                standingForm.standingId,
              )
            : null
        }
        onSubmit={handleStandingSubmit}
      />

      <DeleteConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title={
          deleteTarget?.kind === "competition"
            ? "Delete Competition"
            : "Delete Standing"
        }
        message={
          deleteTarget?.kind === "competition"
            ? "Are you sure you want to delete the competition"
            : "Are you sure you want to delete the standing for"
        }
        itemName={deleteTarget?.name ?? ""}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  COMPETITION FILTER
 * ═══════════════════════════════════════════════════════════════════════════ */

function CompetitionFilter({
  competitions,
  value,
  onChange,
}: {
  competitions: CompetitionWithStandings[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  if (competitions.length === 0) return null;

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
    >
      <option value="">All Competitions</option>
      {competitions.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.season ? ` — ${c.season}` : ""}
        </option>
      ))}
    </select>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  STAT CARDS GRID
 * ═══════════════════════════════════════════════════════════════════════════ */

function StatCardsGrid({ overview }: { overview: TeamOverview }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      <StatCard label="Matches Played" value={overview.matchesPlayed} />
      <StatCard label="Wins" value={overview.wins} variant="positive" />
      <StatCard label="Draws" value={overview.draws} />
      <StatCard label="Losses" value={overview.losses} variant="negative" />
      <StatCard label="Win Rate" value={formatRate(overview.winRate)} />
      <StatCard label="Points" value={overview.points} variant="positive" />
      <StatCard label="Goals For" value={overview.goalsFor} />
      <StatCard
        label="Goals Against"
        value={overview.goalsAgainst}
        variant="negative"
      />
      <StatCard
        label="Goal Diff"
        value={formatDiff(overview.goalDifference)}
        variant={overview.goalDifference >= 0 ? "positive" : "negative"}
      />
      <StatCard label="Clean Sheets" value={overview.cleanSheets} />
      <StatCard label="Avg GF" value={formatAvg(overview.avgGoalsFor)} />
      <StatCard
        label="Avg GA"
        value={formatAvg(overview.avgGoalsAgainst)}
        variant="negative"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  variant = "neutral",
}: {
  label: string;
  value: string | number;
  variant?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          variant === "positive" && "text-primary",
          variant === "negative" && "text-destructive",
          variant === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  TRENDS SECTION
 * ═══════════════════════════════════════════════════════════════════════════ */

function TrendsSection({ trends }: { trends: TrendEntry[] }) {
  if (trends.length === 0) return null;

  const maxGoals = Math.max(
    1,
    ...trends.map((t) => Math.max(t.goalsFor, t.goalsAgainst)),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Recent form */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Recent Form
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {trends.slice(-8).map((t, i) => (
            <ResultBadge key={i} result={t.result} />
          ))}
        </div>
      </div>

      {/* Goals per match */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Target className="size-4 text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Goals Per Match
          </h2>
        </div>
        <div className="flex h-28 items-end gap-1">
          {trends.map((t, i) => (
            <div
              key={i}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <div
                  className="w-1/2 rounded-t bg-primary transition-all"
                  style={{
                    height: `${(t.goalsFor / maxGoals) * 100}%`,
                  }}
                  title={`GF: ${t.goalsFor}`}
                />
                <div
                  className="w-1/2 rounded-t bg-destructive/50 transition-all"
                  style={{
                    height: `${(t.goalsAgainst / maxGoals) * 100}%`,
                  }}
                  title={`GA: ${t.goalsAgainst}`}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-primary" />
            For
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-destructive/50" />
            Against
          </span>
        </div>
      </div>

      {/* Points per match */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="size-4 text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Points Per Match
          </h2>
        </div>
        <div className="flex h-28 items-end gap-1">
          {trends.map((t, i) => (
            <div
              key={i}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <div className="flex h-full w-full items-end justify-center">
                <div
                  className={cn(
                    "w-2/3 rounded-t transition-all",
                    t.points === 3 && "bg-primary",
                    t.points === 1 && "bg-muted-foreground/50",
                    t.points === 0 && "bg-destructive/40",
                  )}
                  style={{
                    height: `${(t.points / 3) * 100}%`,
                  }}
                  title={`${t.points} pts`}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultBadge({ result }: { result: "W" | "D" | "L" }) {
  const config = {
    W: { className: "bg-primary text-primary-foreground", label: "Win" },
    D: { className: "bg-muted text-foreground", label: "Draw" },
    L: { className: "bg-destructive text-primary-foreground", label: "Loss" },
  } as const;

  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full text-xs font-bold",
        config[result].className,
      )}
      title={config[result].label}
    >
      {result}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  PLAYER STATISTICS TABLE
 * ═══════════════════════════════════════════════════════════════════════════ */

const PLAYER_COLUMNS = [
  { key: "name", label: "PLAYER", className: "min-w-[120px]" },
  { key: "appearances", label: "APPS", className: "w-14 text-center" },
  { key: "goals", label: "GOALS", className: "w-14 text-center" },
  { key: "assists", label: "AST", className: "w-14 text-center" },
  { key: "yellowCards", label: "YELLOW", className: "w-14 text-center" },
  { key: "redCards", label: "RED", className: "w-14 text-center" },
] as const;

function PlayerStatsTable({
  players,
  selectedId,
  onSelect,
}: {
  players: PlayerStatLine[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (players.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No player statistics recorded yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {PLAYER_COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn("py-3 px-4", col.className)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const isSelected = player.athleteId === selectedId;
            return (
              <tr
                key={player.athleteId}
                onClick={() => onSelect(player.athleteId)}
                className={cn(
                  "cursor-pointer border-b border-border transition-colors last:border-b-0",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted/30",
                )}
              >
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "font-semibold",
                      isSelected ? "text-primary" : "text-foreground",
                    )}
                  >
                    {player.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-foreground">
                  {player.appearances}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-center tabular-nums font-semibold",
                    player.goals > 0 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {player.goals}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-center tabular-nums font-semibold",
                    player.assists > 0 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {player.assists}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-amber-400">
                  {player.yellowCards}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-red-400">
                  {player.redCards}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  ATHLETE STATS DETAIL PANEL
 * ═══════════════════════════════════════════════════════════════════════════ */

function AthleteStatsPanel({
  athleteId,
  query,
}: {
  athleteId: string | null;
  query: ReturnType<typeof useAthleteStatistics>;
}) {
  if (!athleteId) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Select a player to view statistics.
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-destructive">
        Could not load athlete statistics.
      </div>
    );
  }

  const stats = query.data;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto rounded-2xl border border-border bg-card p-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">{stats.name}</h2>
        <p className="text-sm text-cyan-400">
          {stats.position ?? "—"}
          {stats.squadNumber ? ` · #${stats.squadNumber}` : ""}
        </p>
      </div>

      {/* Season totals */}
      <div className="grid grid-cols-3 gap-3">
        <DetailStat label="APPS" value={stats.appearances} />
        <DetailStat label="STARTS" value={stats.starts} />
        <DetailStat label="GOALS" value={stats.goals} valueClassName="text-primary" />
        <DetailStat label="ASSISTS" value={stats.assists} valueClassName="text-primary" />
        <DetailStat
          label="YELLOW"
          value={stats.yellowCards}
          valueClassName="text-amber-400"
        />
        <DetailStat
          label="RED"
          value={stats.redCards}
          valueClassName="text-red-400"
        />
      </div>

      {/* Match-by-match */}
      <section className="flex-1">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Match-by-Match
        </h3>
        {stats.matches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
            No recorded matches yet for this player.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {stats.matches.map((m) => (
              <div
                key={m.matchId}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    vs. {m.opponent}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{formatDate(m.date)}</span>
                    <StartedTag started={m.started} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ResultBadge result={m.result} />
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {m.teamScore}–{m.opponentScore}
                    </p>
                    <MatchPerformance m={m} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          valueClassName ?? "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** "Started"/"Sub" pill shown beside a match date in the athlete panel. */
function StartedTag({ started }: { started: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        started
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {started ? "Started" : "Sub"}
    </span>
  );
}

/** Small coloured card glyph with its count, e.g. for bookings. */
function CardGlyph({
  count,
  className,
  label,
}: {
  count: number;
  className: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`${count} ${label}${count === 1 ? "" : "s"}`}
    >
      <span className={cn("inline-block size-2 rounded-sm", className)} />
      {count > 1 && <span className="tabular-nums">{count}</span>}
    </span>
  );
}

/**
 * Compact per-match contribution line under the score: minutes played,
 * goals, assists and cards. Zero or unrecorded values are omitted so a
 * quiet match stays visually quiet.
 */
function MatchPerformance({ m }: { m: AthleteMatchBreakdown }) {
  const hasContributions =
    m.minutesPlayed !== null ||
    m.goals > 0 ||
    m.assists > 0 ||
    m.yellowCards > 0 ||
    m.redCards > 0;

  if (!hasContributions) {
    return <p className="text-[11px] text-muted-foreground">—</p>;
  }

  return (
    <p className="flex flex-wrap items-center justify-end gap-x-1.5 text-[11px] text-muted-foreground">
      {m.minutesPlayed !== null && (
        <span className="tabular-nums">{m.minutesPlayed}'</span>
      )}
      {m.goals > 0 && <span className="tabular-nums">{m.goals}G</span>}
      {m.assists > 0 && <span className="tabular-nums">{m.assists}A</span>}
      {m.yellowCards > 0 && (
        <CardGlyph
          count={m.yellowCards}
          className="bg-amber-400"
          label="yellow card"
        />
      )}
      {m.redCards > 0 && (
        <CardGlyph
          count={m.redCards}
          className="bg-red-400"
          label="red card"
        />
      )}
    </p>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  STANDINGS SECTION
 * ═══════════════════════════════════════════════════════════════════════════ */

function StandingsSection({
  competitions,
  isLoading,
  onAddCompetition,
  onEditCompetition,
  onDeleteCompetition,
  onAddStanding,
  onEditStanding,
  onDeleteStanding,
}: {
  competitions: CompetitionWithStandings[];
  isLoading: boolean;
  onAddCompetition: () => void;
  onEditCompetition: (c: CompetitionWithStandings) => void;
  onDeleteCompetition: (c: CompetitionWithStandings) => void;
  onAddStanding: (c: CompetitionWithStandings) => void;
  onEditStanding: (
    c: CompetitionWithStandings,
    standingId: string,
  ) => void;
  onDeleteStanding: (
    c: CompetitionWithStandings,
    standing: { id: string; teamName: string },
  ) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
            Competitions & Standings
          </h2>
        </div>
        <Button size="sm" className="gap-1.5" onClick={onAddCompetition}>
          <Plus className="size-4" />
          Add Competition
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading competitions…
        </div>
      ) : competitions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background px-6 py-12 text-center">
          <Trophy className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No competitions yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a competition to start tracking standings.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {competitions.map((c) => (
            <CompetitionCard
              key={c.id}
              competition={c}
              onEdit={() => onEditCompetition(c)}
              onDelete={() => onDeleteCompetition(c)}
              onAddStanding={() => onAddStanding(c)}
              onEditStanding={(id) => onEditStanding(c, id)}
              onDeleteStanding={(s) => onDeleteStanding(c, s)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CompetitionCard({
  competition,
  onEdit,
  onDelete,
  onAddStanding,
  onEditStanding,
  onDeleteStanding,
}: {
  competition: CompetitionWithStandings;
  onEdit: () => void;
  onDelete: () => void;
  onAddStanding: () => void;
  onEditStanding: (standingId: string) => void;
  onDeleteStanding: (standing: {
    id: string;
    teamName: string;
  }) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const typeLabel =
    competition.type.charAt(0).toUpperCase() + competition.type.slice(1);

  return (
    <div className="rounded-xl border border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <h3 className="truncate text-sm font-bold text-foreground">
            {competition.name}
          </h3>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {typeLabel}
          </span>
          {competition.season && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {competition.season}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onEdit}
            aria-label="Edit competition"
            title="Edit"
          >
            <Pencil className="size-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDelete}
            aria-label="Delete competition"
            title="Delete"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Standings table */}
      {expanded && (
        <div className="border-t border-border">
          <StandingsTable
            standings={competition.standings}
            onAdd={onAddStanding}
            onEdit={onEditStanding}
            onDelete={onDeleteStanding}
          />
        </div>
      )}
    </div>
  );
}

function StandingsTable({
  standings,
  onAdd,
  onEdit,
  onDelete,
}: {
  standings: CompetitionWithStandings["standings"];
  onAdd: () => void;
  onEdit: (standingId: string) => void;
  onDelete: (standing: {
    id: string;
    teamName: string;
  }) => void;
}) {
  const COLUMNS = [
    { key: "pos", label: "POS", className: "w-12 text-center" },
    { key: "team", label: "TEAM", className: "min-w-[100px]" },
    { key: "p", label: "P", className: "w-10 text-center" },
    { key: "w", label: "W", className: "w-10 text-center" },
    { key: "d", label: "D", className: "w-10 text-center" },
    { key: "l", label: "L", className: "w-10 text-center" },
    { key: "gf", label: "GF", className: "w-10 text-center" },
    { key: "ga", label: "GA", className: "w-10 text-center" },
    { key: "pts", label: "PTS", className: "w-10 text-center" },
  ] as const;

  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn("py-2.5 px-3", col.className)}
              >
                {col.label}
              </th>
            ))}
            <th scope="col" className="w-16 px-3 py-2.5 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No standings rows yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={onAdd}
                >
                  <Plus className="size-3.5" />
                  Add Standing
                </Button>
              </td>
            </tr>
          ) : (
            <>
              {standings.map((s) => (
                <tr
                  key={s.id}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    s.isOwnTeam ? "bg-primary/10" : "hover:bg-muted/30",
                  )}
                >
                  <td className="px-3 py-2.5 text-center font-bold tabular-nums text-foreground">
                    {s.position}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "font-semibold",
                        s.isOwnTeam ? "text-primary" : "text-foreground",
                      )}
                    >
                      {s.teamName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                    {s.played}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-foreground">
                    {s.won}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                    {s.drawn}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                    {s.lost}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-foreground">
                    {s.goalsFor}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                    {s.goalsAgainst}
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold tabular-nums text-foreground">
                    {s.points}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                      role="group"
                    >
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onEdit(s.id)}
                        aria-label="Edit standing"
                        title="Edit"
                      >
                        <Pencil className="size-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          onDelete({ id: s.id, teamName: s.teamName })
                        }
                        aria-label="Delete standing"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={COLUMNS.length + 1} className="py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={onAdd}
                  >
                    <Plus className="size-3.5" />
                    Add Standing
                  </Button>
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

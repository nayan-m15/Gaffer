import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { AppCard } from "@/components/app/AppCard";
import { useAuth } from "@/hooks/useAuth";
import { AthleteComparisonSection } from "@/features/statistics/AthleteComparisonSection";
import { AthleteStatsPanel } from "@/features/statistics/AthleteStatsPanel";
import { DeleteConfirmDialog } from "@/features/statistics/DeleteConfirmDialog";
import { PlayerStatsTable } from "@/features/statistics/PlayerStatsTable";
import { RecentFormSection } from "@/features/statistics/RecentFormSection";
import { SeasonFormDialog } from "@/features/statistics/SeasonFormDialog";
import { SeasonsSection } from "@/features/statistics/SeasonsSection";
import { SeasonTrendsSection } from "@/features/statistics/SeasonTrendsSection";
import { StandingFormDialog } from "@/features/statistics/StandingFormDialog";
import { StandingsSection } from "@/features/statistics/StandingsSection";
import { StatCardsGrid } from "@/features/statistics/StatCardsGrid";
import { StatisticsFilters } from "@/features/statistics/StatisticsFilters";
import { useStatisticsFilters } from "@/features/statistics/useStatisticsFilters";
import { formatSeasonRange } from "@/features/statistics/season-trends-model";
import {
  useAthleteStatistics,
  useCompetitions,
  useCreateSeason,
  useCreateStanding,
  useDeleteSeason,
  useDeleteStanding,
  useSeasons,
  useStatistics,
  useUpdateSeason,
  useUpdateStanding,
} from "@/features/statistics/hooks";
import type {
  CompetitionWithStandings,
  Season,
  SeasonFormValues,
  StandingFormValues,
} from "@/features/statistics/types";
import { ApiError } from "@/lib/api";
import { toStandingFormValues } from "@/services/statistics";
import { emptySeasonFormValues, toSeasonFormValues } from "@/services/seasons";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

const DELETE_TITLES = {
  standing: "Delete Standing",
  season: "Delete Season",
} as const;

const DELETE_MESSAGES = {
  standing: "Are you sure you want to delete the standing for",
  season: "Are you sure you want to delete the season",
} as const;

/**
 * StatisticsPage — team-wide season analytics, player breakdowns, and
 * shared competition standings.
 *
 * Competition membership and management live in Leagues & Competitions.
 * Standings remain visible here; only the shared competition admin receives
 * standings mutation controls.
 */
export default function StatisticsPage() {
  const { team } = useAuth();
  const isCoach = team?.role === "coach";

  const {
    filters,
    setSeasonId,
    setCompetitionId,
    setAthleteId,
    toggleCompareId,
    clearCompare,
  } = useStatisticsFilters();
  const { seasonId, competitionId, athleteId, compareIds } = filters;

  // Dialog state
  const [seasonForm, setSeasonForm] = useState<{
    open: boolean;
    editing: Season | null;
  }>({ open: false, editing: null });

  // Stable identity: SeasonFormDialog resets its fields whenever this changes,
  // so a fresh object each render would loop.
  const newSeasonDefaults = useMemo(() => emptySeasonFormValues(), []);

  const [standingForm, setStandingForm] = useState<{
    open: boolean;
    competition: CompetitionWithStandings | null;
    standingId: string | null;
  }>({ open: false, competition: null, standingId: null });

  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "standing" | "season";
    id: string;
    name: string;
    /** Extra warning shown in the confirm dialog, e.g. unlinked competitions. */
    note?: string;
  } | null>(null);

  const seasonsQuery = useSeasons();
  const overviewQuery = useStatistics({ seasonId, competitionId });
  const competitionsQuery = useCompetitions();
  const athleteQuery = useAthleteStatistics(athleteId ?? null);

  // Mutations
  const createStandMut = useCreateStanding();
  const updateStandMut = useUpdateStanding();
  const deleteStandMut = useDeleteStanding();
  const createSeasonMut = useCreateSeason();
  const updateSeasonMut = useUpdateSeason();
  const deleteSeasonMut = useDeleteSeason();

  const overview = overviewQuery.data;
  const competitions = competitionsQuery.data ?? [];
  const seasons = seasonsQuery.data ?? [];

  // Default to the current season once the list arrives. The server returns
  // all-time when unfiltered, so the default lives here rather than in the API
  // — and `replace` keeps it out of the back-button history.
  // Applied once per visit: without the latch, choosing "All Time" would clear
  // the param and immediately snap back to the current season.
  const hasSeasonParam = seasonId !== undefined;
  const currentSeasonId = seasons.find((s) => s.isCurrent)?.id;
  const defaultedSeason = useRef(false);
  useEffect(() => {
    if (defaultedSeason.current) return;
    if (hasSeasonParam) {
      defaultedSeason.current = true;
      return;
    }
    if (!currentSeasonId) return;
    defaultedSeason.current = true;
    setSeasonId(currentSeasonId, true);
  }, [currentSeasonId, hasSeasonParam, setSeasonId]);

  const activeSeason = overview?.season ?? null;
  const scopeLabel = activeSeason
    ? `${activeSeason.name} · ${formatSeasonRange(activeSeason.startDate, activeSeason.endDate)}`
    : "All time";

  const subtitle = overview
    ? `${scopeLabel} — ${overview.matchesPlayed} matches — ${overview.wins}W / ${overview.draws}D / ${overview.losses}L — ${overview.goalsFor} GF / ${overview.goalsAgainst} GA`
    : "Team performance, player statistics, and standings.";

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

  /* ── Season form handlers ─────────────────────────────────────────────── */
  const openAddSeason = () => setSeasonForm({ open: true, editing: null });
  const openEditSeason = (season: Season) =>
    setSeasonForm({ open: true, editing: season });
  const closeSeasonForm = () => {
    setSeasonForm({ open: false, editing: null });
    createSeasonMut.reset();
    updateSeasonMut.reset();
  };
  const handleSeasonSubmit = (values: SeasonFormValues) => {
    const input = {
      name: values.name,
      startDate: values.startDate,
      endDate: values.endDate,
      isCurrent: values.isCurrent,
    };

    if (seasonForm.editing) {
      updateSeasonMut.mutate(
        { id: seasonForm.editing.id, input },
        { onSuccess: closeSeasonForm },
      );
    } else {
      createSeasonMut.mutate(input, {
        // Jump straight to the season that was just created.
        onSuccess: (season) => {
          setSeasonId((season as Season).id);
          closeSeasonForm();
        },
      });
    }
  };

  // Overlap and duplicate-name rejections only exist server-side.
  const seasonFormError =
    createSeasonMut.error instanceof ApiError
      ? createSeasonMut.error.message
      : updateSeasonMut.error instanceof ApiError
        ? updateSeasonMut.error.message
        : undefined;

  /* ── Delete handlers ──────────────────────────────────────────────────── */
  const requestDeleteSeason = (season: Season) => {
    const linked = competitions.filter((c) => c.seasonId === season.id).length;
    setDeleteTarget({
      kind: "season",
      id: season.id,
      name: season.name,
      note:
        linked > 0
          ? `${linked} ${linked === 1 ? "competition" : "competitions"} will be unlinked from this season. The ${linked === 1 ? "competition itself is" : "competitions themselves are"} not deleted.`
          : undefined,
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "season") {
      deleteSeasonMut.mutate(deleteTarget.id);
      // The filter would otherwise point at a season that no longer exists.
      if (seasonId === deleteTarget.id) setSeasonId(undefined);
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
          <StatisticsFilters
            seasons={seasons}
            competitions={competitions}
            seasonId={seasonId}
            competitionId={competitionId}
            onSeasonChange={setSeasonId}
            onCompetitionChange={setCompetitionId}
          />
        }
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-8 sm:px-8 lg:px-10">
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
          </div>
        )}

        {overview && overview.matchesPlayed > 0 && (
          <>
            {/* Headline stat cards */}
            <StatCardsGrid overview={overview} />

            {/* Recent results */}
            <RecentFormSection
              trends={overview.trends}
              teamName={team?.name ?? "Our Team"}
            />

            {/* Season trends: direction of travel rather than totals */}
            <SeasonTrendsSection
              form={overview.form}
              periods={overview.periods}
              rollingWindow={overview.rollingWindow}
            />

            {/* Player stats + detail panel */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
              <AppCard className="p-4 md:p-6 lg:col-span-2">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-foreground">
                  Player Statistics
                </h2>
                <PlayerStatsTable
                  players={overview.players}
                  selectedId={athleteId ?? null}
                  onSelect={setAthleteId}
                  compareIds={compareIds}
                  onToggleCompare={toggleCompareId}
                />
              </AppCard>

              <section
                className={cn(
                  "min-h-[400px] lg:col-span-1",
                  !athleteId && "hidden lg:flex",
                )}
              >
                <AthleteStatsPanel
                  athleteId={athleteId ?? null}
                  query={athleteQuery}
                />
              </section>
            </div>

            {/* Side-by-side player comparison */}
            <AthleteComparisonSection
              athleteIds={compareIds}
              seasonId={seasonId}
              onClear={clearCompare}
            />
          </>
        )}

        {/* ── Seasons (coach-only; assistants still get the filter) ────────── */}
        {isCoach && (
          <SeasonsSection
            seasons={seasons}
            isLoading={seasonsQuery.isLoading}
            activeSeasonId={seasonId}
            onAdd={openAddSeason}
            onEdit={openEditSeason}
            onDelete={requestDeleteSeason}
            onSelect={setSeasonId}
          />
        )}

        {/* ── Competitions & standings ─────────────────────────────────────── */}
        <StandingsSection
          competitions={competitions}
          isLoading={competitionsQuery.isLoading}
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

      <SeasonFormDialog
        isOpen={seasonForm.open}
        onClose={closeSeasonForm}
        initialValues={
          seasonForm.editing
            ? toSeasonFormValues(seasonForm.editing)
            : null
        }
        defaultValues={newSeasonDefaults}
        onSubmit={handleSeasonSubmit}
        errorMessage={seasonFormError}
      />

      <DeleteConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title={DELETE_TITLES[deleteTarget?.kind ?? "standing"]}
        message={DELETE_MESSAGES[deleteTarget?.kind ?? "standing"]}
        itemName={deleteTarget?.name ?? ""}
        note={deleteTarget?.note}
      />
    </>
  );
}

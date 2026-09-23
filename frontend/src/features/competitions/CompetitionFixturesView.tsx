import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Plus,
  Trophy,
} from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import { Button } from "@/components/ui/button";
import type {
  CompetitionFixture,
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

function teamInitial(name: string) {
  if (name === "TBD") return "?";
  return name.trim().match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() ?? "?";
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

function FixtureCard({
  fixture,
  names,
  isAdmin,
  onRecordResult,
  featured = false,
}: {
  fixture: CompetitionFixture;
  names: Map<string, string>;
  isAdmin: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
  featured?: boolean;
}) {
  const home = fixture.homeCompetitionTeamId
    ? (names.get(fixture.homeCompetitionTeamId) ?? "Unknown team")
    : "TBD";
  const away = fixture.awayCompetitionTeamId
    ? (names.get(fixture.awayCompetitionTeamId) ?? "Unknown team")
    : "TBD";
  const completed = fixture.status === "completed";
  const ready = Boolean(
    fixture.homeCompetitionTeamId && fixture.awayCompetitionTeamId,
  );
  const canRecord =
    isAdmin && fixture.status === "scheduled" && ready;

  const status = completed
    ? {
        label: "Final",
        className: "border-primary/25 bg-primary/10 text-primary",
      }
    : fixture.status === "in_progress"
      ? {
          label: "In progress",
          className:
            "border-amber-500/25 bg-amber-500/10 text-amber-500",
        }
      : fixture.status === "cancelled"
        ? {
            label: "Cancelled",
            className:
              "border-destructive/25 bg-destructive/10 text-destructive",
          }
        : ready
          ? {
              label: "Ready",
              className: "border-border bg-muted/30 text-muted-foreground",
            }
          : {
              label: "Awaiting teams",
              className:
                "border-dashed border-border bg-transparent text-muted-foreground",
            };

  const homeWinner =
    completed &&
    fixture.homeCompetitionTeamId != null &&
    fixture.winnerCompetitionTeamId === fixture.homeCompetitionTeamId;
  const awayWinner =
    completed &&
    fixture.awayCompetitionTeamId != null &&
    fixture.winnerCompetitionTeamId === fixture.awayCompetitionTeamId;

  return (
    <div
      className={`group relative min-w-0 overflow-hidden rounded-2xl border bg-background/75 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg ${
        featured
          ? "border-primary/35 bg-primary/[0.035] shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_10%,transparent)]"
          : "border-border/90"
      }`}
    >
      {featured && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {fixtureDateLabel(fixture.scheduledAt)}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-border/80 bg-card/50">
        <TeamRow name={home} score={fixture.homeScore} winner={homeWinner} />
        <div className="h-px bg-border/70" />
        <TeamRow name={away} score={fixture.awayScore} winner={awayWinner} />
      </div>

      {canRecord && (
        <Button
          className="mt-3 w-full"
          size="sm"
          variant={featured ? "default" : "outline"}
          onClick={() => onRecordResult(fixture)}
        >
          <Plus className="size-3.5" />
          Record result
        </Button>
      )}
    </div>
  );
}

function KnockoutBracket({
  fixtures,
  participants,
  isAdmin,
  onRecordResult,
}: {
  fixtures: CompetitionFixture[];
  participants: Participant[];
  isAdmin: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
}) {
  const names = new Map(
    participants.map((participant) => [participant.id, participant.displayName]),
  );
  const maxRound = Math.max(0, ...fixtures.map((fixture) => fixture.round));
  if (!maxRound) return null;

  const rounds = Array.from({ length: maxRound }, (_, index) => {
    const round = index + 1;
    return {
      round,
      label: roundLabel(round, maxRound),
      rows: fixtures
        .filter((fixture) => fixture.round === round)
        .sort((a, b) => a.position - b.position),
    };
  });
  const completedCount = fixtures.filter(
    (fixture) => fixture.status === "completed",
  ).length;
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                Road to the trophy
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every result advances the winner into the next round automatically.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
            <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-muted-foreground">
              {bracketSize}-team bracket
            </span>
            <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-muted-foreground">
              {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
            </span>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">
              {completedCount}/{fixtures.length} complete
            </span>
          </div>
        </div>
      </div>

      <div
        className="hidden items-stretch gap-4 xl:grid"
        style={{
          gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))`,
        }}
      >
        {rounds.map((round, index) => {
          const isFinal = round.round === maxRound;
          return (
            <section
              key={round.round}
              className={`relative flex min-w-0 flex-col rounded-2xl border p-3 ${
                isFinal
                  ? "border-primary/25 bg-primary/[0.035]"
                  : "border-border/80 bg-muted/[0.08]"
              }`}
            >
              {index < rounds.length - 1 && (
                <span className="pointer-events-none absolute -right-3 top-1/2 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
                  <ChevronRight className="size-3.5" />
                </span>
              )}
              <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Round {round.round}
                  </p>
                  <h3
                    className={`mt-0.5 truncate text-sm font-semibold ${
                      isFinal ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {round.label}
                  </h3>
                </div>
                {isFinal ? (
                  <Trophy className="size-4 shrink-0 text-primary" />
                ) : (
                  <span className="shrink-0 rounded-full bg-muted/50 px-2 py-1 text-[9px] font-semibold text-muted-foreground">
                    {round.rows.length}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-around gap-3 pt-3">
                {round.rows.map((fixture) => (
                  <FixtureCard
                    key={fixture.id}
                    fixture={fixture}
                    names={names}
                    isAdmin={isAdmin}
                    onRecordResult={onRecordResult}
                    featured={isFinal}
                  />
                ))}
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
              <section
                className={`rounded-2xl border p-4 ${
                  isFinal
                    ? "border-primary/25 bg-primary/[0.035]"
                    : "border-border/80 bg-muted/[0.08]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Round {round.round}
                    </p>
                    <h3
                      className={`mt-0.5 font-semibold ${
                        isFinal ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {round.label}
                    </h3>
                  </div>
                  {isFinal ? (
                    <Trophy className="size-5 text-primary" />
                  ) : (
                    <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                      {round.rows.length} {round.rows.length === 1 ? "match" : "matches"}
                    </span>
                  )}
                </div>
                <div
                  className={`mt-3 grid gap-3 ${
                    round.rows.length > 1 ? "sm:grid-cols-2" : ""
                  }`}
                >
                  {round.rows.map((fixture) => (
                    <FixtureCard
                      key={fixture.id}
                      fixture={fixture}
                      names={names}
                      isAdmin={isAdmin}
                      onRecordResult={onRecordResult}
                      featured={isFinal}
                    />
                  ))}
                </div>
              </section>
              {index < rounds.length - 1 && (
                <div className="flex h-8 items-center justify-center text-muted-foreground">
                  <ChevronRight className="size-4 rotate-90" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeagueSchedule({
  fixtures,
  participants,
  isAdmin,
  onRecordResult,
}: {
  fixtures: CompetitionFixture[];
  participants: Participant[];
  isAdmin: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
}) {
  const names = new Map(
    participants.map((participant) => [participant.id, participant.displayName]),
  );
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort(
    (a, b) => a - b,
  );
  return (
    <div className="space-y-5">
      {rounds.map((round) => (
        <div key={round}>
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            <h3 className="font-medium">Matchday {round}</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fixtures
              .filter((fixture) => fixture.round === round)
              .map((fixture) => (
                <FixtureCard
                  key={fixture.id}
                  fixture={fixture}
                  names={names}
                  isAdmin={isAdmin}
                  onRecordResult={onRecordResult}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CompetitionFixturesView({
  format,
  fixtures,
  participants,
  isAdmin,
  onRecordResult,
}: {
  format: CompetitionFormat;
  fixtures: CompetitionFixture[];
  participants: Participant[];
  isAdmin: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
}) {
  const leagueFixtures = fixtures.filter(
    (fixture) => fixture.stage === "league",
  );
  const knockoutFixtures = fixtures.filter(
    (fixture) => fixture.stage === "knockout",
  );

  if (!fixtures.length) return null;
  if (format === "knockout") {
    return (
      <AppCard className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <GitBranch className="size-5 text-primary" />
            Knockout bracket
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Winners advance automatically through each round to the trophy.
          </p>
        </div>
        <KnockoutBracket
          fixtures={knockoutFixtures}
          participants={participants}
          isAdmin={isAdmin}
          onRecordResult={onRecordResult}
        />
      </AppCard>
    );
  }

  return (
    <>
      {leagueFixtures.length > 0 && (
        <AppCard className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">League fixtures</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Generated from the configured round-robin and playing-day rules.
            </p>
          </div>
          <LeagueSchedule
            fixtures={leagueFixtures}
            participants={participants}
            isAdmin={isAdmin}
            onRecordResult={onRecordResult}
          />
        </AppCard>
      )}
      {format === "league_knockout" && (
        <AppCard className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <GitBranch className="size-5 text-primary" />
              Knockout stage
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {knockoutFixtures.length
                ? "The highest-ranked qualifiers have been seeded into the knockout path."
                : "The bracket will be created automatically when every league-phase fixture has a result."}
            </p>
          </div>
          {knockoutFixtures.length > 0 && (
            <KnockoutBracket
              fixtures={knockoutFixtures}
              participants={participants}
              isAdmin={isAdmin}
              onRecordResult={onRecordResult}
            />
          )}
        </AppCard>
      )}
    </>
  );
}

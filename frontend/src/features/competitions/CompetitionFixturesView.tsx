import { CalendarClock, CheckCircle2, GitBranch, Plus } from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import { Button } from "@/components/ui/button";
import type { CompetitionFixture, CompetitionFormat, Participant } from "./types";

function roundLabel(round: number, maxRound: number) {
  const teamsAtRound = 2 ** (maxRound - round + 1);
  if (teamsAtRound === 2) return "Final";
  if (teamsAtRound === 4) return "Semi-final";
  if (teamsAtRound === 8) return "Quarter-final";
  return `Round of ${teamsAtRound}`;
}

function FixtureCard({ fixture, names, isAdmin, onRecordResult, compact = false }: {
  fixture: CompetitionFixture;
  names: Map<string, string>;
  isAdmin: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
  compact?: boolean;
}) {
  const home = fixture.homeCompetitionTeamId ? names.get(fixture.homeCompetitionTeamId) ?? "Unknown team" : "TBD";
  const away = fixture.awayCompetitionTeamId ? names.get(fixture.awayCompetitionTeamId) ?? "Unknown team" : "TBD";
  const completed = fixture.status === "completed";
  const canRecord = isAdmin && fixture.status === "scheduled" && fixture.homeCompetitionTeamId && fixture.awayCompetitionTeamId;
  return <div className={`rounded-xl border border-border bg-background/70 ${compact ? "p-3" : "p-4"}`}>
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{new Date(fixture.scheduledAt).toLocaleString()}</span>
      {completed && <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="size-3.5" />Final</span>}
    </div>
    <div className="mt-3 space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3"><span className={fixture.winnerCompetitionTeamId === fixture.homeCompetitionTeamId ? "font-semibold" : ""}>{home}</span><span className="font-semibold tabular-nums">{fixture.homeScore ?? "–"}</span></div>
      <div className="flex items-center justify-between gap-3"><span className={fixture.winnerCompetitionTeamId === fixture.awayCompetitionTeamId ? "font-semibold" : ""}>{away}</span><span className="font-semibold tabular-nums">{fixture.awayScore ?? "–"}</span></div>
    </div>
    {canRecord && <Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => onRecordResult(fixture)}><Plus className="size-3.5" />Record result</Button>}
  </div>;
}

function KnockoutBracket({ fixtures, participants, isAdmin, onRecordResult }: {
  fixtures: CompetitionFixture[];
  participants: Participant[];
  isAdmin: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
}) {
  const names = new Map(participants.map((participant) => [participant.id, participant.displayName]));
  const maxRound = Math.max(0, ...fixtures.map((fixture) => fixture.round));
  if (!maxRound) return null;
  const openingGames = fixtures.filter((fixture) => fixture.round === 1).length;
  const minHeight = Math.max(220, openingGames * 118);
  const columns: { key: string; label: string; rows: CompetitionFixture[] }[] = [];

  for (let round = 1; round < maxRound; round++) {
    const rows = fixtures.filter((fixture) => fixture.round === round);
    const half = Math.ceil(rows.length / 2);
    columns.push({ key: `left-${round}`, label: roundLabel(round, maxRound), rows: rows.slice(0, half) });
  }
  columns.push({ key: "final", label: "Final", rows: fixtures.filter((fixture) => fixture.round === maxRound) });
  for (let round = maxRound - 1; round >= 1; round--) {
    const rows = fixtures.filter((fixture) => fixture.round === round);
    const half = Math.ceil(rows.length / 2);
    columns.push({ key: `right-${round}`, label: roundLabel(round, maxRound), rows: rows.slice(half) });
  }

  return <div className="overflow-x-auto pb-2">
    <div className="grid min-w-max gap-5" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(190px, 220px))` }}>
      {columns.map((column) => <div key={column.key} className="flex flex-col">
        <h3 className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.label}</h3>
        <div className="flex flex-1 flex-col justify-around gap-4" style={{ minHeight }}>
          {column.rows.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} names={names} isAdmin={isAdmin} onRecordResult={onRecordResult} compact />)}
        </div>
      </div>)}
    </div>
  </div>;
}

function LeagueSchedule({ fixtures, participants, isAdmin, onRecordResult }: {
  fixtures: CompetitionFixture[];
  participants: Participant[];
  isAdmin: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
}) {
  const names = new Map(participants.map((participant) => [participant.id, participant.displayName]));
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);
  return <div className="space-y-5">{rounds.map((round) => <div key={round}>
    <div className="mb-2 flex items-center gap-2"><CalendarClock className="size-4 text-primary" /><h3 className="font-medium">Matchday {round}</h3></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{fixtures.filter((fixture) => fixture.round === round).map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} names={names} isAdmin={isAdmin} onRecordResult={onRecordResult} />)}</div>
  </div>)}</div>;
}

export function CompetitionFixturesView({ format, fixtures, participants, isAdmin, onRecordResult }: {
  format: CompetitionFormat;
  fixtures: CompetitionFixture[];
  participants: Participant[];
  isAdmin: boolean;
  onRecordResult: (fixture: CompetitionFixture) => void;
}) {
  const leagueFixtures = fixtures.filter((fixture) => fixture.stage === "league");
  const knockoutFixtures = fixtures.filter((fixture) => fixture.stage === "knockout");

  if (!fixtures.length) return null;
  if (format === "knockout") {
    return <AppCard className="space-y-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><GitBranch className="size-5 text-primary" />Knockout bracket</h2><p className="mt-1 text-sm text-muted-foreground">Winners advance automatically toward the final in the centre.</p></div><KnockoutBracket fixtures={knockoutFixtures} participants={participants} isAdmin={isAdmin} onRecordResult={onRecordResult} /></AppCard>;
  }

  return <>
    {leagueFixtures.length > 0 && <AppCard className="space-y-4"><div><h2 className="text-lg font-semibold">League fixtures</h2><p className="mt-1 text-sm text-muted-foreground">Generated from the configured round-robin and playing-day rules.</p></div><LeagueSchedule fixtures={leagueFixtures} participants={participants} isAdmin={isAdmin} onRecordResult={onRecordResult} /></AppCard>}
    {format === "league_knockout" && <AppCard className="space-y-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><GitBranch className="size-5 text-primary" />Knockout stage</h2><p className="mt-1 text-sm text-muted-foreground">{knockoutFixtures.length ? "The highest-ranked qualifiers have been seeded into the bracket." : "The bracket will be created automatically when every league-phase fixture has a result."}</p></div>{knockoutFixtures.length > 0 && <KnockoutBracket fixtures={knockoutFixtures} participants={participants} isAdmin={isAdmin} onRecordResult={onRecordResult} />}</AppCard>}
  </>;
}

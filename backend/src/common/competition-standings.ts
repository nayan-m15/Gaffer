export interface CompetitionStandingParticipant {
  id: string;
  teamId: string | null;
  displayName: string;
}

export interface CompetitionStandingResult {
  homeCompetitionTeamId: string;
  awayCompetitionTeamId: string;
  homeScore: number;
  awayScore: number;
}

/**
 * Legacy standings rows are treated as a baseline only. New competition
 * results are then added on top, which preserves existing manually-entered
 * tables while moving all future updates to the match/result ledger.
 */
export interface CompetitionStandingBaseline {
  id: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface CalculatedCompetitionStanding {
  id: string;
  competitionId: string;
  teamName: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  isOwnTeam: boolean;
}

function nameKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

/**
 * Calculates a conventional 3/1/0 league table from competition results.
 * Ties are ordered by goal difference, goals scored, wins, then team name.
 * When every team is on zero, that naturally produces alphabetical 1..N.
 */
export function calculateCompetitionStandings(
  competitionId: string,
  participants: CompetitionStandingParticipant[],
  results: CompetitionStandingResult[],
  viewerTeamId: string | null,
  baselines: CompetitionStandingBaseline[] = [],
): CalculatedCompetitionStanding[] {
  const baselineByName = new Map(
    baselines.map((row) => [nameKey(row.teamName), row]),
  );

  const rows = new Map<
    string,
    Omit<CalculatedCompetitionStanding, 'position'>
  >();

  for (const participant of participants) {
    const baseline = baselineByName.get(nameKey(participant.displayName));
    rows.set(participant.id, {
      id: baseline?.id ?? `participant:${participant.id}`,
      competitionId,
      teamName: participant.displayName,
      played: baseline?.played ?? 0,
      won: baseline?.won ?? 0,
      drawn: baseline?.drawn ?? 0,
      lost: baseline?.lost ?? 0,
      goalsFor: baseline?.goalsFor ?? 0,
      goalsAgainst: baseline?.goalsAgainst ?? 0,
      points: baseline?.points ?? 0,
      isOwnTeam: viewerTeamId !== null && participant.teamId === viewerTeamId,
    });
  }

  const applyResult = (
    participantId: string,
    goalsFor: number,
    goalsAgainst: number,
  ) => {
    const row = rows.get(participantId);
    if (!row) return;

    row.played += 1;
    row.goalsFor += goalsFor;
    row.goalsAgainst += goalsAgainst;
    if (goalsFor > goalsAgainst) {
      row.won += 1;
      row.points += 3;
    } else if (goalsFor === goalsAgainst) {
      row.drawn += 1;
      row.points += 1;
    } else {
      row.lost += 1;
    }
  };

  for (const result of results) {
    applyResult(
      result.homeCompetitionTeamId,
      result.homeScore,
      result.awayScore,
    );
    applyResult(
      result.awayCompetitionTeamId,
      result.awayScore,
      result.homeScore,
    );
  }

  return [...rows.values()]
    .sort((a, b) => {
      const points = b.points - a.points;
      if (points !== 0) return points;

      const goalDifference =
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst);
      if (goalDifference !== 0) return goalDifference;

      const goalsFor = b.goalsFor - a.goalsFor;
      if (goalsFor !== 0) return goalsFor;

      const wins = b.won - a.won;
      if (wins !== 0) return wins;

      return a.teamName.localeCompare(b.teamName, undefined, {
        sensitivity: 'base',
      });
    })
    .map((row, index) => ({ ...row, position: index + 1 }));
}

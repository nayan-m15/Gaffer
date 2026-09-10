import { teamAbbrev } from "./live-match-model";
import { chronological } from "./match-report-chart-stats";
import type { MatchLogEvent, MatchSquadAthlete } from "./types";

export {
  busiestInterval,
  cardProgressionMarks,
  eventBreakdownSlices,
  scoreProgressionPoints,
  teamComparisonRows,
  teamEventSplit,
} from "./match-report-chart-stats";

function scorerSurname(
  event: MatchLogEvent,
  squad: MatchSquadAthlete[],
) {
  if (event.athlete) {
    return (event.athlete.lastName || event.athlete.firstName).trim();
  }
  if (event.athleteId) {
    const athlete = squad.find((player) => player.id === event.athleteId);
    if (athlete) {
      return (athlete.lastName || athlete.firstName).trim();
    }
  }
  if (event.opponentPlayer?.name) {
    return event.opponentPlayer.name.trim();
  }
  return null;
}

export function matchStory(input: {
  ownName: string;
  oppName: string;
  teamScore: number;
  oppScore: number;
  goals: MatchLogEvent[];
  squad: MatchSquadAthlete[];
}) {
  const { ownName, oppName, teamScore, oppScore, goals, squad } = input;
  const ownAbbrev = teamAbbrev(ownName);
  const oppAbbrev = teamAbbrev(oppName);
  const orderedGoals = chronological(goals);
  const first = orderedGoals[0];
  const scorer = first ? scorerSurname(first, squad) : null;
  const winner = teamScore > oppScore ? ownName : oppScore > teamScore ? oppName : null;
  const winnerAbbrev = teamScore > oppScore ? ownAbbrev : oppAbbrev;
  const high = Math.max(teamScore, oppScore);
  const low = Math.min(teamScore, oppScore);
  const margin = high - low;

  if (!winner) {
    if (teamScore === 0) {
      return `${ownName} and ${oppName} played out a goalless draw.`;
    }
    return `${ownName} and ${oppName} shared the points in a ${teamScore}-${oppScore} draw.`;
  }

  if (first && scorer && margin === 1 && first.minute <= 25) {
    return `${winnerAbbrev} struck early through ${scorer} and made it stand up for the full 90 — a disciplined, single-goal win.`;
  }
  if (margin >= 3) {
    return `${winner} were dominant, running out ${high}-${low} winners.`;
  }
  if (first && scorer) {
    return `${winner} won ${high}-${low}, with ${scorer} opening the scoring.`;
  }
  return `${winner} won ${high}-${low}.`;
}

export function matchFacts(events: MatchLogEvent[]) {
  const ordered = chronological(events);
  const firstGoal = ordered.find((event) => event.eventType === "goal");
  const firstCard = ordered.find(
    (event) =>
      event.eventType === "yellow_card" || event.eventType === "red_card",
  );
  return {
    firstGoalMinute: firstGoal?.minute ?? null,
    firstCardMinute: firstCard?.minute ?? null,
    substitutionCount: events.filter((event) => event.eventType === "substitution")
      .length,
    totalEvents: events.length,
  };
}

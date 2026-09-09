import { teamAbbrev } from "./live-match-model";
import type { MatchLogEvent, MatchSquadAthlete } from "./types";

const BREAKDOWN_COLORS = {
  goals: "#00d99a",
  cards: "#f5c518",
  subs: "#c084fc",
  assists: "#5b9fff",
} as const;

function chronological(events: MatchLogEvent[]) {
  return [...events].sort((left, right) => {
    const byMinute = left.minute - right.minute;
    if (byMinute !== 0) {
      return byMinute;
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function countBy(
  events: MatchLogEvent[],
  team: "own" | "opponent",
  types: MatchLogEvent["eventType"][],
) {
  return events.filter(
    (event) => event.team === team && types.includes(event.eventType),
  ).length;
}

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

export function teamComparisonRows(events: MatchLogEvent[]) {
  return [
    {
      category: "GOALS",
      own: countBy(events, "own", ["goal"]),
      opp: countBy(events, "opponent", ["goal"]),
    },
    {
      category: "ASSISTS",
      own: countBy(events, "own", ["assist"]),
      opp: countBy(events, "opponent", ["assist"]),
    },
    {
      category: "CARDS",
      own: countBy(events, "own", ["yellow_card", "red_card"]),
      opp: countBy(events, "opponent", ["yellow_card", "red_card"]),
    },
    {
      category: "SUBS",
      own: countBy(events, "own", ["substitution"]),
      opp: countBy(events, "opponent", ["substitution"]),
    },
  ];
}

export function scoreProgressionPoints(events: MatchLogEvent[], endMinute = 90) {
  const goals = chronological(events).filter((event) => event.eventType === "goal");
  const lastMinute = Math.max(
    endMinute,
    ...goals.map((event) => event.minute),
    0,
  );
  const points: { minute: number; own: number; opp: number }[] = [
    { minute: 0, own: 0, opp: 0 },
  ];
  let own = 0;
  let opp = 0;
  for (const goal of goals) {
    if (goal.team === "own") {
      own += 1;
    } else {
      opp += 1;
    }
    const previous = points[points.length - 1];
    if (previous && previous.minute === goal.minute) {
      previous.own = own;
      previous.opp = opp;
    } else {
      points.push({ minute: goal.minute, own, opp });
    }
  }
  const last = points[points.length - 1];
  if (!last || last.minute < lastMinute) {
    points.push({ minute: lastMinute, own, opp });
  }
  return { points, endMinute: lastMinute };
}

export function eventBreakdownSlices(events: MatchLogEvent[]) {
  const slices = [
    {
      name: "Goals",
      value: events.filter((event) => event.eventType === "goal").length,
      color: BREAKDOWN_COLORS.goals,
    },
    {
      name: "Cards",
      value: events.filter(
        (event) =>
          event.eventType === "yellow_card" || event.eventType === "red_card",
      ).length,
      color: BREAKDOWN_COLORS.cards,
    },
    {
      name: "Subs",
      value: events.filter((event) => event.eventType === "substitution").length,
      color: BREAKDOWN_COLORS.subs,
    },
    {
      name: "Assists",
      value: events.filter((event) => event.eventType === "assist").length,
      color: BREAKDOWN_COLORS.assists,
    },
  ];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return { slices: slices.filter((slice) => slice.value > 0), total, all: slices };
}

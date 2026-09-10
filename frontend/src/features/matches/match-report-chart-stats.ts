import type { MatchLogEvent } from "./types";

const BREAKDOWN_COLORS = {
  goals: "#00d99a",
  cards: "#f5c518",
  subs: "#c084fc",
  assists: "#5b9fff",
} as const;

export function chronological(events: MatchLogEvent[]) {
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
      category: "YELLOW CARDS",
      own: countBy(events, "own", ["yellow_card"]),
      opp: countBy(events, "opponent", ["yellow_card"]),
    },
    {
      category: "RED CARDS",
      own: countBy(events, "own", ["red_card"]),
      opp: countBy(events, "opponent", ["red_card"]),
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

export function cardProgressionMarks(events: MatchLogEvent[]) {
  return chronological(events)
    .filter(
      (event) =>
        event.eventType === "yellow_card" || event.eventType === "red_card",
    )
    .map((event) => ({
      minute: event.minute,
      lane: -0.35,
      kind: event.eventType === "red_card" ? "red" : "yellow",
      color: event.eventType === "red_card" ? "#ff5b5f" : "#f5c518",
    }));
}

export function teamEventSplit(events: MatchLogEvent[]) {
  return {
    own: events.filter((event) => event.team === "own").length,
    opp: events.filter((event) => event.team === "opponent").length,
  };
}

export function busiestInterval(events: MatchLogEvent[]) {
  const buckets = Array.from({ length: 9 }, (_, index) => ({
    start: index * 10,
    end: (index + 1) * 10,
    count: 0,
  }));
  for (const event of events) {
    const index = Math.min(8, Math.max(0, Math.floor(event.minute / 10)));
    buckets[index].count += 1;
  }
  let best = buckets[0];
  for (const bucket of buckets) {
    if (bucket.count > best.count) {
      best = bucket;
    }
  }
  return best;
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

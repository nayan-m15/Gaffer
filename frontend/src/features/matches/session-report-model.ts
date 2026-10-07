import type {
  MatchRecord,
  MatchLogEvent,
  MatchSquadAthlete,
  SessionReport,
} from "./types";

export type { SessionReport } from "./types";

export const sessionReportKey = (sessionId: string) =>
  ["match-sessions", sessionId, "report"] as const;

/** A server row replaces its queued preview as soon as it reaches the report. */
export function mergeSessionTimeline(
  pending: MatchLogEvent[],
  synced: MatchLogEvent[],
): MatchLogEvent[] {
  return [...new Map([...pending, ...synced].map(event => [event.id, event])).values()];
}

export function applySessionReport(
  sheet: MatchRecord,
  report: SessionReport,
): MatchRecord {
  const teamScore = sheet.isHome ? report.score.home : report.score.away;
  const opponentScore = sheet.isHome ? report.score.away : report.score.home;
  const ownSide = sheet.isHome ? "home" : "away";
  const confirmed = (own: boolean) =>
    report.timeline.filter(
      (row) =>
        row.eventType === "goal" &&
        row.lifecycleStatus === "confirmed" &&
        (row.side === ownSide) === own,
    ).length;
  const possible = (own: boolean) =>
    report.timeline.filter(
      (row) =>
        row.eventType === "goal" &&
        row.lifecycleStatus === "needs_review" &&
        (row.side === ownSide) === own,
    ).length;
  // A poll already in flight can return the report from before our clock write.
  // Keep the acknowledged anchor until the shared report catches up.
  const clock = (sheet.clockRevision ?? 0) > report.clock.revision
    ? { period: sheet.clockPeriod, elapsedMs: sheet.clockElapsedMs,
        startedAt: sheet.clockStartedAt, revision: sheet.clockRevision }
    : report.clock;
  return {
    ...sheet,
    teamScore,
    opponentScore,
    clockPeriod: clock.period,
    clockElapsedMs: clock.elapsedMs,
    clockStartedAt: clock.startedAt,
    clockRevision: clock.revision,
    eventStatus:
      clock.period === "full_time" ? "completed"
        : sheet.eventStatus === "completed" && clock.revision > sheet.clockRevision
          ? "scheduled" : sheet.eventStatus,
    projection: {
      ...sheet.projection,
      revision: sheet.projection?.revision ?? 0,
      confirmedTeamScore:
        report.finalStatus === "finalised" ? teamScore : confirmed(true),
      confirmedOpponentScore:
        report.finalStatus === "finalised" ? opponentScore : confirmed(false),
      provisionalTeamScore: teamScore,
      provisionalOpponentScore: opponentScore,
      possibleEffects: {
        teamGoals: possible(true),
        opponentGoals: possible(false),
      },
      unresolvedReviewCount: report.reviews.filter(
        (r) => r.status === "open" || r.disputedAt,
      ).length,
      finalisationState:
        report.finalStatus === "finalised"
          ? "finalised"
          : report.finalStatus === "amendment_required"
            ? "amendment_required"
            : "open",
    },
  };
}
export function sessionTimeline(
  report: SessionReport,
  sheet: MatchRecord,
  squad: MatchSquadAthlete[] = [],
): MatchLogEvent[] {
  const timeline: MatchLogEvent[] = report.timeline.map((row) => {
    const own = row.side === (sheet.isHome ? "home" : "away");
    const label = sessionPlayerLabel(row);
    const candidates = own && row.player ? squad.filter((athlete) => {
      const name = `${athlete.firstName} ${athlete.lastName}`.trim();
      const numbered = [athlete.squadNumber == null ? "" : `#${athlete.squadNumber}`, name].filter(Boolean).join(" ");
      return label === numbered || (row.player?.name === name &&
        (row.player.shirtNumber == null || row.player.shirtNumber === athlete.squadNumber));
    }) : [];
    const athlete = candidates.length === 1 ? candidates[0] : null;
    return {
      ...row,
      matchId: sheet.id,
      team: own ? "own" : "opponent",
      athleteId: athlete?.id ?? null,
      athlete,
      opponentPlayerId: null,
      opponentPlayer: null,
      opponentLabel: label,
      detail: row.eventType === "substitution" ? row.incomingPlayerLabel ?? null : null,
      loggedByUserId: "",
      syncStatus: "synced",
      pending: false,
    };
  });
  // Concurrent bookings can become distinct only after both coaches review
  // them. Derive the dismissal from the resolved timeline on every refresh,
  // without altering the original observations or creating another event.
  const bookings = new Map<string, number>();
  const secondBookings = new Set<string>();
  const seen = new Set<string>();
  const ordered = [...timeline].sort((left, right) =>
    (left.matchElapsedMs ?? left.minute * 60_000) -
      (right.matchElapsedMs ?? right.minute * 60_000) ||
    String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")) ||
    left.id.localeCompare(right.id),
  );
  for (const event of ordered) {
    if (seen.has(event.id) || event.lifecycleStatus !== "confirmed" ||
      event.eventType !== "yellow_card") continue;
    seen.add(event.id);
    const name = event.player?.name?.trim().toLowerCase();
    const number = event.player?.shirtNumber;
    if ((!name || name === "unassigned") && number == null) continue;
    const key = JSON.stringify([event.team, number ?? null, name ?? ""]);
    const count = (bookings.get(key) ?? 0) + 1;
    bookings.set(key, count);
    if (count === 2) secondBookings.add(event.id);
  }
  return timeline.map(event => secondBookings.has(event.id)
    ? { ...event, eventType: "red_card", detail: "Second yellow card" }
    : event);
}

export function sessionPlayerLabel(event: Pick<MatchLogEvent, "player">): string | null {
  if (event.player === undefined) return null;
  return (
    [
      event.player?.shirtNumber == null ? "" : "#" + event.player.shirtNumber,
      event.player?.name ?? "",
    ]
      .filter(Boolean)
      .join(" ") || "Unassigned"
  );
}

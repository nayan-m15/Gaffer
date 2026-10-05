import type { MatchRecord, MatchLogEvent, SessionReport } from "./types";

export type { SessionReport } from "./types";

export const sessionReportKey = (sessionId: string) =>
  ["match-sessions", sessionId, "report"] as const;

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
  return {
    ...sheet,
    teamScore,
    opponentScore,
    clockPeriod: report.clock.period,
    clockElapsedMs: report.clock.elapsedMs,
    clockStartedAt: report.clock.startedAt,
    clockRevision: report.clock.revision,
    eventStatus:
      report.clock.period === "full_time" ? "completed" : sheet.eventStatus,
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
): MatchLogEvent[] {
  return report.timeline.map((row) => ({
    ...row,
    matchId: sheet.id,
    team: row.side === (sheet.isHome ? "home" : "away") ? "own" : "opponent",
    athleteId: null,
    athlete: null,
    opponentPlayerId: null,
    opponentPlayer: null,
    opponentLabel:
      row.player?.name ??
      (row.player?.shirtNumber ? `#${row.player.shirtNumber}` : null),
    detail: row.eventType === "substitution" ? row.incomingPlayerLabel ?? null : null,
    loggedByUserId: "",
    syncStatus: "synced",
    pending: false,
  }));
}

export function sessionPlayerLabel(event: MatchLogEvent): string | null {
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

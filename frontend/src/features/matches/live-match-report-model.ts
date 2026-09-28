import type {
  MatchClockPeriod,
  MatchEventTeam,
  MatchEventType,
  MatchLogEvent,
  MatchRecord,
  MatchSquadAthlete,
  OpponentMatchPlayer,
} from "./types";

export interface LiveMatchReportData {
  match: MatchRecord;
  teamName: string;
  squad: MatchSquadAthlete[];
  events: MatchLogEvent[];
  generatedAt: Date;
}

export interface MatchReportEventRow {
  id: string;
  minute: number;
  period: MatchClockPeriod;
  team: MatchEventTeam;
  type: MatchEventType;
  label: string;
  person: string;
  detail: string | null;
}

export interface MatchReportGoalRow {
  id: string;
  minute: number;
  team: MatchEventTeam;
  scorer: string;
  assist: string | null;
  score: string;
}

export interface MatchReportSubstitutionRow {
  id: string;
  minute: number;
  team: MatchEventTeam;
  playerOff: string;
  playerOn: string;
}

export interface MatchReportPlayerRow {
  athlete: MatchSquadAthlete;
  goals: number;
  assists: number;
  keyPasses: number;
  yellowCards: number;
  redCards: number;
}

const EVENT_LABEL: Record<MatchEventType, string> = {
  goal: "Goal",
  assist: "Assist",
  key_pass: "Key pass",
  yellow_card: "Yellow card",
  red_card: "Red card",
  substitution: "Substitution",
  penalty: "Penalty",
  injury: "Injury",
  goalkeeper_save: "Save",
};

export const MATCH_PERIOD_LABEL: Record<MatchClockPeriod, string> = {
  not_started: "Pre-match",
  first_half: "First half",
  half_time: "Half-time",
  second_half: "Second half",
  full_time: "Full-time",
};

export function chronologicalMatchEvents(events: MatchLogEvent[]): MatchLogEvent[] {
  return [...events]
    .filter((event) => event.lifecycleStatus !== "voided")
    .sort((left, right) =>
      left.minute - right.minute ||
      (left.matchElapsedMs ?? 0) - (right.matchElapsedMs ?? 0) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
    );
}

function athleteName(athlete: MatchSquadAthlete): string {
  const name = `${athlete.firstName} ${athlete.lastName}`.trim();
  return athlete.squadNumber == null ? name : `#${athlete.squadNumber} ${name}`;
}

function opponentName(player: OpponentMatchPlayer): string {
  const name = player.name?.trim();
  return name ? `#${player.shirtNumber} ${name}` : `#${player.shirtNumber}`;
}

export function matchEventPerson(
  event: MatchLogEvent,
  squad: MatchSquadAthlete[],
): string {
  if (event.athlete) return athleteName(event.athlete);
  if (event.opponentPlayer) return opponentName(event.opponentPlayer);
  if (event.athleteId) {
    const athlete = squad.find((candidate) => candidate.id === event.athleteId);
    if (athlete) return athleteName(athlete);
  }
  return event.opponentLabel?.trim() || "Unassigned";
}

function incomingPlayer(
  event: MatchLogEvent,
  squad: MatchSquadAthlete[],
  opponents: OpponentMatchPlayer[],
): string {
  if (!event.detail) return "Unassigned";
  if (event.team === "own") {
    const athlete = squad.find((candidate) => candidate.id === event.detail);
    return athlete ? athleteName(athlete) : event.detail;
  }
  const opponent = opponents.find((candidate) => candidate.id === event.detail);
  return opponent ? opponentName(opponent) : event.detail;
}

function assistMap(events: MatchLogEvent[]): Map<string, MatchLogEvent> {
  const ordered = chronologicalMatchEvents(events);
  const goals = ordered.filter((event) => event.eventType === "goal");
  const assists = ordered.filter((event) => event.eventType === "assist");
  const used = new Set<string>();
  const result = new Map<string, MatchLogEvent>();
  for (const goal of goals) {
    const assist = assists.find((candidate) =>
      !used.has(candidate.id) &&
      (candidate.detail === goal.id ||
        (!candidate.detail && candidate.team === goal.team && candidate.minute === goal.minute)),
    );
    if (assist) {
      used.add(assist.id);
      result.set(goal.id, assist);
    }
  }
  return result;
}

export function matchReportTimeline(data: LiveMatchReportData): MatchReportEventRow[] {
  const assists = assistMap(data.events);
  const pairedAssistIds = new Set([...assists.values()].map((event) => event.id));
  return chronologicalMatchEvents(data.events)
    .filter((event) => !pairedAssistIds.has(event.id))
    .map((event) => {
      const assist = assists.get(event.id);
      const detail = event.eventType === "substitution"
        ? `On: ${incomingPlayer(event, data.squad, data.match.opponentSquad)}`
        : assist
          ? `Assist: ${matchEventPerson(assist, data.squad)}`
          : event.detail && event.eventType !== "assist"
            ? event.detail
            : null;
      return {
        id: event.id,
        minute: event.minute,
        period: event.period ?? "not_started",
        team: event.team,
        type: event.eventType,
        label: EVENT_LABEL[event.eventType],
        person: matchEventPerson(event, data.squad),
        detail,
      };
    });
}

export function matchReportGoals(data: LiveMatchReportData): MatchReportGoalRow[] {
  const assists = assistMap(data.events);
  let own = 0;
  let opponent = 0;
  return chronologicalMatchEvents(data.events)
    .filter((event) => event.eventType === "goal")
    .map((event) => {
      if (event.team === "own") own += 1;
      else opponent += 1;
      const assist = assists.get(event.id);
      const homeScore = data.match.isHome ? own : opponent;
      const awayScore = data.match.isHome ? opponent : own;
      return {
        id: event.id,
        minute: event.minute,
        team: event.team,
        scorer: matchEventPerson(event, data.squad),
        assist: assist ? matchEventPerson(assist, data.squad) : null,
        score: `${homeScore}-${awayScore}`,
      };
    });
}

export function matchReportSubstitutions(data: LiveMatchReportData): MatchReportSubstitutionRow[] {
  return chronologicalMatchEvents(data.events)
    .filter((event) => event.eventType === "substitution")
    .map((event) => ({
      id: event.id,
      minute: event.minute,
      team: event.team,
      playerOff: matchEventPerson(event, data.squad),
      playerOn: incomingPlayer(event, data.squad, data.match.opponentSquad),
    }));
}

export function matchReportPlayerRows(data: LiveMatchReportData): MatchReportPlayerRow[] {
  return data.squad.map((athlete) => {
    const events = data.events.filter((event) => event.athleteId === athlete.id);
    const count = (type: MatchEventType) => events.filter((event) => event.eventType === type).length;
    return {
      athlete,
      goals: count("goal"),
      assists: count("assist"),
      keyPasses: count("key_pass"),
      yellowCards: count("yellow_card"),
      redCards: count("red_card"),
    };
  });
}

export function matchReportFilename(data: LiveMatchReportData): string {
  const clean = (value: string) =>
    value.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Team";
  const date = new Date(data.match.eventScheduledAt);
  const stamp = Number.isNaN(date.getTime())
    ? data.generatedAt.toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
  return `Gaffer_Match_Report_${clean(data.teamName)}_vs_${clean(data.match.opponentName)}_${stamp}.pdf`;
}

export function matchResult(data: LiveMatchReportData): string {
  if (data.match.eventStatus !== "completed") return "In progress";
  if (data.match.teamScore === data.match.opponentScore) return "Draw";
  return data.match.teamScore > data.match.opponentScore ? "Win" : "Loss";
}

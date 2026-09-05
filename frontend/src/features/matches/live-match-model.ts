import {
  DEFAULT_FORMATION_ID,
  FORMATIONS,
} from "@/features/team-management/formations";
import type { BackendLineup } from "@/services/lineups";
import { SECOND_YELLOW_DETAIL } from "./event-visuals";
import type {
  MatchLogEvent,
  MatchSquadAthlete,
  OpponentMatchPlayer,
} from "./types";

export const FALLBACK_OWN_COLOR = "#00D99A";
export const FALLBACK_OPP_COLOR = "#D4566A";

export type PitchHalf = "left" | "right";

export interface MarkerStats {
  goals: number;
  assists: number;
  yellow: boolean;
  red: boolean;
  secondYellow: boolean;
  subMinute: number | null;
  subOut: boolean;
}

export interface PlacedOwnPlayer {
  athlete: MatchSquadAthlete;
  x: number;
  y: number;
}

export interface PlacedOppPlayer {
  player: OpponentMatchPlayer;
  x: number;
  y: number;
}

export function teamAbbrev(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .map((word) => word[0] ?? "")
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }
  const letters = name.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 3) || "TM").toUpperCase();
}

export function resolveOwnColor(
  matchColor: string | null | undefined,
  teamColor: string | null | undefined,
) {
  return matchColor || teamColor || FALLBACK_OWN_COLOR;
}

export function resolveOppColor(matchColor: string | null | undefined) {
  return matchColor || FALLBACK_OPP_COLOR;
}

export function contrastText(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return "#ffffff";
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 160 ? "#102018" : "#ffffff";
}

export function surnameOf(athlete: MatchSquadAthlete) {
  return (athlete.lastName || athlete.firstName).toUpperCase();
}

export function opponentSurname(
  player: OpponentMatchPlayer,
  visibility: "none" | "numbers" | "full",
) {
  if (visibility !== "full" || !player.name) {
    return "";
  }
  const parts = player.name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? player.name).toUpperCase();
}

export function shirtNumberLabel(value: number | null | undefined) {
  return value != null ? String(value) : "–";
}

/**
 * Map a vertical formation slot (attack at y=0, GK at y≈94) onto one
 * horizontal half of the live pitch. Home always occupies the left half.
 */
export function formationToHalf(
  formationX: number,
  formationY: number,
  half: PitchHalf,
) {
  if (half === "left") {
    return {
      x: 3 + ((100 - formationY) / 100) * 44,
      y: 8 + ((100 - formationX) / 100) * 84,
    };
  }
  return {
    x: 53 + (formationY / 100) * 44,
    y: 8 + (formationX / 100) * 84,
  };
}

function uniqueAthletes(squad: MatchSquadAthlete[]) {
  const seen = new Set<string>();
  const unique: MatchSquadAthlete[] = [];
  for (const athlete of squad) {
    if (seen.has(athlete.id)) {
      continue;
    }
    seen.add(athlete.id);
    unique.push(athlete);
  }
  return unique;
}

function uniqueOpponents(players: OpponentMatchPlayer[]) {
  const seen = new Set<string>();
  const unique: OpponentMatchPlayer[] = [];
  for (const player of players) {
    if (seen.has(player.id)) {
      continue;
    }
    seen.add(player.id);
    unique.push(player);
  }
  return unique;
}

function chronological(timeline: MatchLogEvent[]) {
  return [...timeline].sort((a, b) => {
    const byTime = a.minute - b.minute;
    if (byTime !== 0) {
      return byTime;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function ownPitchState(
  squad: MatchSquadAthlete[],
  timeline: MatchLogEvent[],
) {
  const unique = uniqueAthletes(squad);
  const onPitch = new Set(
    unique.filter((athlete) => athlete.started).map((athlete) => athlete.id),
  );
  const bench = new Set(
    unique.filter((athlete) => !athlete.started).map((athlete) => athlete.id),
  );
  for (const event of chronological(timeline)) {
    if (event.eventType !== "substitution" || event.team !== "own") {
      continue;
    }
    const outgoingId = event.athleteId;
    const incomingId = event.detail;
    if (outgoingId) {
      onPitch.delete(outgoingId);
      bench.add(outgoingId);
    }
    if (incomingId) {
      onPitch.add(incomingId);
      bench.delete(incomingId);
    }
  }
  for (const id of onPitch) {
    bench.delete(id);
  }
  return {
    onPitch: unique.filter((athlete) => onPitch.has(athlete.id)),
    bench: unique.filter((athlete) => bench.has(athlete.id)),
  };
}

export function opponentPitchState(
  players: OpponentMatchPlayer[],
  timeline: MatchLogEvent[],
) {
  const unique = uniqueOpponents(players);
  const sorted = [...unique].sort((a, b) => a.shirtNumber - b.shirtNumber);
  const seenNumbers = new Set<number>();
  const starters: OpponentMatchPlayer[] = [];
  const extras: OpponentMatchPlayer[] = [];
  for (const player of sorted) {
    if (seenNumbers.has(player.shirtNumber) || starters.length >= 11) {
      extras.push(player);
      continue;
    }
    seenNumbers.add(player.shirtNumber);
    starters.push(player);
  }
  const onPitch = new Set(starters.map((player) => player.id));
  const bench = new Set(extras.map((player) => player.id));

  for (const event of chronological(timeline)) {
    if (event.eventType !== "substitution" || event.team !== "opponent") {
      continue;
    }
    const outgoingId = event.opponentPlayerId;
    const incomingId = event.detail;
    if (outgoingId) {
      onPitch.delete(outgoingId);
      bench.add(outgoingId);
    }
    if (incomingId && unique.some((player) => player.id === incomingId)) {
      onPitch.add(incomingId);
      bench.delete(incomingId);
    }
  }

  for (const id of onPitch) {
    bench.delete(id);
  }

  return {
    onPitch: unique.filter((player) => onPitch.has(player.id)),
    bench: unique.filter((player) => bench.has(player.id)),
  };
}

export function placeOwnPlayers(
  onPitch: MatchSquadAthlete[],
  lineup: BackendLineup | undefined,
  half: PitchHalf,
  timeline: MatchLogEvent[],
): PlacedOwnPlayer[] {
  const formationId = lineup?.formationId ?? DEFAULT_FORMATION_ID;
  const formation =
    FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const uniqueOnPitch = uniqueAthletes(onPitch);
  const byId = new Map(uniqueOnPitch.map((athlete) => [athlete.id, athlete]));

  const assignments: Record<string, string | null> = {
    ...(lineup?.assignments ?? {}),
  };

  for (const event of chronological(timeline)) {
    if (event.eventType !== "substitution" || event.team !== "own") {
      continue;
    }
    const outgoingId = event.athleteId;
    const incomingId = event.detail;
    if (!outgoingId || !incomingId) {
      continue;
    }
    const slot = Object.keys(assignments).find(
      (key) => assignments[key] === outgoingId,
    );
    if (slot) {
      assignments[slot] = incomingId;
    }
  }

  const usedIds = new Set<string>();
  const usedNumbers = new Set<number>();
  const filledSlots = new Set<string>();
  const placed: PlacedOwnPlayer[] = [];

  const tryPlace = (athlete: MatchSquadAthlete, x: number, y: number, slotId?: string) => {
    if (usedIds.has(athlete.id)) {
      return false;
    }
    if (
      athlete.squadNumber != null &&
      usedNumbers.has(athlete.squadNumber)
    ) {
      return false;
    }
    usedIds.add(athlete.id);
    if (athlete.squadNumber != null) {
      usedNumbers.add(athlete.squadNumber);
    }
    if (slotId) {
      filledSlots.add(slotId);
    }
    placed.push({ athlete, x, y });
    return true;
  };

  if (formation) {
    for (const position of formation.positions) {
      const athleteId = assignments[position.id];
      const athlete = athleteId ? byId.get(athleteId) : undefined;
      if (!athlete) {
        continue;
      }
      const mapped = formationToHalf(position.x, position.y, half);
      tryPlace(athlete, mapped.x, mapped.y, position.id);
    }

    const leftovers = uniqueOnPitch.filter((athlete) => !usedIds.has(athlete.id));
    let leftoverIndex = 0;
    for (const position of formation.positions) {
      if (filledSlots.has(position.id) || leftoverIndex >= leftovers.length) {
        continue;
      }
      const mapped = formationToHalf(position.x, position.y, half);
      while (leftoverIndex < leftovers.length) {
        const athlete = leftovers[leftoverIndex];
        leftoverIndex += 1;
        if (tryPlace(athlete, mapped.x, mapped.y, position.id)) {
          break;
        }
      }
    }
  }

  return placed;
}

export function placeOppPlayers(
  onPitch: OpponentMatchPlayer[],
  half: PitchHalf,
): PlacedOppPlayer[] {
  const unique = uniqueOpponents(onPitch);
  const ordered = [...unique].sort((a, b) => a.shirtNumber - b.shirtNumber);
  const formation = FORMATIONS[DEFAULT_FORMATION_ID];
  const usedIds = new Set<string>();
  const usedNumbers = new Set<number>();
  const placed: PlacedOppPlayer[] = [];
  if (!formation) {
    return placed;
  }

  let index = 0;
  for (const position of formation.positions) {
    while (index < ordered.length) {
      const player = ordered[index];
      index += 1;
      if (
        usedIds.has(player.id) ||
        usedNumbers.has(player.shirtNumber)
      ) {
        continue;
      }
      usedIds.add(player.id);
      usedNumbers.add(player.shirtNumber);
      const mapped = formationToHalf(position.x, position.y, half);
      placed.push({ player, ...mapped });
      break;
    }
  }
  return placed;
}

function matchesPlayer(
  event: MatchLogEvent,
  athleteId?: string,
  opponentPlayerId?: string,
) {
  if (athleteId) {
    return event.athleteId === athleteId || event.detail === athleteId;
  }
  if (opponentPlayerId) {
    return (
      event.opponentPlayerId === opponentPlayerId ||
      event.detail === opponentPlayerId
    );
  }
  return false;
}

export function markerStatsFor(
  timeline: MatchLogEvent[],
  athleteId?: string,
  opponentPlayerId?: string,
): MarkerStats {
  const stats: MarkerStats = {
    goals: 0,
    assists: 0,
    yellow: false,
    red: false,
    secondYellow: false,
    subMinute: null,
    subOut: false,
  };

  for (const event of chronological(timeline)) {
    const isSubject = athleteId
      ? event.athleteId === athleteId
      : event.opponentPlayerId === opponentPlayerId;
    const isIncoming = athleteId
      ? event.detail === athleteId
      : event.detail === opponentPlayerId;

    if (isSubject && event.eventType === "goal") {
      stats.goals += 1;
    }
    if (
      isSubject &&
      (event.eventType === "assist" || event.eventType === "key_pass")
    ) {
      stats.assists += 1;
    }
    if (isSubject && event.eventType === "yellow_card") {
      stats.yellow = true;
    }
    if (isSubject && event.eventType === "red_card") {
      stats.red = true;
      if (event.detail === SECOND_YELLOW_DETAIL) {
        stats.secondYellow = true;
      }
    }
    if (event.eventType === "substitution" && matchesPlayer(event, athleteId, opponentPlayerId)) {
      stats.subMinute = event.minute;
      stats.subOut = isSubject && !isIncoming;
    }
  }

  return stats;
}

export function runningScoreByEvent(
  timeline: MatchLogEvent[],
  isHome: boolean,
) {
  const scores = new Map<string, string>();
  let own = 0;
  let opp = 0;
  for (const event of chronological(timeline)) {
    if (event.eventType === "goal") {
      if (event.team === "own") {
        own += 1;
      } else {
        opp += 1;
      }
      const home = isHome ? own : opp;
      const away = isHome ? opp : own;
      scores.set(event.optimisticKey ?? event.id, `${home}-${away}`);
    }
  }
  return scores;
}

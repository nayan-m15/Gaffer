import {
  DEFAULT_FORMATION_ID,
  FORMATIONS,
  inferFormationIdFromPositions,
  previewAssignmentsForStarters,
} from "@/features/team-management/formations";
import type { BackendGamePlan, GamePlanSnapshot } from "@/services/gamePlans";
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
  subIn: boolean;
}

export type MarkerBadgeKind = "sub-out" | "sub-in" | "card" | "assist" | "goal";

export type MarkerBadgeSlot = "top-left" | "middle-left" | "bottom-left" | "bottom-right";

export interface MarkerBadge {
  slot: MarkerBadgeSlot;
  kind: MarkerBadgeKind;
}

/** Corner/edge badges for a player's token, keyed to that athlete even after they leave the pitch. */
export function markerBadgeSlots(stats: MarkerStats): MarkerBadge[] {
  const badges: MarkerBadge[] = [];
  if (stats.subOut) {
    badges.push({ slot: "top-left", kind: "sub-out" });
  } else if (stats.subIn) {
    badges.push({ slot: "top-left", kind: "sub-in" });
  }
  if (stats.yellow || stats.red || stats.secondYellow) {
    badges.push({ slot: "middle-left", kind: "card" });
  }
  if (stats.assists > 0) {
    badges.push({ slot: "bottom-left", kind: "assist" });
  }
  if (stats.goals > 0) {
    badges.push({ slot: "bottom-right", kind: "goal" });
  }
  return badges;
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

function spreadFromCenter(value: number, factor: number, min: number, max: number) {
  return Math.min(max, Math.max(min, 50 + (value - 50) * factor));
}

/**
 * Map a vertical formation slot (attack at y=0, GK at y≈94) onto the live
 * pitch. Home occupies the left half (own goal left, attack right); away the
 * right. `own` layout uses the same rotation but spans the full panel.
 *
 * Rotation is a true 90° turn of the tactics board: formation x (left/right)
 * becomes the vertical axis, formation y (attack/own goal) becomes length.
 * Across/depth are opened slightly from centre so tokens and labels in a back
 * four or narrow midfield do not collide.
 */
export function formationToHalf(
  formationX: number,
  formationY: number,
  half: PitchHalf,
  layout: "full" | "own" = "full",
) {
  const across = spreadFromCenter(formationX, 1.12, 6, 94);
  const depth = spreadFromCenter(formationY, 1.06, 6, 98);
  const span = layout === "own" ? 88 : 44;
  const start = layout === "own" ? 6 : half === "left" ? 3 : 53;
  const yInset = 4;
  const ySpan = 92;
  if (half === "left") {
    return {
      x: start + ((100 - depth) / 100) * span,
      y: yInset + (across / 100) * ySpan,
    };
  }
  return {
    x: start + (depth / 100) * span,
    y: yInset + ((100 - across) / 100) * ySpan,
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

function hasRecordedPosition(player: OpponentMatchPlayer) {
  return Boolean(player.position?.trim());
}

export function opponentPitchState(
  players: OpponentMatchPlayer[],
  timeline: MatchLogEvent[],
) {
  const unique = uniqueOpponents(players);
  const sorted = [...unique].sort((a, b) => a.shirtNumber - b.shirtNumber);
  const positioned = sorted.filter(hasRecordedPosition);
  const unpositioned = sorted.filter((player) => !hasRecordedPosition(player));
  const starters: OpponentMatchPlayer[] = [];
  const seenNumbers = new Set<number>();

  const takeStarter = (player: OpponentMatchPlayer) => {
    if (seenNumbers.has(player.shirtNumber) || starters.length >= 11) {
      return false;
    }
    seenNumbers.add(player.shirtNumber);
    starters.push(player);
    return true;
  };

  if (positioned.length > 0) {
    for (const player of positioned) {
      takeStarter(player);
    }
    for (const player of unpositioned) {
      takeStarter(player);
    }
  } else {
    for (const player of sorted) {
      takeStarter(player);
    }
  }

  const starterIds = new Set(starters.map((player) => player.id));
  const extras = unique.filter((player) => !starterIds.has(player.id));
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
  gamePlan: BackendGamePlan | GamePlanSnapshot | undefined,
  half: PitchHalf,
  timeline: MatchLogEvent[],
  layout: "full" | "own" = "full",
): PlacedOwnPlayer[] {
  const formationId = gamePlan?.formationId ?? DEFAULT_FORMATION_ID;
  const formation =
    FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const uniqueOnPitch = uniqueAthletes(onPitch);
  const byId = new Map(uniqueOnPitch.map((athlete) => [athlete.id, athlete]));

  const preferred: Record<string, string | null> = {
    ...(gamePlan?.assignments ?? {}),
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
    const slot = Object.keys(preferred).find(
      (key) => preferred[key] === outgoingId,
    );
    if (slot) {
      preferred[slot] = incomingId;
    }
  }

  const assignments = previewAssignmentsForStarters(
    formationId,
    uniqueOnPitch.map((athlete) => athlete.id),
    (id) => byId.get(id)?.position ?? null,
    preferred,
  );

  const placed: PlacedOwnPlayer[] = [];
  const usedIds = new Set<string>();

  if (formation) {
    for (const position of formation.positions) {
      const athleteId = assignments[position.id];
      const athlete = athleteId ? byId.get(athleteId) : undefined;
      if (!athlete || usedIds.has(athlete.id)) {
        continue;
      }
      usedIds.add(athlete.id);
      placed.push({
        athlete,
        ...formationToHalf(position.x, position.y, half, layout),
      });
    }
  }

  return placed;
}

export function placeOppPlayers(
  onPitch: OpponentMatchPlayer[],
  half: PitchHalf,
  timeline: MatchLogEvent[] = [],
): PlacedOppPlayer[] {
  const unique = uniqueOpponents(onPitch);
  const byId = new Map(unique.map((player) => [player.id, player]));
  const hasPositions = unique.some(hasRecordedPosition);
  const formationId = hasPositions
    ? inferFormationIdFromPositions(unique.map((player) => player.position))
    : DEFAULT_FORMATION_ID;
  const formation =
    FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const placed: PlacedOppPlayer[] = [];
  if (!formation) {
    return placed;
  }

  const preferred: Record<string, string | null> = {};
  for (const position of formation.positions) {
    preferred[position.id] = null;
  }

  if (hasPositions) {
    const used = new Set<string>();
    for (const position of formation.positions) {
      const candidate = unique.find((player) => {
        if (used.has(player.id)) {
          return false;
        }
        return (
          (player.position ?? "").trim().toUpperCase() ===
          position.label.trim().toUpperCase()
        );
      });
      if (candidate) {
        preferred[position.id] = candidate.id;
        used.add(candidate.id);
      }
    }
  } else {
    const ordered = [...unique].sort((a, b) => a.shirtNumber - b.shirtNumber);
    let index = 0;
    for (const position of formation.positions) {
      const player = ordered[index];
      if (!player) {
        break;
      }
      preferred[position.id] = player.id;
      index += 1;
    }
  }

  for (const event of chronological(timeline)) {
    if (event.eventType !== "substitution" || event.team !== "opponent") {
      continue;
    }
    const outgoingId = event.opponentPlayerId;
    const incomingId = event.detail;
    if (!outgoingId || !incomingId) {
      continue;
    }
    const slot = Object.keys(preferred).find(
      (key) => preferred[key] === outgoingId,
    );
    if (slot) {
      preferred[slot] = incomingId;
    }
  }

  const assignments = hasPositions
    ? previewAssignmentsForStarters(
        formationId,
        unique.map((player) => player.id),
        (id) => byId.get(id)?.position ?? null,
        preferred,
      )
    : preferred;

  const usedIds = new Set<string>();
  for (const position of formation.positions) {
    const playerId = assignments[position.id];
    const player = playerId ? byId.get(playerId) : undefined;
    if (!player || usedIds.has(player.id)) {
      continue;
    }
    usedIds.add(player.id);
    placed.push({
      player,
      ...formationToHalf(position.x, position.y, half),
    });
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
    subIn: false,
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
      stats.subIn = isIncoming && !isSubject;
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

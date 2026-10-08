import type { OpponentLineupView } from "./types";

export interface PublicLineupPlayer {
  /** Display key only; never an athlete or manual opponent row ID. */
  id: string;
  name: string;
  shirtNumber: number | null;
  slotId: string | null;
}

/** Allowlist both response versions without copying private roster/tactical fields. */
export function normalizeOpponentLineup(
  lineup: OpponentLineupView | null | undefined,
) {
  const empty = {
    available: false,
    source: null,
    formation: null,
    customPositions: null,
    starters: [] as PublicLineupPlayer[],
    bench: [] as PublicLineupPlayer[],
  };
  if (!lineup?.available) return empty;
  const legacy = "players" in lineup;
  const formation = legacy ? (lineup.formationId ?? null) : lineup.formation;
  const positions = lineup.customPositions;
  const customPositions =
    formation?.startsWith("custom-") && positions
      ? positions.map(({ id, label, x, y }) => ({ id, label, x, y }))
      : null;
  const source = legacy
    ? lineup.confirmedAt
      ? "confirmed"
      : "squad"
    : (lineup.source ?? "confirmed");
  const rows = legacy
    ? lineup.players.map((player) => ({
        name: `${player.firstName} ${player.lastName}`.trim(),
        shirtNumber: player.squadNumber,
        started: Boolean(player.started),
        slotId: player.started
          ? (Object.entries(lineup.pitchAssignments ?? {}).find(
              ([, id]) => id === player.id,
            )?.[0] ?? null)
          : null,
      }))
    : [
        ...lineup.starters.map((player) => ({ ...player, started: true })),
        ...lineup.bench.map((player) => ({
          ...player,
          slotId: null,
          started: false,
        })),
      ];
  const players = rows.map((player, index) => ({
    id: `public-lineup:${index}`,
    name: player.name,
    shirtNumber: player.shirtNumber,
    slotId: player.started ? (player.slotId ?? null) : null,
    started: player.started,
  }));
  const publicRow = ({
    id,
    name,
    shirtNumber,
    slotId,
  }: (typeof players)[number]) => ({ id, name, shirtNumber, slotId });
  return {
    available: true,
    source,
    formation,
    customPositions,
    starters: players.filter((p) => p.started).map(publicRow),
    bench: players.filter((p) => !p.started).map(publicRow),
  };
}

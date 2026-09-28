import type { MatchSquadAthlete, OpponentMatchPlayer } from "./types";

export function isGoalkeeperPosition(position: string | null | undefined) {
  const normalized = position?.trim().toLowerCase();
  return normalized === "gk" || normalized === "goalkeeper";
}

export type OpposingGoalkeeper =
  | { team: "own"; athlete: MatchSquadAthlete }
  | { team: "opponent"; player: OpponentMatchPlayer };

/**
 * The goalkeeper facing `shooterTeam`. Only real squad rows are eligible:
 * a friendly display lineup is not passed in, because those ids cannot be
 * used for event attribution. Prefers a keeper who is currently on the
 * pitch, then any other assigned keeper. A sent-off keeper is skipped.
 */
export function findOpposingGoalkeeper({
  shooterTeam,
  squad,
  opponentSquad,
  ownOnPitchIds,
  opponentOnPitchIds,
  dismissedOwnIds,
  dismissedOpponentIds,
}: {
  shooterTeam: "own" | "opponent";
  squad: MatchSquadAthlete[];
  opponentSquad: OpponentMatchPlayer[];
  ownOnPitchIds?: ReadonlySet<string>;
  opponentOnPitchIds?: ReadonlySet<string>;
  dismissedOwnIds?: ReadonlySet<string>;
  dismissedOpponentIds?: ReadonlySet<string>;
}): OpposingGoalkeeper | null {
  if (shooterTeam === "own") {
    const keeper = pickGoalkeeper(
      opponentSquad,
      opponentOnPitchIds,
      dismissedOpponentIds,
    );
    return keeper ? { team: "opponent", player: keeper } : null;
  }
  const keeper = pickGoalkeeper(squad, ownOnPitchIds, dismissedOwnIds);
  return keeper ? { team: "own", athlete: keeper } : null;
}

function pickGoalkeeper<T extends { id: string; position?: string | null }>(
  players: T[],
  onPitchIds: ReadonlySet<string> | undefined,
  dismissedIds: ReadonlySet<string> | undefined,
) {
  const eligible = players.filter(
    (player) =>
      isGoalkeeperPosition(player.position) && !dismissedIds?.has(player.id),
  );
  return (
    eligible.find((player) => onPitchIds?.has(player.id)) ?? eligible[0] ?? null
  );
}

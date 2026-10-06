import { apiFetch } from "@/lib/api";

/** FIFA-style defensive approaches, most passive → most aggressive. */
export type DefensiveStyle =
  | "drop_back"
  | "balanced"
  | "pressure_on_heavy_touch"
  | "press_after_possession_loss"
  | "constant_pressure";

/** FIFA-style offensive approaches. */
export type OffensiveStyle =
  | "possession"
  | "balanced"
  | "fast_build_up"
  | "long_ball";

/**
 * Per-player instruction overrides, keyed by athlete ID and then by instruction
 * category ID (e.g. `{ "<athlete>": { "positioning_freedom": "free_roam" } }`).
 *
 * Only what a coach has changed is stored; a category the player is not listed
 * under means they are on the default for the position they are playing. The
 * registry that gives these IDs meaning lives in
 * `@/features/team-tactics/instructions`.
 */
export type GamePlanPlayerInstructions = Record<
  string,
  Record<string, string>
>;

export interface GamePlanFormationPosition {
  id: string;
  label: string;
  role: "GK" | "DEF" | "MID" | "FWD";
  x: number;
  y: number;
}

/**
 * A named matchday plan for a team, modeled on FIFA 20's Custom Tactics. One
 * record holds both halves of the plan — the squad selection (formation,
 * starting lineup, bench) and the tactical settings. Names are unique per team.
 */
export interface BackendGamePlan {
  id: string;
  teamId: string;
  name: string;
  formationId: string;
  /** Maps formation position IDs to athlete IDs (or null for an empty slot). */
  assignments: Record<string, string | null>;
  /** Coach-defined position slots when `formationId` is a custom formation. */
  customPositions: GamePlanFormationPosition[] | null;
  /** Athlete IDs on the substitutes bench. */
  substituteIds: string[];
  defensiveStyle: DefensiveStyle;
  defensiveWidth: number;
  defensiveDepth: number;
  offensiveStyle: OffensiveStyle;
  offensiveWidth: number;
  playersInBox: number;
  cornersCommitment: number;
  freeKicksCommitment: number;
  /**
   * Set-piece and leadership roles, one athlete each. `freeKickTakerId` is the
   * short free kick and `cornerTakerId` the left corner — both predate the
   * split into near/far takers and kept their names so saved plans carry their
   * taker over.
   */
  captainId: string | null;
  freeKickTakerId: string | null;
  longFreeKickTakerId: string | null;
  penaltyTakerId: string | null;
  cornerTakerId: string | null;
  rightCornerTakerId: string | null;
  /** Per-player instructions chosen for this plan; see the type's own note. */
  playerInstructions: GamePlanPlayerInstructions;
  createdAt: string;
  updatedAt: string;
}

/** The editable content of a game plan (everything except identity/timestamps). */
export type GamePlanContent = Omit<
  BackendGamePlan,
  "id" | "teamId" | "name" | "createdAt" | "updatedAt"
>;

/** Immutable tactical state captured when a match is started. */
export interface GamePlanSnapshot
  extends Omit<GamePlanContent, "playerInstructions"> {
  name: string;
  /** Absent on snapshots taken before player instructions existed. */
  playerInstructions?: GamePlanPlayerInstructions;
}

/** The squad half of a game plan — what the tactical board edits. */
export type GamePlanSquad = Pick<
  GamePlanContent,
  "formationId" | "assignments" | "customPositions" | "substituteIds"
>;

/** The tactics half of a game plan — what the Tactics and Roles tabs edit. */
export type GamePlanTactics = Omit<GamePlanContent, keyof GamePlanSquad>;

/** Fields accepted by POST /game-plans. */
export interface CreateGamePlanInput extends Partial<GamePlanContent> {
  name: string;
}

/** Fields accepted by PATCH /game-plans/:id. */
export type UpdateGamePlanInput = Partial<CreateGamePlanInput>;

const GAME_PLANS_PATH = "/game-plans";

/** Lists all game plans saved for the team, most recently updated first. */
export async function getGamePlans(): Promise<BackendGamePlan[]> {
  return apiFetch<BackendGamePlan[]>(GAME_PLANS_PATH);
}

export async function getGamePlan(id: string): Promise<BackendGamePlan> {
  return apiFetch<BackendGamePlan>(`${GAME_PLANS_PATH}/${id}`);
}

export async function createGamePlan(
  input: CreateGamePlanInput,
): Promise<BackendGamePlan> {
  return apiFetch<BackendGamePlan>(GAME_PLANS_PATH, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateGamePlan(
  id: string,
  input: UpdateGamePlanInput,
): Promise<BackendGamePlan> {
  return apiFetch<BackendGamePlan>(`${GAME_PLANS_PATH}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteGamePlan(id: string): Promise<BackendGamePlan> {
  return apiFetch<BackendGamePlan>(`${GAME_PLANS_PATH}/${id}`, {
    method: "DELETE",
  });
}

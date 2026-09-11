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
 * A named matchday plan for a team, modeled on FIFA 20's Custom Tactics. One
 * record holds both halves of the plan — the squad selection (formation,
 * starting XI, bench) and the tactical settings. Names are unique per team.
 */
export interface BackendGamePlan {
  id: string;
  teamId: string;
  name: string;
  formationId: string;
  /** Maps formation position IDs to athlete IDs (or null for an empty slot). */
  assignments: Record<string, string | null>;
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
  captainId: string | null;
  freeKickTakerId: string | null;
  penaltyTakerId: string | null;
  cornerTakerId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The editable content of a game plan (everything except identity/timestamps). */
export type GamePlanContent = Omit<
  BackendGamePlan,
  "id" | "teamId" | "name" | "createdAt" | "updatedAt"
>;

/** Immutable tactical state captured when a match is started. */
export interface GamePlanSnapshot extends GamePlanContent {
  name: string;
}

/** The squad half of a game plan — what the tactical board edits. */
export type GamePlanSquad = Pick<
  GamePlanContent,
  "formationId" | "assignments" | "substituteIds"
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

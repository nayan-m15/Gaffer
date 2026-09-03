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
 * A named tactical profile ("game plan") for a team, modeled on FIFA 20's
 * Custom Tactics. Names are unique per team.
 */
export interface BackendGamePlan {
  id: string;
  teamId: string;
  name: string;
  formationId: string;
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

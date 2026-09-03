import { z } from 'zod';

/** FIFA-style defensive approaches, most passive → most aggressive. */
export const DEFENSIVE_STYLES = [
  'drop_back',
  'balanced',
  'pressure_on_heavy_touch',
  'press_after_possession_loss',
  'constant_pressure',
] as const;

/** FIFA-style offensive approaches. */
export const OFFENSIVE_STYLES = [
  'possession',
  'balanced',
  'fast_build_up',
  'long_ball',
] as const;

/** Integer slider on a 1–10 scale (defensive/offensive width, depth). */
const scaleTen = z.number().int().min(1).max(10);

/** Integer slider on a 0–10 commitment scale (players in box, set pieces). */
const commitment = z.number().int().min(0).max(10);

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Game plan name is required.')
  .max(100, 'Game plan name must be 100 characters or fewer.');

const gamePlanContentSchema = z.object({
  formationId: z.string().trim().min(1, 'Formation is required.'),
  defensiveStyle: z.enum(DEFENSIVE_STYLES),
  defensiveWidth: scaleTen,
  defensiveDepth: scaleTen,
  offensiveStyle: z.enum(OFFENSIVE_STYLES),
  offensiveWidth: scaleTen,
  playersInBox: commitment,
  cornersCommitment: commitment,
  freeKicksCommitment: commitment,
  captainId: z.string().uuid().nullable(),
  freeKickTakerId: z.string().uuid().nullable(),
  penaltyTakerId: z.string().uuid().nullable(),
  cornerTakerId: z.string().uuid().nullable(),
});

export const createGamePlanSchema = gamePlanContentSchema.partial().extend({
  name: nameSchema,
});

export type CreateGamePlanDto = z.infer<typeof createGamePlanSchema>;

export const updateGamePlanSchema = gamePlanContentSchema
  .partial()
  .extend({ name: nameSchema.optional() });

export type UpdateGamePlanDto = z.infer<typeof updateGamePlanSchema>;

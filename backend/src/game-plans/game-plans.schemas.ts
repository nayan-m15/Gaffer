import { z } from 'zod';
import { FORMATION_IDS } from '../common/formations';

export { FORMATION_IDS } from '../common/formations';

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

const customPositionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(20),
  role: z.enum(['GK', 'DEF', 'MID', 'FWD']),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

/**
 * Per-player instructions: athlete ID -> category ID -> option ID. The IDs are
 * checked against the registry in `player-instructions.ts` once the plan's
 * formation is known; this schema only enforces the shape and keeps a payload
 * from growing without bound.
 */
const instructionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9_]+$/, 'Instruction IDs must be lower-case identifiers.');

const playerInstructionsSchema = z
  .record(
    z.string().uuid(),
    z
      .record(instructionIdSchema, instructionIdSchema)
      .refine((entries) => Object.keys(entries).length <= 12, {
        message: 'A player may hold at most 12 instructions.',
      }),
  )
  .refine((entries) => Object.keys(entries).length <= 60, {
    message: 'Player instructions may cover at most 60 athletes.',
  });

const gamePlanContentSchema = z.object({
  formationId: z.enum(FORMATION_IDS, { error: 'Formation is not supported.' }),
  // Squad selection — position ID -> athlete ID (or null for an empty slot).
  assignments: z.record(z.string(), z.string().uuid().nullable()).refine(
    (assignments) => {
      const ids = Object.values(assignments).filter(
        (id): id is string => id !== null,
      );
      return ids.length <= 11 && new Set(ids).size === ids.length;
    },
    { message: 'A starting lineup must contain unique athletes.' },
  ),
  customPositions: z.array(customPositionSchema).max(11).nullable(),
  substituteIds: z
    .array(z.string().uuid())
    .max(15, 'Maximum 15 substitutes allowed.')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Substitutes must be unique athletes.',
    }),
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
  longFreeKickTakerId: z.string().uuid().nullable(),
  penaltyTakerId: z.string().uuid().nullable(),
  cornerTakerId: z.string().uuid().nullable(),
  rightCornerTakerId: z.string().uuid().nullable(),
  playerInstructions: playerInstructionsSchema,
});

/**
 * A player may never be on the pitch and on the bench at once. Applied to both
 * create and update, where either half of the squad may be absent from the
 * payload — in that case there is nothing to cross-check.
 */
function squadIsConsistent(value: {
  assignments?: Record<string, string | null>;
  substituteIds?: string[];
}): boolean {
  if (!value.assignments || !value.substituteIds) return true;

  const startingIds = new Set(
    Object.values(value.assignments).filter(
      (id): id is string => typeof id === 'string',
    ),
  );

  return !value.substituteIds.some((subId) => startingIds.has(subId));
}

const SQUAD_CONFLICT_MESSAGE =
  'An athlete cannot be in both the starting lineup and substitutes.';

export const createGamePlanSchema = gamePlanContentSchema
  .partial()
  .extend({ name: nameSchema })
  .refine(squadIsConsistent, { message: SQUAD_CONFLICT_MESSAGE });

export type CreateGamePlanDto = z.infer<typeof createGamePlanSchema>;

export const updateGamePlanSchema = gamePlanContentSchema
  .partial()
  .extend({ name: nameSchema.optional() })
  .refine(squadIsConsistent, { message: SQUAD_CONFLICT_MESSAGE });

export type UpdateGamePlanDto = z.infer<typeof updateGamePlanSchema>;

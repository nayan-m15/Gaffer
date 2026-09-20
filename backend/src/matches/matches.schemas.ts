import { z } from 'zod';
import { matchEventTeam, matchEventType } from '../database/schema';

export const matchEventTeamSchema = z.enum(matchEventTeam.enumValues);
export const matchEventTypeSchema = z.enum(matchEventType.enumValues);

/**
 * Penalty outcome is stored on the existing `event_type` + `detail` columns
 * (same shape the live logger writes). A scored penalty is a `goal` with
 * detail "Penalty" so it counts in score and stats; a miss stays `penalty`
 * with detail "Penalty missed".
 */
export const PENALTY_SCORED_DETAIL = 'Penalty';
export const PENALTY_MISSED_DETAIL = 'Penalty missed';

export const createMatchLogEventSchema = z
  .object({
    clientRequestId: z.uuid(),
    deviceId: z.uuid().optional(),
    clientCreatedAt: z.iso.datetime().optional(),
    period: z
      .enum([
        'not_started',
        'first_half',
        'half_time',
        'second_half',
        'full_time',
      ])
      .optional(),
    matchElapsedMs: z
      .number()
      .int()
      .min(0)
      .max(3 * 60 * 60 * 1000)
      .optional(),
    team: matchEventTeamSchema,
    eventType: matchEventTypeSchema,
    athleteId: z.uuid().optional(),
    opponentLabel: z
      .string()
      .trim()
      .min(1)
      .max(120, 'Opponent label must be 120 characters or fewer.')
      .optional(),
    opponentPlayerId: z.uuid().optional(),
    minute: z
      .number()
      .int('Minute must be a whole number.')
      .min(0, 'Minute cannot be negative.')
      .max(150, 'Minute must be 150 or fewer.'),
    detail: z
      .string()
      .trim()
      .max(500, 'Detail must be 500 characters or fewer.')
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.team === 'own' &&
      (value.opponentPlayerId || value.opponentLabel)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Own-team events cannot reference an opponent.',
      });
    }
    if (value.team === 'opponent' && value.athleteId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Opponent events cannot reference a team athlete.',
      });
    }
    if (
      value.eventType === 'substitution' &&
      (value.team === 'own' || value.opponentPlayerId) &&
      !z.uuid().safeParse(value.detail).success
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['detail'],
        message: 'An incoming squad player is required.',
      });
    }
    if (
      value.eventType === 'penalty' &&
      value.detail === PENALTY_SCORED_DETAIL
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: 'A scored penalty must be saved as a goal.',
      });
    }
    if (value.eventType === 'goal' && value.detail === PENALTY_MISSED_DETAIL) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: 'A missed penalty cannot be saved as a goal.',
      });
    }
  });
export type CreateMatchLogEventDto = z.infer<typeof createMatchLogEventSchema>;

export const resolveMatchEventReviewSchema = z.object({
  resolution: z.enum(['same_event', 'separate_events']),
});
export type ResolveMatchEventReviewDto = z.infer<
  typeof resolveMatchEventReviewSchema
>;

export const finaliseMatchProjectionSchema = z.object({
  expectedRevision: z.number().int().min(1),
});

export const reopenMatchProjectionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const updateMatchLogEventSchema = z
  .object({
    athleteId: z.uuid().nullable().optional(),
    opponentLabel: z
      .string()
      .trim()
      .min(1)
      .max(120, 'Opponent label must be 120 characters or fewer.')
      .nullable()
      .optional(),
    opponentPlayerId: z.uuid().nullable().optional(),
    minute: z
      .number()
      .int('Minute must be a whole number.')
      .min(0, 'Minute cannot be negative.')
      .max(150, 'Minute must be 150 or fewer.')
      .optional(),
    eventType: matchEventTypeSchema.optional(),
    detail: z
      .string()
      .trim()
      .max(500, 'Detail must be 500 characters or fewer.')
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      value.athleteId !== undefined ||
      value.opponentLabel !== undefined ||
      value.opponentPlayerId !== undefined ||
      value.minute !== undefined ||
      value.eventType !== undefined ||
      value.detail !== undefined,
    {
      message: 'At least one field is required.',
    },
  )
  .superRefine((value, ctx) => {
    if (
      value.eventType === 'penalty' &&
      value.detail === PENALTY_SCORED_DETAIL
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: 'A scored penalty must be saved as a goal.',
      });
    }
    if (value.eventType === 'goal' && value.detail === PENALTY_MISSED_DETAIL) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: 'A missed penalty cannot be saved as a goal.',
      });
    }
  });
export type UpdateMatchLogEventDto = z.infer<typeof updateMatchLogEventSchema>;

export const matchClockPeriodSchema = z.enum([
  'not_started',
  'first_half',
  'half_time',
  'second_half',
  'full_time',
]);

export const updateMatchClockSchema = z.object({
  period: matchClockPeriodSchema,
  running: z.boolean(),
  elapsedMs: z
    .number()
    .int()
    .min(0)
    .max(3 * 60 * 60 * 1000),
});
export type UpdateMatchClockDto = z.infer<typeof updateMatchClockSchema>;

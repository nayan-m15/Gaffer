import { z } from 'zod';
import { matchEventTeam, matchEventType } from '../database/schema';
import { FORMATION_IDS } from '../common/formations';
import {
  DEFENSIVE_STYLES,
  OFFENSIVE_STYLES,
} from '../game-plans/game-plans.schemas';

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

const scaleTen = z.number().int().min(1).max(10);
const commitment = z.number().int().min(0).max(10);

/**
 * What a `tactical_change` event carries: the parts of the game plan the coach
 * switched to at that minute, and nothing else. Folding these over the match's
 * starting plan gives the shape in force at any point in the timeline, so the
 * plan the match kicked off with is never overwritten.
 *
 * Every field is optional because the event records a delta; `superRefine`
 * below rejects an empty one.
 */
export const matchTacticalChangeSchema = z
  .object({
    formationId: z.enum(FORMATION_IDS).optional(),
    customPositions: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          role: z.enum(['GK', 'DEF', 'MID', 'FWD']),
          x: z.number().min(0).max(100),
          y: z.number().min(0).max(100),
        }),
      )
      .max(11)
      .nullable()
      .optional(),
    defensiveStyle: z.enum(DEFENSIVE_STYLES).optional(),
    defensiveWidth: scaleTen.optional(),
    defensiveDepth: scaleTen.optional(),
    offensiveStyle: z.enum(OFFENSIVE_STYLES).optional(),
    offensiveWidth: scaleTen.optional(),
    playersInBox: commitment.optional(),
    cornersCommitment: commitment.optional(),
    freeKicksCommitment: commitment.optional(),
    // Roles may move during a match — the armband passes with no ceremony.
    captainId: z.uuid().nullable().optional(),
    freeKickTakerId: z.uuid().nullable().optional(),
    longFreeKickTakerId: z.uuid().nullable().optional(),
    penaltyTakerId: z.uuid().nullable().optional(),
    cornerTakerId: z.uuid().nullable().optional(),
    rightCornerTakerId: z.uuid().nullable().optional(),
  })
  .strict();
export type MatchTacticalChangeDto = z.infer<typeof matchTacticalChangeSchema>;

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
    tacticalChange: matchTacticalChangeSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.eventType === 'tactical_change') {
      if (value.team !== 'own') {
        ctx.addIssue({
          code: 'custom',
          path: ['team'],
          message: 'A tactical change can only be logged for your own team.',
        });
      }
      if (value.athleteId) {
        ctx.addIssue({
          code: 'custom',
          path: ['athleteId'],
          message: 'A tactical change is not attributed to a player.',
        });
      }
      if (
        !value.tacticalChange ||
        Object.keys(value.tacticalChange).length === 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['tacticalChange'],
          message: 'A tactical change must alter at least one setting.',
        });
      }
    } else if (value.tacticalChange) {
      ctx.addIssue({
        code: 'custom',
        path: ['tacticalChange'],
        message: 'Only a tactical_change event may carry tactical settings.',
      });
    }
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
  explanation: z.string().trim().max(500).optional(),
});
export const resolveMatchEventReviewRequestSchema =
  resolveMatchEventReviewSchema.extend({
    operationId: z.uuid().optional(),
    causalParentIds: z.array(z.uuid()).max(50).default([]),
  });
export type ResolveMatchEventReviewDto = z.infer<
  typeof resolveMatchEventReviewSchema
>;

export const finaliseMatchProjectionSchema = z.object({
  expectedRevision: z.number().int().min(1),
  expectedSessionRevision: z.number().int().min(1).optional(),
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
  operationId: z.uuid().optional(),
  baseRevision: z.number().int().min(0).default(0),
  clientCreatedAt: z.iso.datetime().optional(),
  period: matchClockPeriodSchema,
  running: z.boolean(),
  elapsedMs: z
    .number()
    .int()
    .min(0)
    .max(3 * 60 * 60 * 1000),
});
export type UpdateMatchClockDto = z.infer<typeof updateMatchClockSchema>;

export const requestMatchAmendmentSchema = z.discriminatedUnion('action', [
  z.object({
    id: z.uuid(),
    expectedSessionRevision: z.number().int().min(1),
    action: z.literal('add'),
    reason: z.string().trim().min(3).max(500),
    replacement: createMatchLogEventSchema,
  }),
  z.object({
    id: z.uuid(),
    expectedSessionRevision: z.number().int().min(1),
    action: z.literal('correct'),
    reason: z.string().trim().min(3).max(500),
    canonicalEventId: z.uuid(),
    replacement: updateMatchLogEventSchema,
  }),
  z.object({
    id: z.uuid(),
    expectedSessionRevision: z.number().int().min(1),
    action: z.literal('void'),
    reason: z.string().trim().min(3).max(500),
    canonicalEventId: z.uuid(),
  }),
]);
export type RequestMatchAmendmentDto = z.infer<
  typeof requestMatchAmendmentSchema
>;
export const respondMatchAmendmentSchema = z
  .object({
    response: z.enum(['approve', 'reject', 'request_changes', 'withdraw']),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine(
    (value) =>
      value.response === 'approve' ||
      value.response === 'withdraw' ||
      Boolean(value.reason),
    {
      message: 'Explain why this amendment needs changes or was rejected.',
      path: ['reason'],
    },
  );

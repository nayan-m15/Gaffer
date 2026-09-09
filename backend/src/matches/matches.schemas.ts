import { z } from 'zod';
import { matchEventTeam, matchEventType } from '../database/schema';

export const matchEventTeamSchema = z.enum(matchEventTeam.enumValues);
export const matchEventTypeSchema = z.enum(matchEventType.enumValues);

export const createMatchLogEventSchema = z.object({
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
});
export type CreateMatchLogEventDto = z.infer<typeof createMatchLogEventSchema>;

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
  );
export type UpdateMatchLogEventDto = z.infer<typeof updateMatchLogEventSchema>;

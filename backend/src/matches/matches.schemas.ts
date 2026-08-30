import { z } from 'zod';
import { matchEventTeam, matchEventType } from '../database/schema';

export const matchEventTeamSchema = z.enum(matchEventTeam.enumValues);
export const matchEventTypeSchema = z.enum(matchEventType.enumValues);

export const createMatchLogEventSchema = z.object({
  team: matchEventTeamSchema,
  eventType: matchEventTypeSchema,
  athleteId: z.uuid().optional(),
  opponentLabel: z.string().trim().min(1).optional(),
  minute: z.number().int().min(0, 'Minute cannot be negative.'),
  detail: z.string().trim().optional(),
});
export type CreateMatchLogEventDto = z.infer<typeof createMatchLogEventSchema>;

export const updateMatchLogEventSchema = z
  .object({
    athleteId: z.uuid().nullable().optional(),
    opponentLabel: z.string().trim().min(1).nullable().optional(),
    minute: z.number().int().min(0, 'Minute cannot be negative.').optional(),
    eventType: matchEventTypeSchema.optional(),
    detail: z.string().trim().nullable().optional(),
  })
  .refine(
    (value) =>
      value.athleteId !== undefined ||
      value.opponentLabel !== undefined ||
      value.minute !== undefined ||
      value.eventType !== undefined ||
      value.detail !== undefined,
    {
      message: 'At least one field is required.',
    },
  );
export type UpdateMatchLogEventDto = z.infer<typeof updateMatchLogEventSchema>;

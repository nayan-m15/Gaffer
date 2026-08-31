import { z } from 'zod';
import { eventStatus, eventType } from '../database/schema';

export const eventTypeSchema = z.enum(eventType.enumValues);
export const eventStatusSchema = z.enum(eventStatus.enumValues);

export const createEventSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.'),
  type: eventTypeSchema,
  scheduledAt: z.iso.datetime({
    offset: true,
    error: 'Enter a valid date and time.',
  }),
  location: z.string().trim().min(1, 'Location is required.'),
  notes: z.string().trim().optional(),
});
export type CreateEventDto = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema
  .partial()
  .extend({
    status: eventStatusSchema.optional(),
    notes: z.string().trim().nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'At least one field is required.',
    },
  );
export type UpdateEventDto = z.infer<typeof updateEventSchema>;

export const startMatchSchema = z.object({
  opponentName: z.string().trim().min(1, 'Opponent name is required.'),
  isHome: z.boolean(),
  startingAthleteIds: z
    .array(z.uuid())
    .length(11, 'A starting XI must contain exactly 11 athletes.')
    .refine((ids) => new Set(ids).size === 11, {
      message: 'Starting athletes must be unique.',
    }),
});
export type StartMatchDto = z.infer<typeof startMatchSchema>;

import { z } from 'zod';
import { eventStatus, eventType, rsvpStatus } from '../database/schema';

export const eventTypeSchema = z.enum(eventType.enumValues);
export const eventStatusSchema = z.enum(eventStatus.enumValues);

export const createEventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required.')
    .max(150, 'Title must be 150 characters or fewer.'),
  type: eventTypeSchema,
  scheduledAt: z.iso.datetime({
    offset: true,
    error: 'Enter a valid date and time.',
  }),
  location: z
    .string()
    .trim()
    .min(1, 'Location is required.')
    .max(200, 'Location must be 200 characters or fewer.'),
  notes: z
    .string()
    .trim()
    .max(2000, 'Notes must be 2000 characters or fewer.')
    .optional(),
});
export type CreateEventDto = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema
  .partial()
  .extend({
    status: eventStatusSchema.optional(),
    notes: z
      .string()
      .trim()
      .max(2000, 'Notes must be 2000 characters or fewer.')
      .nullable()
      .optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'At least one field is required.',
    },
  );
export type UpdateEventDto = z.infer<typeof updateEventSchema>;

export const startMatchSchema = z.object({
  opponentName: z
    .string()
    .trim()
    .min(1, 'Opponent name is required.')
    .max(100, 'Opponent name must be 100 characters or fewer.'),
  isHome: z.boolean(),
  startingAthleteIds: z
    .array(z.uuid())
    .length(11, 'A starting XI must contain exactly 11 athletes.')
    .refine((ids) => new Set(ids).size === 11, {
      message: 'Starting athletes must be unique.',
    }),
});
export type StartMatchDto = z.infer<typeof startMatchSchema>;

export const rsvpStatusSchema = z.enum(rsvpStatus.enumValues, {
  error: 'RSVP status must be one of: going, not_going, maybe.',
});

export const createRsvpSchema = z.object({
  status: rsvpStatusSchema,
  note: z
    .string()
    .trim()
    .max(280, 'Note must be 280 characters or fewer.')
    .optional(),
});
export type CreateRsvpDto = z.infer<typeof createRsvpSchema>;

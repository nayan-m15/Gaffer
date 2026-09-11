import { z } from 'zod';
import { athleteStatus } from '../database/schema';

export const athleteStatusSchema = z.enum(athleteStatus.enumValues, {
  error: 'Status must be one of: available, injured, suspended.',
});

export const createAthleteSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required.')
    .max(60, 'First name must be 60 characters or fewer.'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required.')
    .max(60, 'Last name must be 60 characters or fewer.'),
  dateOfBirth: z
    .string()
    .date('Date of birth must be a valid date.')
    .refine(
      (val) => !val || new Date(val) <= new Date(),
      'Date of birth cannot be in the future.',
    )
    .optional(),
  position: z
    .string()
    .trim()
    .min(1, 'Position is required.')
    .max(50, 'Position must be 50 characters or fewer.')
    .optional(),
  squadNumber: z
    .number()
    .int('Squad number must be a whole number.')
    .min(1, 'Squad number must be between 1 and 99.')
    .max(99, 'Squad number must be between 1 and 99.')
    .optional(),
  status: athleteStatusSchema.optional(),
});

export type CreateAthleteDto = z.infer<typeof createAthleteSchema>;

export const updateAthleteSchema = createAthleteSchema
  .partial()
  .extend({
    dateOfBirth: createAthleteSchema.shape.dateOfBirth
      .unwrap()
      .nullable()
      .optional(),
    position: createAthleteSchema.shape.position.unwrap().nullable().optional(),
    squadNumber: createAthleteSchema.shape.squadNumber
      .unwrap()
      .nullable()
      .optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    { message: 'At least one field is required.' },
  );

export type UpdateAthleteDto = z.infer<typeof updateAthleteSchema>;

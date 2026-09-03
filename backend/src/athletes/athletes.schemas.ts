import { z } from 'zod';

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
});

export type CreateAthleteDto = z.infer<typeof createAthleteSchema>;

export const updateAthleteSchema = createAthleteSchema.partial();

export type UpdateAthleteDto = z.infer<typeof updateAthleteSchema>;

import { z } from 'zod';

export const createAthleteSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
  dateOfBirth: z
    .string()
    .date('Date of birth must be a valid date.')
    .optional(),
  position: z.string().trim().min(1, 'Position is required.').optional(),
  squadNumber: z
    .number()
    .int('Squad number must be a whole number.')
    .positive('Squad number must be greater than 0.')
    .optional(),
});

export type CreateAthleteDto = z.infer<typeof createAthleteSchema>;

export const updateAthleteSchema = createAthleteSchema.partial();

export type UpdateAthleteDto = z.infer<typeof updateAthleteSchema>;

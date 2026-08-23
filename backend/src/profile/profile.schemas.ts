import { z } from 'zod';

/**
 * PATCH /profile — editable personal-profile fields.
 *
 * `name` is always required. The remaining fields are nullable so the client
 * can explicitly clear them by sending `null`. Fields the user cannot change
 * (email, role, team membership, auth credentials, timestamps) are absent
 * from the schema and therefore silently ignored by Zod's default strip
 * behaviour — they can never be patched through this endpoint.
 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(100, 'Name must be 100 characters or fewer.'),
  phoneNumber: z
    .string()
    .trim()
    .max(30, 'Phone number must be 30 characters or fewer.')
    .nullable(),
  sex: z.enum(['male', 'female', 'prefer_not_to_say']).nullable(),
  dateOfBirth: z
    .string()
    .date('Date of birth must be a valid date.')
    .nullable()
    .refine(
      (val) => !val || new Date(val) <= new Date(),
      'Date of birth cannot be in the future.',
    ),
});

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

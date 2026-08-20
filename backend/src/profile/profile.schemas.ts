import { z } from 'zod';

/** PATCH /profile — only name is editable in Sprint 1. */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(100, 'Name must be 100 characters or fewer.'),
});

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Team name is required.')
    .max(100, 'Team name must be 100 characters or fewer.'),
});
export type CreateTeamDto = z.infer<typeof createTeamSchema>;
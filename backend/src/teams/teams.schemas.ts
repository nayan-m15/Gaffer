import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Team name is required.'),
});
export type CreateTeamDto = z.infer<typeof createTeamSchema>;
import { z } from 'zod';
import { competitionType } from '../database/schema';

export const competitionTypeSchema = z.enum(competitionType.enumValues);

export const createCompetitionSchema = z.object({
  name: z.string().trim().min(1, 'Competition name is required.'),
  type: competitionTypeSchema,
  season: z.string().trim().optional(),
});
export type CreateCompetitionDto = z.infer<typeof createCompetitionSchema>;

export const updateCompetitionSchema = createCompetitionSchema
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required.',
  });
export type UpdateCompetitionDto = z.infer<typeof updateCompetitionSchema>;

export const createStandingSchema = z.object({
  teamName: z.string().trim().min(1, 'Team name is required.'),
  position: z
    .number()
    .int('Position must be a whole number.')
    .positive('Position must be greater than 0.'),
  played: z.number().int().min(0).default(0),
  won: z.number().int().min(0).default(0),
  drawn: z.number().int().min(0).default(0),
  lost: z.number().int().min(0).default(0),
  goalsFor: z.number().int().min(0).default(0),
  goalsAgainst: z.number().int().min(0).default(0),
  points: z.number().int().min(0).default(0),
  isOwnTeam: z.boolean().default(false),
});
export type CreateStandingDto = z.infer<typeof createStandingSchema>;

export const updateStandingSchema = createStandingSchema
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required.',
  });
export type UpdateStandingDto = z.infer<typeof updateStandingSchema>;

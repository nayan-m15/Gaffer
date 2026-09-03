import { z } from 'zod';
import { competitionType } from '../database/schema';

export const competitionTypeSchema = z.enum(competitionType.enumValues);

export const createCompetitionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Competition name is required.')
    .max(100, 'Competition name must be 100 characters or fewer.'),
  type: competitionTypeSchema,
  season: z
    .string()
    .trim()
    .max(20, 'Season must be 20 characters or fewer.')
    .optional(),
});
export type CreateCompetitionDto = z.infer<typeof createCompetitionSchema>;

export const updateCompetitionSchema = createCompetitionSchema
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required.',
  });
export type UpdateCompetitionDto = z.infer<typeof updateCompetitionSchema>;

const standingFields = {
  teamName: z
    .string()
    .trim()
    .min(1, 'Team name is required.')
    .max(100, 'Team name must be 100 characters or fewer.'),
  position: z
    .number()
    .int('Position must be a whole number.')
    .min(1, 'Position must be between 1 and 100.')
    .max(100, 'Position must be between 1 and 100.'),
  played: z
    .number()
    .int('Played must be a whole number.')
    .min(0, 'Played cannot be negative.')
    .max(100, 'Played cannot exceed 100.')
    .default(0),
  won: z
    .number()
    .int('Won must be a whole number.')
    .min(0, 'Won cannot be negative.')
    .max(100, 'Won cannot exceed 100.')
    .default(0),
  drawn: z
    .number()
    .int('Drawn must be a whole number.')
    .min(0, 'Drawn cannot be negative.')
    .max(100, 'Drawn cannot exceed 100.')
    .default(0),
  lost: z
    .number()
    .int('Lost must be a whole number.')
    .min(0, 'Lost cannot be negative.')
    .max(100, 'Lost cannot exceed 100.')
    .default(0),
  goalsFor: z
    .number()
    .int('Goals for must be a whole number.')
    .min(0, 'Goals for cannot be negative.')
    .max(500, 'Goals for cannot exceed 500.')
    .default(0),
  goalsAgainst: z
    .number()
    .int('Goals against must be a whole number.')
    .min(0, 'Goals against cannot be negative.')
    .max(500, 'Goals against cannot exceed 500.')
    .default(0),
  points: z
    .number()
    .int('Points must be a whole number.')
    .min(0, 'Points cannot be negative.')
    .max(300, 'Points cannot exceed 300.')
    .default(0),
  isOwnTeam: z.boolean().default(false),
};

export const createStandingSchema = z
  .object(standingFields)
  .refine(
    (data) => data.played === data.won + data.drawn + data.lost,
    {
      message: 'Played matches must equal Won + Drawn + Lost.',
    },
  )
  .refine(
    (data) => data.points === data.won * 3 + data.drawn,
    {
      message: 'Points must equal (Won × 3) + Drawn.',
    },
  );
export type CreateStandingDto = z.infer<typeof createStandingSchema>;

export const updateStandingSchema = z
  .object({
    teamName: standingFields.teamName.optional(),
    position: standingFields.position.optional(),
    played: standingFields.played.optional(),
    won: standingFields.won.optional(),
    drawn: standingFields.drawn.optional(),
    lost: standingFields.lost.optional(),
    goalsFor: standingFields.goalsFor.optional(),
    goalsAgainst: standingFields.goalsAgainst.optional(),
    points: standingFields.points.optional(),
    isOwnTeam: standingFields.isOwnTeam.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required.',
  });
export type UpdateStandingDto = z.infer<typeof updateStandingSchema>;

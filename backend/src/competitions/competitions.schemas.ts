import { z } from 'zod';
import { competitionType } from '../database/schema';

export const competitionTypeSchema = z.enum(competitionType.enumValues);
export const sharedCompetitionTypeSchema = z.enum(['league', 'cup']);

const competitionNameField = z
  .string()
  .trim()
  .min(1, 'Competition name is required.')
  .max(100, 'Competition name must be 100 characters or fewer.');

const seasonLabelField = z
  .string()
  .trim()
  .max(20, 'Season must be 20 characters or fewer.')
  .optional();

export const createCompetitionSchema = z.object({
  name: competitionNameField,
  type: sharedCompetitionTypeSchema,
  season: seasonLabelField,
});
export type CreateCompetitionDto = z.infer<typeof createCompetitionSchema>;

export const updateCompetitionSchema = createCompetitionSchema
  .partial()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'At least one field is required.',
    },
  );
export type UpdateCompetitionDto = z.infer<typeof updateCompetitionSchema>;

export const competitionSearchSchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'Enter a search term.')
    .max(100, 'Search term must be 100 characters or fewer.'),
});
export type CompetitionSearchDto = z.infer<typeof competitionSearchSchema>;

// A participant slot added by the competition admin. Only the display name is
// supplied at this stage — the slot stays unlinked until an invitation is
// accepted (Stage 2).
export const createCompetitionTeamSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Team name is required.')
    .max(100, 'Team name must be 100 characters or fewer.'),
});
export type CreateCompetitionTeamDto = z.infer<
  typeof createCompetitionTeamSchema
>;

const competitionScoreField = z
  .number()
  .int('Score must be a whole number.')
  .min(0, 'Score cannot be negative.')
  .max(99, 'Score must be 99 or less.');

export const createCompetitionResultSchema = z
  .object({
    homeCompetitionTeamId: z.uuid(),
    awayCompetitionTeamId: z.uuid(),
    homeScore: competitionScoreField,
    awayScore: competitionScoreField,
    playedAt: z.iso.datetime({
      offset: true,
      error: 'Enter a valid match date and time.',
    }),
  })
  .refine(
    (value) => value.homeCompetitionTeamId !== value.awayCompetitionTeamId,
    {
      message: 'Home and away teams must be different.',
      path: ['awayCompetitionTeamId'],
    },
  );
export type CreateCompetitionResultDto = z.infer<
  typeof createCompetitionResultSchema
>;

export const updateCompetitionResultSchema = createCompetitionResultSchema;
export type UpdateCompetitionResultDto = z.infer<
  typeof updateCompetitionResultSchema
>;

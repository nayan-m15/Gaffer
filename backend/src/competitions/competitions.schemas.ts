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
  format: z.enum(['league', 'knockout', 'league_knockout']).optional(),
  configuredTeamCount: z.number().int().min(2).max(128).optional(),
  maxSubstitutes: z.number().int().min(0).max(99).optional(),
  redCardSuspensionMatches: z.number().int().min(0).max(99).optional(),
  accumulatedYellowThreshold: z.number().int().min(1).max(99).optional(),
  yellowSuspensionMatches: z.number().int().min(0).max(99).optional(),
  startDate: z.iso.date().optional(),
  // Weekdays and kickoff use UTC, independent of the server's timezone.
  allowedPlayingDays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine(
      (days) => new Set(days).size === days.length,
      'Playing days must be unique.',
    )
    .optional(),
  defaultKickoffTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
  fixturesPerOpponent: z.union([z.literal(1), z.literal(2)]).optional(),
  pointsWin: z.number().int().min(0).max(99).optional(),
  pointsDraw: z.number().int().min(0).max(99).optional(),
  pointsLoss: z.number().int().min(0).max(99).optional(),
  qualifierCount: z
    .union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)])
    .nullable()
    .optional(),
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

export const generateFixturesSchema = z.object({
  regenerate: z.boolean().optional().default(false),
});

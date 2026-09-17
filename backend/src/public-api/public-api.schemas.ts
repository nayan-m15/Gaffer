import { z } from 'zod';

/**
 * Query shape shared by every public lookup endpoint: `?id=` narrows a list
 * down to one record. Omitting it (or passing nothing) returns the full
 * catalog; passing an empty string is a 400, since that's almost certainly
 * a client mistake rather than an intentional "no filter".
 */
export const publicResourceQuerySchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'id must not be empty when provided.')
    .optional(),
});

export type PublicResourceQuery = z.infer<typeof publicResourceQuerySchema>;

const optionalUuid = z.uuid().optional();

export const publicDashboardQuerySchema = z.object({
  teamId: optionalUuid,
  competitionId: optionalUuid,
  seasonId: optionalUuid,
});

export const publicMatchesQuerySchema = publicDashboardQuerySchema.extend({
  status: z.enum(['scheduled', 'cancelled', 'completed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const publicPlayersQuerySchema = publicDashboardQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PublicDashboardQuery = z.infer<typeof publicDashboardQuerySchema>;
export type PublicMatchesQuery = z.infer<typeof publicMatchesQuerySchema>;
export type PublicPlayersQuery = z.infer<typeof publicPlayersQuerySchema>;

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

/**
 * A player page costs more than its row count suggests: each athlete is joined
 * to every one of their `athlete_match_stats` rows, and each of those carries
 * correlated `match_events` counts, so the work scales with
 * `limit x matches per athlete`. The former ceiling of 500 therefore allowed a
 * single anonymous request to aggregate tens of thousands of event rows.
 *
 * 200 keeps the heaviest public query within the same order of magnitude as
 * `matches` above (100) while still returning a typical club's whole roster in
 * one or two pages. Over-large values are rejected rather than clamped: the
 * client pages until a short page tells it to stop
 * (`frontend/src/services/public-dashboard.ts`), so silently returning fewer
 * rows than asked for would truncate the list instead of erroring.
 */
export const publicPlayersQuerySchema = publicDashboardQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PublicDashboardQuery = z.infer<typeof publicDashboardQuerySchema>;
export type PublicMatchesQuery = z.infer<typeof publicMatchesQuerySchema>;
export type PublicPlayersQuery = z.infer<typeof publicPlayersQuerySchema>;

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

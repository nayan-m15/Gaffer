import { z } from 'zod';

const lineupContentSchema = z.object({
  formationId: z.string().trim().min(1, 'Formation is required.'),
  // Position ID -> athlete ID (or null for an empty slot).
  assignments: z.record(z.string(), z.string().uuid().nullable()),
  substituteIds: z.array(z.string().uuid()),
});

const lineupNameSchema = z
  .string()
  .trim()
  .min(1, 'Lineup name is required.')
  .max(100, 'Lineup name must be 100 characters or fewer.');

export const createLineupSchema = lineupContentSchema.extend({
  name: lineupNameSchema,
});

export type CreateLineupDto = z.infer<typeof createLineupSchema>;

export const updateLineupSchema = createLineupSchema.partial();

export type UpdateLineupDto = z.infer<typeof updateLineupSchema>;

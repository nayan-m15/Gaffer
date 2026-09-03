import { z } from 'zod';

const lineupContentSchema = z
  .object({
    formationId: z
      .string()
      .trim()
      .min(1, 'Formation is required.')
      .max(50, 'Formation ID must be 50 characters or fewer.'),
    // Position ID -> athlete ID (or null for an empty slot).
    assignments: z.record(z.string(), z.string().uuid().nullable()),
    substituteIds: z
      .array(z.string().uuid())
      .max(15, 'Maximum 15 substitutes allowed.')
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Substitutes must be unique athletes.',
      }),
  })
  .refine(
    (data) => {
      const assignedAthleteIds = new Set(
        Object.values(data.assignments).filter(
          (id): id is string => typeof id === 'string',
        ),
      );
      return !data.substituteIds.some((subId) => assignedAthleteIds.has(subId));
    },
    {
      message:
        'An athlete cannot be in both the starting lineup and substitutes.',
    },
  );

const lineupNameSchema = z
  .string()
  .trim()
  .min(1, 'Lineup name is required.')
  .max(100, 'Lineup name must be 100 characters or fewer.');

export const createLineupSchema = lineupContentSchema.and(
  z.object({
    name: lineupNameSchema,
  }),
);

export type CreateLineupDto = z.infer<typeof createLineupSchema>;

export const updateLineupSchema = z
  .object({
    name: lineupNameSchema.optional(),
    formationId: z
      .string()
      .trim()
      .min(1, 'Formation is required.')
      .max(50, 'Formation ID must be 50 characters or fewer.')
      .optional(),
    assignments: z
      .record(z.string(), z.string().uuid().nullable())
      .optional(),
    substituteIds: z
      .array(z.string().uuid())
      .max(15, 'Maximum 15 substitutes allowed.')
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Substitutes must be unique athletes.',
      })
      .optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required.',
  });

export type UpdateLineupDto = z.infer<typeof updateLineupSchema>;

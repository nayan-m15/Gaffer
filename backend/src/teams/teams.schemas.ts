import { z } from 'zod';

export const hexColorSchema = z
  .string()
  .regex(
    /^#[0-9A-Fa-f]{6}$/,
    'Colour must be a 6-digit hex value such as #1A2B3C.',
  );

export const createTeamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Team name is required.')
    .max(100, 'Team name must be 100 characters or fewer.'),
  primaryColor: hexColorSchema.optional(),
});
export type CreateTeamDto = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Team name is required.')
      .max(100, 'Team name must be 100 characters or fewer.')
      .optional(),
    primaryColor: hexColorSchema.nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'At least one field is required.',
    },
  );
export type UpdateTeamDto = z.infer<typeof updateTeamSchema>;
